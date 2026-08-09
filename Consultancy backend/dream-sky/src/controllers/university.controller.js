const prisma = require("../prisma");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");

const VALID_LEVELS = ["DIPLOMA", "BACHELOR", "MASTER", "PHD"];
const VALID_FIELDS_OF_STUDY = [
  "ENGINEERING",
  "BUSINESS",
  "IT_COMPUTING",
  "HEALTH_SCIENCES",
  "ARTS_HUMANITIES",
  "LAW",
  "NATURAL_SCIENCES",
  "SOCIAL_SCIENCES",
  "EDUCATION",
  "HOSPITALITY_TOURISM",
  "OTHER",
];

// ─── Countries ────────────────────────────────────────────────────────────────

const listCountries = async (req, res, next) => {
  try {
    const countries = await prisma.country.findMany({ orderBy: { name: "asc" } });
    sendSuccess(res, { data: countries });
  } catch (err) {
    next(err);
  }
};

const getCountry = async (req, res, next) => {
  try {
    const country = await prisma.country.findUnique({ where: { id: req.params.id } });
    if (!country) throw new AppError(`Country with id '${req.params.id}' not found.`, 404);
    sendSuccess(res, { data: country });
  } catch (err) {
    next(err);
  }
};

const createCountry = async (req, res, next) => {
  try {
    const { name, isoCode } = req.body;
    if (!name || !isoCode)
      throw new AppError("Fields `name` and `isoCode` are required.", 400);

    const existing = await prisma.country.findFirst({
      where: { OR: [{ name }, { isoCode: isoCode.toUpperCase() }] },
    });
    if (existing)
      throw new AppError("A country with the same name or ISO code already exists.", 409);

    const country = await prisma.country.create({
      data: { name: name.trim(), isoCode: isoCode.toUpperCase().trim() },
    });

    sendCreated(res, { message: "Country created.", data: country });
  } catch (err) {
    next(err);
  }
};

const updateCountry = async (req, res, next) => {
  try {
    const { name, isoCode } = req.body;
    const existing = await prisma.country.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`Country with id '${req.params.id}' not found.`, 404);

    if (name || isoCode) {
      const orClauses = [];
      if (name) orClauses.push({ name });
      if (isoCode) orClauses.push({ isoCode: isoCode.toUpperCase() });

      const conflict = await prisma.country.findFirst({
        where: { AND: [{ id: { not: req.params.id } }, { OR: orClauses }] },
      });
      if (conflict)
        throw new AppError("Another country with the same name or ISO code exists.", 409);
    }

    const country = await prisma.country.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(isoCode ? { isoCode: isoCode.toUpperCase().trim() } : {}),
      },
    });

    sendSuccess(res, { message: "Country updated.", data: country });
  } catch (err) {
    next(err);
  }
};

const deleteCountry = async (req, res, next) => {
  try {
    const existing = await prisma.country.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`Country with id '${req.params.id}' not found.`, 404);

    const count = await prisma.university.count({ where: { countryId: req.params.id } });
    if (count > 0)
      throw new AppError(
        `Cannot delete country: ${count} university record(s) reference it.`,
        409
      );

    await prisma.country.delete({ where: { id: req.params.id } });
    sendSuccess(res, { data: { deleted: true, id: req.params.id } });
  } catch (err) {
    next(err);
  }
};

// ─── Universities ─────────────────────────────────────────────────────────────

const listUniversities = async (req, res, next) => {
  try {
    const { countryId } = req.query;
    const universities = await prisma.university.findMany({
      where: { ...(countryId ? { countryId } : {}) },
      include: { country: true },
      orderBy: { name: "asc" },
    });
    sendSuccess(res, { data: universities });
  } catch (err) {
    next(err);
  }
};

const getUniversity = async (req, res, next) => {
  try {
    const university = await prisma.university.findUnique({
      where: { id: req.params.id },
      include: { country: true },
    });
    if (!university) throw new AppError(`University with id '${req.params.id}' not found.`, 404);
    sendSuccess(res, { data: university });
  } catch (err) {
    next(err);
  }
};

const getUniversityCourses = async (req, res, next) => {
  try {
    const university = await prisma.university.findUnique({ where: { id: req.params.id } });
    if (!university) throw new AppError(`University with id '${req.params.id}' not found.`, 404);

    const courses = await prisma.course.findMany({
      where: { universityId: req.params.id },
      orderBy: { name: "asc" },
    });
    sendSuccess(res, { data: courses });
  } catch (err) {
    next(err);
  }
};

const createUniversity = async (req, res, next) => {
  try {
    const { name, countryId, city, website, visaSuccessRate, ranking } = req.body;

    if (!name || !countryId || !city || !website || visaSuccessRate === undefined)
      throw new AppError(
        "Fields `name`, `countryId`, `city`, `website`, and `visaSuccessRate` are required.",
        400
      );

    if (visaSuccessRate < 0 || visaSuccessRate > 100)
      throw new AppError("`visaSuccessRate` must be between 0 and 100.", 400);

    const country = await prisma.country.findUnique({ where: { id: countryId } });
    if (!country) throw new AppError(`Country with id '${countryId}' not found.`, 404);

    const university = await prisma.university.create({
      data: {
        name: name.trim(),
        countryId,
        city: city.trim(),
        website: website.trim(),
        visaSuccessRate,
        ...(ranking !== undefined ? { ranking } : {}),
      },
      include: { country: true },
    });

    sendCreated(res, { message: "University created.", data: university });
  } catch (err) {
    next(err);
  }
};

