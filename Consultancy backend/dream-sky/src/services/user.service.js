const prisma = require("../prisma");
const { Prisma } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const AppError = require("../utils/apiError");
const { sendStaffInvitationEmail } = require("./email.service");

const SUPER_ADMIN_STATUS_ADVISORY_LOCK = 74920491823;

const ALLOWED_STAFF_ROLES = [
    "SUPER_ADMIN",
    "BRANCH_ADMIN",
    "COUNSELOR",
    "FRONT_DESK",
    "TEACHER",
    "REFERRAL_AGENT",
];

const BRANCH_ADMIN_OPERATIONAL_ROLES = [
    "COUNSELOR",
    "FRONT_DESK",
    "TEACHER",
    "REFERRAL_AGENT",
];

const SAFE_USER_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
    role: true,
    status: true,
    branchId: true,
    branch: {
        select: {
            id: true,
            name: true,
        },
    },
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
};

function generateTempPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
}

async function generateUniqueReferralCode(tx = prisma) {
    for (let attempts = 0; attempts < 10; attempts++) {
        const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
        const code = `REF-${randomPart}`;
        const existing = await tx.referralAgentProfile.findUnique({
            where: { referralCode: code },
            select: { id: true },
        });
        if (!existing) return code;
    }
    return `REF-${Date.now().toString(36).toUpperCase()}`;
}

function isValidBranchId(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function sanitizeUserDto(u) {
    if (!u || typeof u !== "object") return u;
    const copy = { ...u };
    delete copy.passwordHash;
    delete copy.twoFactorSecret;
    delete copy.twoFactorEnabled;
    delete copy.mustChangePassword;
    delete copy.refreshTokens;
    return copy;
}

const listUsers = async (query = {}, currentUser = null) => {
    const { role, status, branchId } = query || {};
    const where = {};

    let enforcedBranchId = null;

    if (currentUser) {
        const allowedListUserRoles = ["SUPER_ADMIN", "BRANCH_ADMIN", "FRONT_DESK", "COUNSELOR", "TEACHER"];
        if (!allowedListUserRoles.includes(currentUser.role)) {
            throw AppError.forbidden(
                "Access denied. Insufficient permissions to list users.",
                "INSUFFICIENT_ROLE"
            );
        }

        if (currentUser.role === "BRANCH_ADMIN") {
            if (!isValidBranchId(currentUser.branchId)) {
                throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
            }
            // Mandatory backend branch scoping derived strictly from authenticated DB-backed user context
            enforcedBranchId = currentUser.branchId.trim();
        }
    }

    if (currentUser?.role === "BRANCH_ADMIN") {
        if (role) {
            const normalizedRole = String(role).trim().toUpperCase();
            if (!BRANCH_ADMIN_OPERATIONAL_ROLES.includes(normalizedRole)) {
                return [];
            }
            where.role = normalizedRole;
        } else {
            where.role = { in: BRANCH_ADMIN_OPERATIONAL_ROLES };
        }
    } else if (role) {
        if (String(role).toUpperCase() === "STUDENT") {
            return [];
        }
        where.role = role;
    } else {
        // Exclude student portal accounts from staff user management
        where.role = { not: "STUDENT" };
    }
    if (status) where.status = status;

    if (enforcedBranchId) {
        where.branchId = enforcedBranchId;
    } else if (branchId) {
        where.branchId = branchId;
    }

    const users = await prisma.user.findMany({
        where,
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            status: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
            referralAgentProfile: {
                select: {
                    id: true,
                    referralCode: true,
                },
            },
            counselorProfile: {
                select: {
                    id: true,
                    specialization: true,
                },
            },
            lastLoginAt: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });

    return (users || [])
        .filter((u) => {
            if (!u || u.role === "STUDENT") return false;
            if (currentUser?.role === "BRANCH_ADMIN") {
                if (!BRANCH_ADMIN_OPERATIONAL_ROLES.includes(u.role)) return false;
                return isValidBranchId(u.branchId) && u.branchId.trim() === enforcedBranchId;
            }
            if (enforcedBranchId) {
                return isValidBranchId(u.branchId) && u.branchId.trim() === enforcedBranchId;
            }
            return true;
        })
        .map(sanitizeUserDto);
};

const listReferralAgents = async (query = {}, currentUser = null) => {
    const { search, branchId } = query || {};
    const where = {
        role: "REFERRAL_AGENT",
        status: "ACTIVE",
    };

    let enforcedBranchId = null;

    if (currentUser) {
        const allowedReferralAgentViewerRoles = [
            "SUPER_ADMIN",
            "BRANCH_ADMIN",
            "FRONT_DESK",
            "COUNSELOR",
            "TEACHER",
            "REFERRAL_AGENT",
        ];
        if (!allowedReferralAgentViewerRoles.includes(currentUser.role)) {
            throw AppError.forbidden(
                "Access denied. Insufficient permissions to list referral agents.",
                "INSUFFICIENT_ROLE"
            );
        }

        if (currentUser.role === "BRANCH_ADMIN") {
            if (!isValidBranchId(currentUser.branchId)) {
                throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
            }
            enforcedBranchId = currentUser.branchId.trim();
        }
    }

    if (enforcedBranchId) {
        where.branchId = enforcedBranchId;
    } else if (branchId && (!currentUser || currentUser.role === "SUPER_ADMIN")) {
        where.branchId = branchId;
    }

    if (search && search.trim()) {
        const trimmed = search.trim();
        where.OR = [
            { firstName: { contains: trimmed, mode: "insensitive" } },
            { lastName: { contains: trimmed, mode: "insensitive" } },
            { email: { contains: trimmed, mode: "insensitive" } },
            { referralAgentProfile: { referralCode: { contains: trimmed, mode: "insensitive" } } },
        ];
    }

    const users = await prisma.user.findMany({
        where,
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            branchId: true,
            referralAgentProfile: {
                select: {
                    id: true,
                    referralCode: true,
                },
            },
        },
        orderBy: { firstName: "asc" },
    });

    const filteredUsers = (users || []).filter((u) => {
        if (!u) return false;
        if (u.role && u.role !== "REFERRAL_AGENT") return false;
        if (u.status && u.status !== "ACTIVE") return false;
        if (enforcedBranchId) {
            return isValidBranchId(u.branchId) && u.branchId.trim() === enforcedBranchId;
        }
        return true;
    });

    return filteredUsers.map((u) => ({
        id: u.referralAgentProfile?.id || u.id,
        userId: u.id,
        profileId: u.referralAgentProfile?.id || null,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        email: u.email,
        phone: u.phone ?? null,
        branchId: u.branchId ?? null,
        referralCode: u.referralAgentProfile?.referralCode || "N/A",
    }));
};

