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
    const targetRecordId = req.body.recordId || req.body.studentId;
    if (!targetRecordId) {
      throw new AppError("Missing required field: `recordId` or `studentId`.", 400);
    }

    const gpa = req.body.gpa ?? 3.5;
    const gpaScale = req.body.gpaScale ?? 4.0;
    const testScores = Array.isArray(req.body.testScores) && req.body.testScores.length > 0
      ? req.body.testScores
      : [{ type: "IELTS", score: 6.5 }];

    let preferredCountryIds = Array.isArray(req.body.preferredCountryIds) && req.body.preferredCountryIds.length > 0
      ? req.body.preferredCountryIds
      : (req.body.targetCountryId ? [req.body.targetCountryId] : []);

    // If no specific country passed, use all available countries
    if (preferredCountryIds.length === 0) {
      const allCountries = await prisma.country.findMany({ select: { id: true } });
      preferredCountryIds = allCountries.map((c) => c.id);
    }

    const preferredFieldOfStudy = VALID_FIELDS_OF_STUDY.includes(req.body.preferredFieldOfStudy)
      ? req.body.preferredFieldOfStudy
      : (VALID_FIELDS_OF_STUDY.includes(req.body.targetFieldOfStudy) ? req.body.targetFieldOfStudy : "IT_COMPUTING");

    const budgetMax = req.body.budgetMax || req.body.maxBudgetUsd || 30000;
    const budgetCurrency = req.body.budgetCurrency || "USD";
    const gapYears = req.body.gapYears ?? 0;

    // ── Fetch candidate courses ────────────────────────────────────────────
    const candidateCourses = await prisma.course.findMany({
      where: {
        seatsRemaining: { gt: 0 },
        ...(preferredCountryIds.length > 0 ? { university: { countryId: { in: preferredCountryIds } } } : {}),
      },
      include: {
        university: {
          select: { id: true, name: true, countryId: true, city: true, visaSuccessRate: true, ranking: true },
        },
      },
    });

    // ── Score and rank ─────────────────────────────────────────────────────
    const input = { recordId: targetRecordId, gpa, gpaScale, testScores, preferredCountryIds, preferredFieldOfStudy, budgetMax, budgetCurrency, gapYears };
    const results = scoreAndRank(candidateCourses, input);

    // ── Persist result snapshot ────────────────────────────────────────────
    const recommendation = await prisma.recommendationResult.create({
      data: {
        recordId: targetRecordId,
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