const updateUniversity = async (req, res, next) => {
  try {
    const { name, countryId, city, website, visaSuccessRate, ranking } = req.body;

    const existing = await prisma.university.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`University with id '${req.params.id}' not found.`, 404);

    if (visaSuccessRate !== undefined && (visaSuccessRate < 0 || visaSuccessRate > 100))
      throw new AppError("`visaSuccessRate` must be between 0 and 100.", 400);

    if (countryId) {
      const country = await prisma.country.findUnique({ where: { id: countryId } });
      if (!country) throw new AppError(`Country with id '${countryId}' not found.`, 404);
    }

    const university = await prisma.university.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(countryId ? { countryId } : {}),
        ...(city ? { city: city.trim() } : {}),
        ...(website ? { website: website.trim() } : {}),
        ...(visaSuccessRate !== undefined ? { visaSuccessRate } : {}),
        ...(ranking !== undefined ? { ranking } : {}),
      },
      include: { country: true },
    });

    sendSuccess(res, { message: "University updated.", data: university });
  } catch (err) {
    next(err);
  }
};

const deleteUniversity = async (req, res, next) => {
  try {
    const existing = await prisma.university.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`University with id '${req.params.id}' not found.`, 404);

    const courseCount = await prisma.course.count({ where: { universityId: req.params.id } });
    if (courseCount > 0)
      throw new AppError(
        `Cannot delete university: ${courseCount} course(s) reference it. Delete courses first.`,
        409
      );

    await prisma.university.delete({ where: { id: req.params.id } });
    sendSuccess(res, { data: { deleted: true, id: req.params.id } });
  } catch (err) {
    next(err);
  }
};

// ─── Courses ──────────────────────────────────────────────────────────────────

const listCourses = async (req, res, next) => {
  try {
    const { countryId, level, fieldOfStudy, maxTuition } = req.query;

    if (level && !VALID_LEVELS.includes(level))
      throw new AppError(
        `Invalid level '${level}'. Must be one of: ${VALID_LEVELS.join(", ")}.`,
        400
      );

    if (fieldOfStudy && !VALID_FIELDS_OF_STUDY.includes(fieldOfStudy))
      throw new AppError(
        `Invalid fieldOfStudy '${fieldOfStudy}'. Must be one of: ${VALID_FIELDS_OF_STUDY.join(", ")}.`,
        400
      );

    const maxTuitionNum = maxTuition ? parseFloat(maxTuition) : undefined;
    if (maxTuition !== undefined && isNaN(maxTuitionNum))
      throw new AppError("`maxTuition` must be a valid number.", 400);

    const courses = await prisma.course.findMany({
      where: {
        ...(level ? { level } : {}),
        ...(fieldOfStudy ? { fieldOfStudy } : {}),
        ...(maxTuitionNum !== undefined ? { tuitionFee: { lte: maxTuitionNum } } : {}),
        ...(countryId ? { university: { countryId } } : {}),
      },
      include: { university: { include: { country: true } } },
      orderBy: { name: "asc" },
    });

    sendSuccess(res, { data: courses });
  } catch (err) {
    next(err);
  }
};

const getCourse = async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: { university: { include: { country: true } } },
    });
    if (!course) throw new AppError(`Course with id '${req.params.id}' not found.`, 404);
    sendSuccess(res, { data: course });
  } catch (err) {
    next(err);
  }
};

const createCourse = async (req, res, next) => {
  try {
    const {
      universityId,
      name,
      level,
      fieldOfStudy,
      minGPA,
      englishRequirement,
      tuitionFee,
      currency,
      intakeDates,
      scholarshipInfo,
      applicationDeadline,
      seatCapacity,
      seatsRemaining,
    } = req.body;

    if (
      !universityId || !name || !level ||
      minGPA === undefined || !englishRequirement ||
      tuitionFee === undefined || !currency ||
      !intakeDates || !applicationDeadline ||
      seatCapacity === undefined || seatsRemaining === undefined
    ) {
      throw new AppError(
        "Missing required fields: universityId, name, level, minGPA, englishRequirement, tuitionFee, currency, intakeDates, applicationDeadline, seatCapacity, seatsRemaining.",
        400
      );
    }

    if (!VALID_LEVELS.includes(level))
      throw new AppError(
        `Invalid level '${level}'. Must be one of: ${VALID_LEVELS.join(", ")}.`,
        400
      );

    if (fieldOfStudy && !VALID_FIELDS_OF_STUDY.includes(fieldOfStudy))
      throw new AppError(
        `Invalid fieldOfStudy '${fieldOfStudy}'. Must be one of: ${VALID_FIELDS_OF_STUDY.join(", ")}.`,
        400
      );

    if (seatsRemaining < 0)
      throw new AppError("`seatsRemaining` cannot be negative.", 400);
    if (seatsRemaining > seatCapacity)
      throw new AppError("`seatsRemaining` cannot exceed `seatCapacity`.", 400);

    const university = await prisma.university.findUnique({ where: { id: universityId } });
    if (!university) throw new AppError(`University with id '${universityId}' not found.`, 404);

    const course = await prisma.course.create({
      data: {
        universityId,
        name: name.trim(),
        level,
        ...(fieldOfStudy ? { fieldOfStudy } : {}),
        minGPA,
        englishRequirement,
        tuitionFee,
        currency: currency.toUpperCase().trim(),
        intakeDates: intakeDates.map((d) => new Date(d)),
        scholarshipInfo: scholarshipInfo?.trim() ?? null,
        applicationDeadline: new Date(applicationDeadline),
        seatCapacity,
        seatsRemaining,
      },
      include: { university: { include: { country: true } } },
    });

    sendCreated(res, { message: "Course created.", data: course });
  } catch (err) {
    next(err);
  }
};