const inviteStaffUser = async ({ email, firstName, lastName, role, branchId }, currentUser = null) => {
    if (currentUser && currentUser.role === "BRANCH_ADMIN") {
        const allowedBranchAdminRoles = ["COUNSELOR", "FRONT_DESK", "TEACHER", "REFERRAL_AGENT"];
        if (!allowedBranchAdminRoles.includes(role)) {
            throw AppError.forbidden(`Branch admins cannot invite role '${role}'.`, "FORBIDDEN");
        }
        if (!currentUser.branchId) {
            throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
        }
        if (branchId && branchId !== currentUser.branchId) {
            throw AppError.forbidden("Branch admins cannot assign staff to other branches.", "FORBIDDEN");
        }
        branchId = currentUser.branchId;
    }

    if (branchId) {
        const branchExists = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { id: true },
        });
        if (!branchExists) {
            throw AppError.notFound(`Branch with id '${branchId}' not found.`, "BRANCH_NOT_FOUND");
        }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        throw AppError.conflict(`User with email '${email}' already exists.`, "USER_EXISTS");
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.$transaction(async (tx) => {
        let referralAgentProfileCreate = undefined;
        let counselorProfileCreate = undefined;
        let teacherProfileCreate = undefined;

        if (role === "REFERRAL_AGENT") {
            const referralCode = await generateUniqueReferralCode(tx);
            referralAgentProfileCreate = {
                create: {
                    referralCode,
                },
            };
        } else if (role === "COUNSELOR") {
            counselorProfileCreate = {
                create: {},
            };
        } else if (role === "TEACHER") {
            teacherProfileCreate = {
                create: {},
            };
        }

        return tx.user.create({
            data: {
                email,
                passwordHash: hash,
                firstName,
                lastName,
                role,
                status: "ACTIVE",
                branchId: branchId || null,
                mustChangePassword: true,
                ...(referralAgentProfileCreate && { referralAgentProfile: referralAgentProfileCreate }),
                ...(counselorProfileCreate && { counselorProfile: counselorProfileCreate }),
                ...(teacherProfileCreate && { teacherProfile: teacherProfileCreate }),
            },
            include: {
                referralAgentProfile: true,
                counselorProfile: true,
                teacherProfile: true,
            },
        });
    });

    const staffName = `${firstName} ${lastName}`.trim();
    sendStaffInvitationEmail({
        to: email,
        staffName,
        role,
        tempPassword,
    }).catch((err) => console.error("[user.service] Staff invitation email failed:", err.message));

    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        referralAgentProfileId: user.referralAgentProfile?.id || null,
        referralCode: user.referralAgentProfile?.referralCode || null,
    };
};

