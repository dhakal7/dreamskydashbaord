const prisma = require("../prisma");
const bcrypt = require("bcryptjs");
const AppError = require("../utils/apiError");
const { sendStaffInvitationEmail } = require("./email.service");

function generateTempPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
}

const listUsers = async (query = {}) => {
    const { role, status, branchId } = query;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;

    return prisma.user.findMany({
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
            lastLoginAt: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    });
};

const inviteStaffUser = async ({ email, firstName, lastName, role, branchId }) => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        throw AppError.conflict(`User with email '${email}' already exists.`, "USER_EXISTS");
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
        data: {
            email,
            passwordHash: hash,
            firstName,
            lastName,
            role,
            status: "ACTIVE",
            branchId: branchId || null,
            mustChangePassword: true,
        },
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
        tempPassword,
    };
};

module.exports = {
    listUsers,
    inviteStaffUser,
};