const updateCourse = async (req, res, next) => {
  try {
    const {
      universityId, name, level, fieldOfStudy, minGPA, englishRequirement,
      tuitionFee, currency, intakeDates, scholarshipInfo, applicationDeadline,
      seatCapacity, seatsRemaining,
    } = req.body;

    const existing = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`Course with id '${req.params.id}' not found.`, 404);

    if (level && !VALID_LEVELS.includes(level))
      throw new AppError(`Invalid level '${level}'. Must be one of: ${VALID_LEVELS.join(", ")}.`, 400);

    if (fieldOfStudy && !VALID_FIELDS_OF_STUDY.includes(fieldOfStudy))
      throw new AppError(`Invalid fieldOfStudy '${fieldOfStudy}'.`, 400);

    const finalCapacity = seatCapacity ?? existing.seatCapacity;
    const finalRemaining = seatsRemaining ?? existing.seatsRemaining;

    if (finalRemaining < 0) throw new AppError("`seatsRemaining` cannot be negative.", 400);
    if (finalRemaining > finalCapacity) throw new AppError("`seatsRemaining` cannot exceed `seatCapacity`.", 400);

    if (universityId) {
      const university = await prisma.university.findUnique({ where: { id: universityId } });
      if (!university) throw new AppError(`University with id '${universityId}' not found.`, 404);
    }

    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: {
        ...(universityId ? { universityId } : {}),
        ...(name ? { name: name.trim() } : {}),
        ...(level ? { level } : {}),
        ...(fieldOfStudy ? { fieldOfStudy } : {}),
        ...(minGPA !== undefined ? { minGPA } : {}),
        ...(englishRequirement ? { englishRequirement } : {}),
        ...(tuitionFee !== undefined ? { tuitionFee } : {}),
        ...(currency ? { currency: currency.toUpperCase().trim() } : {}),
        ...(intakeDates ? { intakeDates: intakeDates.map((d) => new Date(d)) } : {}),
        ...(scholarshipInfo !== undefined ? { scholarshipInfo: scholarshipInfo?.trim() ?? null } : {}),
        ...(applicationDeadline ? { applicationDeadline: new Date(applicationDeadline) } : {}),
        ...(seatCapacity !== undefined ? { seatCapacity } : {}),
        ...(seatsRemaining !== undefined ? { seatsRemaining } : {}),
      },
      include: { university: { include: { country: true } } },
    });

    sendSuccess(res, { message: "Course updated.", data: course });
  } catch (err) {
    next(err);
  }
};

const deleteCourse = async (req, res, next) => {
  try {
    const existing = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`Course with id '${req.params.id}' not found.`, 404);

    await prisma.course.delete({ where: { id: req.params.id } });
    sendSuccess(res, { data: { deleted: true, id: req.params.id } });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /courses/:id/decrement-seats
 * Integration point: Track A's Application module calls this when confirming a student application.
 */
const decrementSeats = async (req, res, next) => {
  try {
    const { count = 1 } = req.body;

    if (typeof count !== "number" || count < 1 || !Number.isInteger(count))
      throw new AppError("`count` must be a positive integer (default: 1).", 400);

    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) throw new AppError(`Course with id '${req.params.id}' not found.`, 404);

    if (course.seatsRemaining < count)
      throw new AppError(
        `Not enough seats available. Requested: ${count}, Available: ${course.seatsRemaining}.`,
        409
      );

    const updated = await prisma.course.update({
      where: { id: req.params.id },
      data: { seatsRemaining: { decrement: count } },
    });

    sendSuccess(res, {
      data: {
        id: updated.id,
        seatCapacity: updated.seatCapacity,
        seatsRemaining: updated.seatsRemaining,
        decremented: count,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listCountries, getCountry, createCountry, updateCountry, deleteCountry,
  listUniversities, getUniversity, getUniversityCourses, createUniversity, updateUniversity, deleteUniversity,
  listCourses, getCourse, createCourse, updateCourse, deleteCourse, decrementSeats,
  VALID_LEVELS,
  VALID_FIELDS_OF_STUDY,
};
