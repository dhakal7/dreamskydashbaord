const prisma = require("../prisma");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");
const { scoreAndRank } = require("../services/recommendation.scoring");

const VALID_TEST_TYPES = ["IELTS", "PTE", "TOEFL"];
const VALID_FIELDS_OF_STUDY = [
  "ENGINEERING", "BUSINESS", "IT_COMPUTING", "HEALTH_SCIENCES",
  "ARTS_HUMANITIES", "LAW", "NATURAL_SCIENCES", "SOCIAL_SCIENCES",
  "EDUCATION", "HOSPITALITY_TOURISM", "OTHER",
];

/**
 * POST /api/recommendations
 * Generate scored course recommendations for a student.
 * Accepts a studentId (or opaque recordId) plus GPA / test-score / budget profile.
 */
const generateRecommendations = async (req, res, next) => {
  try {
    const {
      recordId,
      gpa,
      gpaScale,
      testScores,
      preferredCountryIds,
      preferredFieldOfStudy,
      budgetMax,
      budgetCurrency,
      gapYears,
    } = req.body;

    // ── Required field validation ──────────────────────────────────────────
    if (
      !recordId || gpa === undefined || gpaScale === undefined ||
      !testScores || !preferredCountryIds || !preferredFieldOfStudy ||
      budgetMax === undefined || !budgetCurrency || gapYears === undefined
    ) {
      throw new AppError(
        "Missing required fields: recordId, gpa, gpaScale, testScores, preferredCountryIds, preferredFieldOfStudy, budgetMax, budgetCurrency, gapYears.",
        400
      );
    }

    if (typeof gpa !== "number" || gpa < 0)
      throw new AppError("`gpa` must be a non-negative number.", 400);
    if (typeof gpaScale !== "number" || gpaScale <= 0)
      throw new AppError("`gpaScale` must be a positive number.", 400);
    if (gpa > gpaScale)
      throw new AppError("`gpa` cannot exceed `gpaScale`.", 400);
    if (!Array.isArray(testScores) || testScores.length === 0)
      throw new AppError("`testScores` must be a non-empty array.", 400);

    for (const ts of testScores) {
      if (!ts.type || !VALID_TEST_TYPES.includes(ts.type))
        throw new AppError(
          `Invalid test type '${ts.type}'. Must be one of: ${VALID_TEST_TYPES.join(", ")}.`,
          400
        );
      if (typeof ts.score !== "number" || ts.score < 0)
        throw new AppError("Each test score must be a non-negative number.", 400);
    }

    if (!Array.isArray(preferredCountryIds) || preferredCountryIds.length === 0)
      throw new AppError("`preferredCountryIds` must be a non-empty array.", 400);

    if (!VALID_FIELDS_OF_STUDY.includes(preferredFieldOfStudy))
      throw new AppError(
        `Invalid preferredFieldOfStudy '${preferredFieldOfStudy}'. Must be one of: ${VALID_FIELDS_OF_STUDY.join(", ")}.`,
        400
      );

    if (typeof budgetMax !== "number" || budgetMax <= 0)
      throw new AppError("`budgetMax` must be a positive number.", 400);
    if (typeof gapYears !== "number" || gapYears < 0 || !Number.isInteger(gapYears))
      throw new AppError("`gapYears` must be a non-negative integer.", 400);

    // ── Verify countries exist ─────────────────────────────────────────────
    const countries = await prisma.country.findMany({
      where: { id: { in: preferredCountryIds } },
      select: { id: true },
    });
    const foundIds = new Set(countries.map((c) => c.id));
    const missing = preferredCountryIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0)
      throw new AppError(`Country IDs not found: ${missing.join(", ")}.`, 404);

    // ── Fetch candidate courses ────────────────────────────────────────────
    const candidateCourses = await prisma.course.findMany({
      where: {
        fieldOfStudy: preferredFieldOfStudy,
        seatsRemaining: { gt: 0 },
        university: { countryId: { in: preferredCountryIds } },
      },
      include: {
        university: {
          select: { id: true, name: true, countryId: true, city: true, visaSuccessRate: true, ranking: true },
        },
      },
    });

    // ── Score and rank ─────────────────────────────────────────────────────
    const input = { recordId, gpa, gpaScale, testScores, preferredCountryIds, preferredFieldOfStudy, budgetMax, budgetCurrency, gapYears };
    const results = scoreAndRank(candidateCourses, input);

    // ── Persist result snapshot ────────────────────────────────────────────
    const recommendation = await prisma.recommendationResult.create({
      data: {
        recordId,
        inputSnapshot: JSON.parse(JSON.stringify(input)),
        results: JSON.parse(JSON.stringify(results)),
      },
    });

    sendCreated(res, { message: "Recommendations generated.", data: recommendation });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/recommendations/:recordId/latest
 * Returns the most recent RecommendationResult for a recordId.
 */
const getLatestRecommendation = async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const latest = await prisma.recommendationResult.findFirst({
      where: { recordId },
      orderBy: { generatedAt: "desc" },
    });
    if (!latest)
      throw new AppError(`No recommendations found for recordId '${recordId}'.`, 404);
    sendSuccess(res, { data: latest });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/recommendations/:recordId/history
 * Returns all RecommendationResult rows for a recordId, most recent first.
 */
const getRecommendationHistory = async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const history = await prisma.recommendationResult.findMany({
      where: { recordId },
      orderBy: { generatedAt: "desc" },
    });
    sendSuccess(res, { data: history });
  } catch (err) {
    next(err);
  }
};

module.exports = { generateRecommendations, getLatestRecommendation, getRecommendationHistory };