const updateUserStatus = async (targetId, newStatus, currentUser) => {
    // 1. Validate Target ID
    if (!targetId || typeof targetId !== "string" || !targetId.trim()) {
        throw AppError.badRequest("Valid target user ID is required.", "INVALID_USER_ID");
    }

    // 2. Validate Status
    if (!newStatus || typeof newStatus !== "string") {
        throw AppError.badRequest("Field 'status' is required.", "MISSING_STATUS");
    }
    const normalizedStatus = newStatus.trim().toUpperCase();
    if (!["ACTIVE", "SUSPENDED"].includes(normalizedStatus)) {
        throw AppError.badRequest(
            `Invalid status '${newStatus}'. Supported status values are 'ACTIVE' and 'SUSPENDED'.`,
            "INVALID_STATUS"
        );
    }

    // 3. Current User Authentication Check (defense-in-depth)
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorId = currentUser.userId || currentUser.id;

    // Concurrency-Safe Transaction:
    // - Advisory Lock acquired FIRST before reading mutable state.
    // - Target and Actor fetched fresh inside the transaction client (tx).
    // - Read Committed transaction isolation.
    return prisma.$transaction(
        async (tx) => {
            // 1. Acquire PostgreSQL transaction-level exclusive advisory lock
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SUPER_ADMIN_STATUS_ADVISORY_LOCK}::bigint);`;

            // 2. Fetch fresh target state from DB
            const target = await tx.user.findUnique({
                where: { id: targetId },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    status: true,
                    branchId: true,
                },
            });
            if (!target) {
                throw AppError.notFound(`User with id '${targetId}' not found.`, "USER_NOT_FOUND");
            }

            // 3. Absolute Last Active Super Admin Protection
            if (target.role === "SUPER_ADMIN" && target.status === "ACTIVE" && normalizedStatus === "SUSPENDED") {
                const otherActiveSuperAdmins = await tx.user.count({
                    where: {
                        role: "SUPER_ADMIN",
                        status: "ACTIVE",
                        id: { not: targetId },
                    },
                });

                if (otherActiveSuperAdmins === 0) {
                    throw AppError.badRequest(
                        "Cannot suspend the last active Super Admin account.",
                        "LAST_SUPER_ADMIN"
                    );
                }
            }

            // 4. Fetch fresh actor state from DB
            const actor = await tx.user.findUnique({
                where: { id: actorId },
                select: { id: true, role: true, status: true, branchId: true },
            });
            if (!actor || actor.status !== "ACTIVE") {
                throw AppError.unauthorized("Authentication required or account is inactive.", "UNAUTHORIZED");
            }

            // 5. Critical Protection: Self-Suspension Prevention
            if (normalizedStatus === "SUSPENDED" && actor.id === target.id) {
                throw AppError.badRequest("You cannot suspend your own account.", "CANNOT_SUSPEND_SELF");
            }

            // 6. RBAC Verification using fresh DB values
            if (actor.role === "BRANCH_ADMIN") {
                if (["SUPER_ADMIN", "BRANCH_ADMIN"].includes(target.role)) {
                    throw AppError.forbidden(
                        "Branch admins cannot modify status of administrative staff accounts.",
                        "FORBIDDEN"
                    );
                }
                if (!actor.branchId) {
                    throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
                }
                if (target.branchId !== actor.branchId) {
                    throw AppError.forbidden(
                        "Branch admins can only manage staff within their assigned branch.",
                        "BRANCH_MISMATCH"
                    );
                }
            } else if (actor.role === "SUPER_ADMIN") {
                // Super Admin has global access
            } else {
                throw AppError.forbidden(
                    "Access denied. Insufficient permissions to manage staff user status.",
                    "INSUFFICIENT_ROLE"
                );
            }

            // 7. Execute status update through tx
            const updated = await tx.user.update({
                where: { id: targetId },
                data: { status: normalizedStatus },
                select: SAFE_USER_SELECT,
            });

            // 8. Atomic refresh-token revocation upon suspension
            if (normalizedStatus === "SUSPENDED") {
                await tx.refreshToken.deleteMany({
                    where: { userId: targetId },
                });
            }

            // 9. Atomic AuditLog creation
            if (target.status !== normalizedStatus) {
                await tx.auditLog.create({
                    data: {
                        actorId: actor.id,
                        entity: "User",
                        entityId: target.id,
                        field: "status",
                        oldValue: String(target.status),
                        newValue: String(normalizedStatus),
                    },
                });
            }

            return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
};

const updateUserRole = async (targetId, newRole, currentUser) => {
    // 1. Validate Target ID
    if (!targetId || typeof targetId !== "string" || !targetId.trim()) {
        throw AppError.badRequest("Valid target user ID is required.", "INVALID_USER_ID");
    }

    // 2. Validate Role
    if (!newRole || typeof newRole !== "string") {
        throw AppError.badRequest("Field 'role' is required.", "MISSING_ROLE");
    }
    const normalizedRole = newRole.trim().toUpperCase();
    if (!ALLOWED_STAFF_ROLES.includes(normalizedRole)) {
        throw AppError.badRequest(
            `Invalid staff role '${newRole}'. Permitted staff roles are: ${ALLOWED_STAFF_ROLES.join(", ")}.`,
            "INVALID_ROLE"
        );
    }

    // 3. Current User Authentication Check
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorId = currentUser.userId || currentUser.id;

    // Concurrency-Safe Transaction:
    // - Advisory Lock acquired FIRST before reading mutable state.
    // - Serializes all role demotions and promotions against concurrent suspensions.
    return prisma.$transaction(
        async (tx) => {
            // 1. Acquire PostgreSQL transaction-level exclusive advisory lock
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SUPER_ADMIN_STATUS_ADVISORY_LOCK}::bigint);`;

            // 2. Fetch fresh target state from DB
            const target = await tx.user.findUnique({
                where: { id: targetId },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    status: true,
                    branchId: true,
                },
            });
            if (!target) {
                throw AppError.notFound(`User with id '${targetId}' not found.`, "USER_NOT_FOUND");
            }

            // 3. Absolute Last Active Super Admin Protection on Demotion
            if (target.role === "SUPER_ADMIN" && target.status === "ACTIVE" && normalizedRole !== "SUPER_ADMIN") {
                const otherActiveSuperAdmins = await tx.user.count({
                    where: {
                        role: "SUPER_ADMIN",
                        status: "ACTIVE",
                        id: { not: targetId },
                    },
                });

                if (otherActiveSuperAdmins === 0) {
                    throw AppError.badRequest(
                        "Cannot demote the last active Super Admin account.",
                        "LAST_SUPER_ADMIN"
                    );
                }
            }

            // 4. Fetch fresh actor state from DB
            const actor = await tx.user.findUnique({
                where: { id: actorId },
                select: { id: true, role: true, status: true, branchId: true },
            });
            if (!actor || actor.status !== "ACTIVE") {
                throw AppError.unauthorized("Authentication required or account is inactive.", "UNAUTHORIZED");
            }

            // 5. Critical Protection: Super Admin Self-Demotion Prevention
            if (actor.id === target.id && actor.role === "SUPER_ADMIN" && normalizedRole !== "SUPER_ADMIN") {
                throw AppError.badRequest("Super Admins cannot demote their own account.", "CANNOT_DEMOTE_SELF");
            }

            // 6. RBAC Verification using fresh DB values
            if (actor.role === "BRANCH_ADMIN") {
                // Branch admins cannot assign administrative roles
                if (["SUPER_ADMIN", "BRANCH_ADMIN"].includes(normalizedRole)) {
                    throw AppError.forbidden(
                        `Branch admins cannot assign administrative role '${normalizedRole}'.`,
                        "FORBIDDEN"
                    );
                }
                // Branch admins cannot modify administrative staff accounts
                if (["SUPER_ADMIN", "BRANCH_ADMIN"].includes(target.role)) {
                    throw AppError.forbidden(
                        "Branch admins cannot modify roles of administrative staff accounts.",
                        "FORBIDDEN"
                    );
                }
                // Enforce assigned branch context
                if (!actor.branchId) {
                    throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
                }
                // Enforce strict branch isolation
                if (target.branchId !== actor.branchId) {
                    throw AppError.forbidden(
                        "Branch admins can only manage staff within their assigned branch.",
                        "BRANCH_MISMATCH"
                    );
                }
                // Permitted roles for branch admin assignment
                const branchAdminPermittedRoles = ["COUNSELOR", "FRONT_DESK", "TEACHER", "REFERRAL_AGENT"];
                if (!branchAdminPermittedRoles.includes(normalizedRole)) {
                    throw AppError.forbidden(
                        `Branch admins cannot assign role '${normalizedRole}'.`,
                        "FORBIDDEN"
                    );
                }
            } else if (actor.role === "SUPER_ADMIN") {
                // Super Admin has global access
            } else {
                throw AppError.forbidden(
                    "Access denied. Insufficient permissions to manage staff user roles.",
                    "INSUFFICIENT_ROLE"
                );
            }

            // 7. Execute role update through tx
            const updated = await tx.user.update({
                where: { id: targetId },
                data: { role: normalizedRole },
                select: SAFE_USER_SELECT,
            });

            // 8. Atomic AuditLog creation
            if (target.role !== normalizedRole) {
                await tx.auditLog.create({
                    data: {
                        actorId: actor.id,
                        entity: "User",
                        entityId: target.id,
                        field: "role",
                        oldValue: String(target.role),
                        newValue: String(normalizedRole),
                    },
                });
            }

            return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
};

