const prisma = require("../prisma");
const AppError = require("../utils/apiError");

function isValidBranchId(value) {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * List audit logs with pagination, filtering, and branch-admin scope isolation.
 */
const listAuditLogs = async (query = {}, currentUser = null) => {
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "BRANCH_ADMIN") {
        throw AppError.forbidden("Only administrators can view audit logs.", "FORBIDDEN");
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {};

    if (query.actorId) {
        where.actorId = String(query.actorId).trim();
    }

    if (query.entity) {
        where.entity = String(query.entity).trim();
    }

    if (query.field) {
        where.field = String(query.field).trim();
    }

    if (query.search) {
        const searchTerm = String(query.search).trim();
        where.OR = [
            { entityId: { contains: searchTerm, mode: "insensitive" } },
            { field: { contains: searchTerm, mode: "insensitive" } },
            { oldValue: { contains: searchTerm, mode: "insensitive" } },
            { newValue: { contains: searchTerm, mode: "insensitive" } },
            { actor: { firstName: { contains: searchTerm, mode: "insensitive" } } },
            { actor: { lastName: { contains: searchTerm, mode: "insensitive" } } },
            { actor: { email: { contains: searchTerm, mode: "insensitive" } } },
        ];
    }

    if (query.fromDate || query.toDate) {
        where.timestamp = {};
        if (query.fromDate) {
            const from = new Date(query.fromDate);
            if (!isNaN(from.getTime())) where.timestamp.gte = from;
        }
        if (query.toDate) {
            const to = new Date(query.toDate);
            if (!isNaN(to.getTime())) where.timestamp.lte = to;
        }
    }

    // Branch Admin Isolation Safeguard:
    // An actor's branch membership alone must NOT expose records concerning students from another branch.
    // Branch Admin can only view logs where the entity belongs to their branch.
    if (currentUser.role === "BRANCH_ADMIN") {
        if (!isValidBranchId(currentUser.branchId)) {
            throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        const branchId = currentUser.branchId.trim();

        // Find student IDs belonging to the branch
        const branchStudents = await prisma.student.findMany({
            where: {
                OR: [
                    { assignedCounselor: { branchId } },
                    { assignedCounselorId: null, academicBackground: { path: ["branchId"], equals: branchId } },
                ],
            },
            select: { id: true },
        });
        const branchStudentIds = branchStudents.map((s) => s.id);

        // Find users belonging to the branch
        const branchUsers = await prisma.user.findMany({
            where: { branchId },
            select: { id: true },
        });
        const branchUserIds = branchUsers.map((u) => u.id);

        where.AND = where.AND || [];
        where.AND.push({
            OR: [
                { entity: "Student", entityId: { in: branchStudentIds } },
                { entity: "User", entityId: { in: branchUserIds } },
            ],
        });
    }

    const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
            where,
            include: {
                actor: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        role: true,
                        branchId: true,
                    },
                },
            },
            orderBy: { timestamp: "desc" },
            skip,
            take: limit,
        }),
    ]);

    return {
        data: logs.map((log) => ({
            id: log.id,
            actorId: log.actorId,
            actorName: log.actor
                ? `${log.actor.firstName || ""} ${log.actor.lastName || ""}`.trim() || log.actor.email
                : "System",
            actorEmail: log.actor?.email || null,
            actorRole: log.actor?.role || "SYSTEM",
            entity: log.entity,
            entityId: log.entityId,
            field: log.field,
            oldValue: log.oldValue,
            newValue: log.newValue,
            timestamp: log.timestamp,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
    };
};

module.exports = {
    listAuditLogs,
};

