const prisma = require("../prisma");
const AppError = require("../utils/apiError");

// GET /api/partner-consultancies
const getAllPartnerConsultancies = async (req, res, next) => {
    try {
        const consultancies = await prisma.partnerConsultancy.findMany({
            orderBy: { name: "asc" },
        });
        res.json({
            success: true,
            data: consultancies,
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/partner-consultancies (Create or retrieve existing by name)
const createOrFindPartnerConsultancy = async (req, res, next) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            throw AppError.badRequest("Partner consultancy name is required");
        }

        const trimmedName = name.trim();

        // Find existing case-insensitively or create
        let consultancy = await prisma.partnerConsultancy.findFirst({
            where: {
                name: {
                    equals: trimmedName,
                    mode: "insensitive",
                },
            },
        });

        if (!consultancy) {
            consultancy = await prisma.partnerConsultancy.create({
                data: {
                    name: trimmedName,
                },
            });
        }

        res.status(201).json({
            success: true,
            data: consultancy,
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAllPartnerConsultancies,
    createOrFindPartnerConsultancy,
};
