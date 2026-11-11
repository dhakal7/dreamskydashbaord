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
    const countries = await prisma.country.findMany({
      include: {
        _count: {
          select: { universities: true },
        },
      },
      orderBy: { name: "asc" },
    });
    sendSuccess(res, { data: countries });
  } catch (err) {
    next(err);
  }
};

const getCountry = async (req, res, next) => {
  try {
    const country = await prisma.country.findUnique({
      where: { id: req.params.id },
      include: {
        universities: true,
      },
    });
    if (!country) throw new AppError(`Country with id '${req.params.id}' not found.`, 404);
    sendSuccess(res, { data: country });
  } catch (err) {
    next(err);
  }
};

const createCountry = async (req, res, next) => {
  try {
    const name = req.body.name?.trim();
    const code = (req.body.code || req.body.isoCode || "").trim().toUpperCase();
    if (!name || !code)
      throw new AppError("Fields `name` and `code` are required.", 400);

    const existing = await prisma.country.findFirst({
      where: { OR: [{ name }, { code }] },
    });
    if (existing)
      throw new AppError("A country with the same name or code already exists.", 409);

    const country = await prisma.country.create({
      data: { name, code },
    });

    sendCreated(res, { message: "Country created.", data: country });
  } catch (err) {
    next(err);
  }
};

const updateCountry = async (req, res, next) => {
  try {
    const name = req.body.name?.trim();
    const code = (req.body.code || req.body.isoCode || "").trim().toUpperCase();
    const existing = await prisma.country.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`Country with id '${req.params.id}' not found.`, 404);

    if (name || code) {
      const orClauses = [];
      if (name) orClauses.push({ name });
      if (code) orClauses.push({ code });

      const conflict = await prisma.country.findFirst({
        where: { AND: [{ id: { not: req.params.id } }, { OR: orClauses }] },
      });
      if (conflict)
        throw new AppError("Another country with the same name or code exists.", 409);
    }

    const country = await prisma.country.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name } : {}),
        ...(code ? { code } : {}),
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

const normalizeCourseLevel = (raw) => {
  if (!raw) return "BACHELOR";
  const s = String(raw).toUpperCase().trim();
  if (VALID_LEVELS.includes(s)) return s;
  if (s.includes("MASTER") || s.includes("MBA") || s === "PG") return "MASTER";
  if (s.includes("DIPLOMA") || s.includes("FOUNDATION") || s.includes("CERT")) return "DIPLOMA";
  if (s.includes("PHD") || s.includes("DOCTORATE")) return "PHD";
  return "BACHELOR";
};

const normalizeCourseField = (raw) => {
  if (!raw) return "OTHER";
  const s = String(raw).toUpperCase().replace(/[\s/-]+/g, "_").trim();
  if (VALID_FIELDS_OF_STUDY.includes(s)) return s;
  for (const v of VALID_FIELDS_OF_STUDY) {
    if (s.includes(v) || v.includes(s)) return v;
  }
  return "OTHER";
};