const updateUserBranch = async (targetId, newBranchId, currentUser) => {
    // 1. Validate Target ID
    if (!targetId || typeof targetId !== "string" || !targetId.trim()) {
        throw AppError.badRequest("Valid target user ID is required.", "INVALID_USER_ID");
    }

    // 2. Current User Authentication Check
    if (!currentUser) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorId = currentUser.userId || currentUser.id;

    // Concurrency-Safe Transaction:
    return prisma.$transaction(
        async (tx) => {
            // 1. Acquire PostgreSQL transaction-level exclusive advisory lock
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SUPER_ADMIN_STATUS_ADVISORY_LOCK}::bigint);`;

            // 2. Fetch fresh actor state from DB
            const actor = await tx.user.findUnique({
                where: { id: actorId },
                select: { id: true, role: true, status: true, branchId: true },
            });
            if (!actor || actor.status !== "ACTIVE") {
                throw AppError.unauthorized("Authentication required or account is inactive.", "UNAUTHORIZED");
            }

            // 3. Fetch fresh target state from DB
            const target = await tx.user.findUnique({
                where: { id: targetId },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    status: true,
                    branchId: true,
                },
            });
            if (!target) {
                throw AppError.notFound(`User with id '${targetId}' not found.`, "USER_NOT_FOUND");
            }

            // 4. Policy Check: Only SUPER_ADMIN can change staff branch assignments
            if (actor.role !== "SUPER_ADMIN") {
                throw AppError.forbidden(
                    "Access denied. Only Super Admins can manage staff branch assignments.",
                    "FORBIDDEN"
                );
            }

            // 5. Normalize Branch ID
            const targetBranchId =
                newBranchId === null || newBranchId === undefined || newBranchId === ""
                    ? null
                    : String(newBranchId).trim();

            // 6. Validate Null vs Assigned Branch Rules
            if (targetBranchId === null) {
                // Permit branchId: null ONLY when target user is SUPER_ADMIN
                if (target.role !== "SUPER_ADMIN") {
                    throw AppError.badRequest(
                        `Staff accounts with role '${target.role}' must be assigned to an active branch and cannot have a null branch context.`,
                        "INVALID_BRANCH_ASSIGNMENT"
                    );
                }
            } else {
                // Non-null branch must exist in database and be active
                const branch = await tx.branch.findUnique({
                    where: { id: targetBranchId },
                    select: { id: true, name: true, isActive: true },
                });
                if (!branch || !branch.isActive) {
                    throw AppError.notFound(
                        `Branch with id '${targetBranchId}' not found or is inactive.`,
                        "BRANCH_NOT_FOUND"
                    );
                }
            }

            // 7. Execute branch update through tx
            const updated = await tx.user.update({
                where: { id: targetId },
                data: { branchId: targetBranchId },
                select: SAFE_USER_SELECT,
            });

            // 8. Atomic AuditLog creation
            if (target.branchId !== targetBranchId) {
                await tx.auditLog.create({
                    data: {
                        actorId: actor.id,
                        entity: "User",
                        entityId: target.id,
                        field: "branchId",
                        oldValue: target.branchId ? String(target.branchId) : "null",
                        newValue: targetBranchId ? String(targetBranchId) : "null",
                    },
                });
            }

            return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
};

const listBranches = async () => {
    return prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, isActive: true },
        orderBy: { name: "asc" },
    });
};

module.exports = {
    listUsers,
    listReferralAgents,
    inviteStaffUser,
    updateUserStatus,
    updateUserRole,
    updateUserBranch,
    listBranches,
    generateUniqueReferralCode,
    SUPER_ADMIN_STATUS_ADVISORY_LOCK,
    ALLOWED_STAFF_ROLES,
    BRANCH_ADMIN_OPERATIONAL_ROLES,
    SAFE_USER_SELECT,
};

