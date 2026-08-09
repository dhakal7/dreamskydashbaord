const prisma = require("../prisma");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");
const { sendNotificationEmail } = require("../services/email.service");

// ─── Public Listings (unauthenticated) ───────────────────────────────────────

/**
 * GET /api/public/countries
 * Returns all countries that have at least one university.
 */
const listPublicCountries = async (req, res, next) => {
  try {
    const countries = await prisma.country.findMany({
      where: { universities: { some: {} } },
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { universities: true } },
      },
      orderBy: { name: "asc" },
    });
    sendSuccess(res, { data: countries });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/public/universities
 * Returns universities with basic info (no internal admin data).
 * Supports: countryId filter, search, page, limit
 */
const listPublicUniversities = async (req, res, next) => {
  try {
    const { countryId, search, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (countryId) where.countryId = countryId;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const [universities, total] = await Promise.all([
      prisma.university.findMany({
        where,
        select: {
          id: true,
          name: true,
          website: true,
          country: { select: { id: true, name: true, code: true } },
          _count: { select: { courses: true } },
        },
        orderBy: { name: "asc" },
        skip,
        take: limitNum,
      }),
      prisma.university.count({ where }),
    ]);

    sendSuccess(res, {
      data: {
        universities,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/public/universities/:universityId
 * Single university details with course listing (public view).
 */
const getPublicUniversity = async (req, res, next) => {
  try {
    const university = await prisma.university.findUnique({
      where: { id: req.params.universityId },
      select: {
        id: true,
        name: true,
        website: true,
        country: { select: { id: true, name: true, code: true } },
        courses: {
          select: {
            id: true, name: true, level: true, fieldOfStudy: true,
            tuitionFee: true, currency: true, intakeDates: true,
            seatCapacity: true, seatsRemaining: true,
          },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!university) throw new AppError("University not found.", 404);
    sendSuccess(res, { data: university });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/public/courses
 * Flat course listing with filtering — the main "browse" page.
 * Supports: countryId, universityId, level, fieldOfStudy, search, page, limit
 */
const listPublicCourses = async (req, res, next) => {
  try {
    const {
      countryId, universityId, level, fieldOfStudy, search,
      page = "1", limit = "20",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (universityId) where.universityId = universityId;
    if (level) where.level = level;
    if (fieldOfStudy) where.fieldOfStudy = fieldOfStudy;
    if (search) where.name = { contains: search, mode: "insensitive" };
    if (countryId) where.university = { countryId };

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        select: {
          id: true, name: true, level: true, fieldOfStudy: true,
          tuitionFee: true, currency: true, intakeDates: true,
          seatCapacity: true, seatsRemaining: true,
          university: {
            select: {
              id: true, name: true,
              country: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: [{ university: { name: "asc" } }, { name: "asc" }],
        skip,
        take: limitNum,
      }),
      prisma.course.count({ where }),
    ]);

    sendSuccess(res, {
      data: {
        courses,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Public Inquiry Form ──────────────────────────────────────────────────────

/**
 * POST /api/public/inquiry
 * Submit a website inquiry. No authentication required.
 * Does NOT create a Student/Lead in Track A's system — staff review manually.
 */
const submitPublicInquiry = async (req, res, next) => {
  try {
    const { name, phone, email, message, notes, countryInterest, preferredCountry } = req.body;

    if (!name || !phone) {
      throw new AppError("Fields `name` and `phone` are required.", 400);
    }

    const finalEmail = (email && email.includes('@')) ? email.trim().toLowerCase() : `${phone.replace(/\D/g, '')}@dreamsky.temp`;
    const finalCountry = (preferredCountry || countryInterest || "").trim() || null;
    const finalMessage = (message || notes || `Consultation request for ${finalCountry || 'studies'}`).trim();

    const inquiry = await prisma.publicInquiry.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        email: finalEmail,
        message: finalMessage,
        countryInterest: finalCountry,
        source: "website",
      },
    });

    // Notify consultancy staff and acknowledge the inquirer by email
    notifyInquiryStaff(inquiry).catch(() => {});
    if (finalEmail && !finalEmail.endsWith('@dreamsky.temp')) {
      sendNotificationEmail({
        to: finalEmail,
        subject: "We received your inquiry — DreamSky Education Consultancy",
        body: `Hi ${inquiry.name},\n\nThank you for contacting DreamSky Education Consultancy. Our team has received your inquiry and will get back to you shortly.\n\n${finalMessage}\n\nDreamSky Education Consultancy`,
      }).catch(() => {});
    }

    sendCreated(res, {
      data: { id: inquiry.id, message: "Your inquiry has been submitted. We will get back to you shortly." },
    });
  } catch (err) {
    next(err);
  }
};

async function notifyInquiryStaff(inquiry) {
  const staff = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "BRANCH_ADMIN"] } },
    select: { email: true },
  });
  const adminEmails = staff.map((u) => u.email).filter(Boolean);
  if (adminEmails.length === 0) return;

  const detail = [
    `New website inquiry received:`,
    `Name: ${inquiry.name}`,
    `Phone: ${inquiry.phone}`,
    `Email: ${inquiry.email}`,
    inquiry.countryInterest ? `Country of interest: ${inquiry.countryInterest}` : null,
    `Message: ${inquiry.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendNotificationEmail({
    to: adminEmails,
    subject: "New Website Inquiry — DreamSky Education Consultancy",
    body: `${detail}\n\nDreamSky Education Consultancy`,
  });
}

// ─── Staff: Inquiry Management (authenticated) ────────────────────────────────

/**
 * GET /api/inquiries
 * List unconverted (or all) inquiries. SUPER_ADMIN and COUNSELOR only.
 */
const listInquiries = async (req, res, next) => {
  try {
    const { includeConverted = "false", page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = includeConverted === "true" ? {} : { converted: false };

    const [inquiries, total] = await Promise.all([
      prisma.publicInquiry.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limitNum }),
      prisma.publicInquiry.count({ where }),
    ]);

    sendSuccess(res, {
      data: {
        inquiries,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/inquiries/:id
 * Get single inquiry. SUPER_ADMIN and COUNSELOR only.
 */
const getInquiry = async (req, res, next) => {
  try {
    const inquiry = await prisma.publicInquiry.findUnique({ where: { id: req.params.id } });
    if (!inquiry) throw new AppError(`Inquiry '${req.params.id}' not found.`, 404);
    sendSuccess(res, { data: inquiry });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/inquiries/:id/convert
 * Mark an inquiry as converted after staff manually creates a Student via Track A.
 */
const markInquiryConverted = async (req, res, next) => {
  try {
    const existing = await prisma.publicInquiry.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`Inquiry '${req.params.id}' not found.`, 404);
    if (existing.converted) throw new AppError("Inquiry is already marked as converted.", 409);

    const updated = await prisma.publicInquiry.update({
      where: { id: req.params.id },
      data: {
        converted: true,
        convertedAt: new Date(),
        convertedBy: req.user.id,
      },
    });

    sendSuccess(res, { message: "Inquiry marked as converted.", data: updated });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listPublicCountries, listPublicUniversities, getPublicUniversity,
  listPublicCourses, submitPublicInquiry,
  listInquiries, getInquiry, markInquiryConverted,
};