const createCourse = async (req, res, next) => {
  try {
    const {
      universityId,
      name,
      level,
      fieldOfStudy,
      field,
      minGPA,
      englishRequirement,
      tuitionFee,
      tuitionUsd,
      currency,
      duration,
      durationMonths,
      intakeDates,
      intake,
      scholarshipInfo,
      scholarships,
      applicationDeadline,
      deadlines,
      seatCapacity,
      seatsRemaining,
    } = req.body;

    if (!universityId || !name) {
      throw new AppError("Fields `universityId` and `name` are required.", 400);
    }

    const university = await prisma.university.findUnique({ where: { id: universityId } });
    if (!university) throw new AppError(`University with id '${universityId}' not found.`, 404);

    const normLevel = normalizeCourseLevel(level || req.body.studyLevel);
    const normField = normalizeCourseField(fieldOfStudy || field);
    const rawTuition = tuitionFee !== undefined ? parseFloat(tuitionFee) : (tuitionUsd !== undefined ? parseFloat(tuitionUsd) : 0);
    const fee = isNaN(rawTuition) ? 0 : rawTuition;

    const parsedDuration = durationMonths !== undefined ? parseInt(durationMonths, 10) : (duration ? parseInt(String(duration), 10) || null : null);
    const seatCap = seatCapacity !== undefined ? parseInt(seatCapacity, 10) : 50;
    const seatRem = seatsRemaining !== undefined ? parseInt(seatsRemaining, 10) : seatCap;

    const intakeArr = Array.isArray(intakeDates)
      ? intakeDates
      : Array.isArray(intake)
        ? intake
        : typeof intakeDates === "string"
          ? intakeDates.split(",").map((s) => s.trim()).filter(Boolean)
          : [];

    const scholarshipPayload = scholarships ? scholarships : (scholarshipInfo ? { info: String(scholarshipInfo).trim() } : null);
    const deadlinePayload = deadlines ? deadlines : (applicationDeadline ? { application: applicationDeadline } : null);
    const englishPayload = englishRequirement ? (typeof englishRequirement === "object" ? englishRequirement : { requirement: String(englishRequirement) }) : null;

    const course = await prisma.course.create({
      data: {
        universityId,
        name: name.trim(),
        level: normLevel,
        fieldOfStudy: normField,
        tuitionFee: fee,
        currency: (currency || "USD").toUpperCase().trim(),
        durationMonths: isNaN(parsedDuration) ? null : parsedDuration,
        minGPA: minGPA !== undefined && !isNaN(parseFloat(minGPA)) ? parseFloat(minGPA) : null,
        englishRequirement: englishPayload,
        scholarships: scholarshipPayload,
        deadlines: deadlinePayload,
        intakeDates: intakeArr,
        seatCapacity: isNaN(seatCap) ? 50 : seatCap,
        seatsRemaining: isNaN(seatRem) ? 50 : Math.min(seatRem, isNaN(seatCap) ? 50 : seatCap),
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
      universityId,
      name,
      level,
      fieldOfStudy,
      field,
      minGPA,
      englishRequirement,
      tuitionFee,
      tuitionUsd,
      currency,
      duration,
      durationMonths,
      intakeDates,
      intake,
      scholarshipInfo,
      scholarships,
      applicationDeadline,
      deadlines,
      seatCapacity,
      seatsRemaining,
    } = req.body;

    const existing = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(`Course with id '${req.params.id}' not found.`, 404);

    if (universityId) {
      const university = await prisma.university.findUnique({ where: { id: universityId } });
      if (!university) throw new AppError(`University with id '${universityId}' not found.`, 404);
    }

    const updateData = {};
    if (universityId) updateData.universityId = universityId;
    if (name) updateData.name = name.trim();
    if (level) updateData.level = normalizeCourseLevel(level);
    if (fieldOfStudy || field) updateData.fieldOfStudy = normalizeCourseField(fieldOfStudy || field);

    if (tuitionFee !== undefined || tuitionUsd !== undefined) {
      const parsed = parseFloat(tuitionFee !== undefined ? tuitionFee : tuitionUsd);
      updateData.tuitionFee = isNaN(parsed) ? 0 : parsed;
    }
    if (currency) updateData.currency = currency.toUpperCase().trim();

    if (durationMonths !== undefined || duration !== undefined) {
      const parsedDur = durationMonths !== undefined ? parseInt(durationMonths, 10) : parseInt(String(duration), 10);
      updateData.durationMonths = isNaN(parsedDur) ? null : parsedDur;
    }

    if (minGPA !== undefined) {
      const parsedGpa = parseFloat(minGPA);
      updateData.minGPA = isNaN(parsedGpa) ? null : parsedGpa;
    }

    if (englishRequirement !== undefined) {
      updateData.englishRequirement = typeof englishRequirement === "object" ? englishRequirement : { requirement: String(englishRequirement) };
    }

    if (scholarships !== undefined || scholarshipInfo !== undefined) {
      updateData.scholarships = scholarships ? scholarships : (scholarshipInfo ? { info: String(scholarshipInfo).trim() } : null);
    }

    if (deadlines !== undefined || applicationDeadline !== undefined) {
      updateData.deadlines = deadlines ? deadlines : (applicationDeadline ? { application: applicationDeadline } : null);
    }

    if (intakeDates !== undefined || intake !== undefined) {
      updateData.intakeDates = Array.isArray(intakeDates)
        ? intakeDates
        : Array.isArray(intake)
          ? intake
          : typeof intakeDates === "string"
            ? intakeDates.split(",").map((s) => s.trim()).filter(Boolean)
            : [];
    }

    if (seatCapacity !== undefined) {
      const cap = parseInt(seatCapacity, 10);
      if (!isNaN(cap) && cap >= 0) updateData.seatCapacity = cap;
    }

    if (seatsRemaining !== undefined) {
      const rem = parseInt(seatsRemaining, 10);
      if (!isNaN(rem) && rem >= 0) updateData.seatsRemaining = rem;
    }

    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: updateData,
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

    const appCount = await prisma.application.count({ where: { courseId: req.params.id } });
    if (appCount > 0) {
      throw new AppError(`Cannot delete course: ${appCount} student application(s) reference it.`, 409);
    }

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
