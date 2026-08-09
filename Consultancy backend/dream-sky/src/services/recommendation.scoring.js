/**
 * Recommendation Scoring Engine — Rules-based v1 (ported from Track B)
 *
 * Pure scoring logic, separated from controller for testability.
 * All weights are named constants — tune here, not in the controller.
 *
 * Future upgrade path: swap this module for an ML-based scorer behind the
 * same interface; the controller and API shape remain identical.
 */

// ─── Scoring Weight Constants ─────────────────────────────────────────────────

const WEIGHT_GPA_MARGIN = 25;
const WEIGHT_BUDGET_HEADROOM = 20;
const WEIGHT_VISA_SUCCESS = 25;
const WEIGHT_SCHOLARSHIP = 15;
const WEIGHT_RANKING = 15;

// ─── Bucket Thresholds ────────────────────────────────────────────────────────

const SAFETY_GPA_MARGIN = 0.5;
const REACH_GPA_MARGIN = 0.3;
const TUITION_STRETCH_FACTOR = 1.15; // 15% over-budget stretch
const MAX_RANKING_FOR_NORMALIZATION = 1000;
const MAX_RESULTS = 10;

// ─── GPA Normalization ────────────────────────────────────────────────────────

/**
 * Normalize a GPA value to a 4.0 scale.
 * e.g. 3.6 on a 5.0 scale → (3.6 / 5.0) * 4.0 = 2.88
 */
function normalizeGpa(gpa, gpaScale) {
  if (gpaScale <= 0) return 0;
  return (gpa / gpaScale) * 4.0;
}

// ─── English Requirement Check ────────────────────────────────────────────────

/**
 * Check whether the applicant's test scores meet a course's English requirement.
 * The course's englishRequirement JSON looks like: { "IELTS": 6.5, "PTE": 58 }
 * Returns true if at least one of the applicant's test scores meets the requirement,
 * or if the course has no requirements for any of the applicant's test types.
 */
function meetsEnglishRequirement(testScores, englishRequirement) {
  if (!englishRequirement || typeof englishRequirement !== "object") {
    return true; // No requirements — pass
  }

  const reqs = englishRequirement;
  let hasMatchingType = false;

  for (const ts of testScores) {
    const required = reqs[ts.type];
    if (required !== undefined) {
      hasMatchingType = true;
      if (ts.score >= required) return true;
    }
  }

  // If course has requirements but none of the applicant's test types matched,
  // give benefit of the doubt (they might take the test later)
  return !hasMatchingType;
}

/**
 * Get the best English score margin above requirement, for rationale generation.
 */
function getEnglishMargin(testScores, englishRequirement) {
  if (!englishRequirement || typeof englishRequirement !== "object") return null;

  const reqs = englishRequirement;
  let bestMatch = null;

  for (const ts of testScores) {
    const required = reqs[ts.type];
    if (required !== undefined) {
      const margin = ts.score - required;
      if (!bestMatch || margin > bestMatch.margin) {
        bestMatch = { type: ts.type, margin };
      }
    }
  }

  return bestMatch;
}

// ─── Rationale Generation ─────────────────────────────────────────────────────

function generateRationale(course, input, gpaMargin, withinBudget, hasScholarship, bucket) {
  const parts = [];

  if (gpaMargin >= SAFETY_GPA_MARGIN) {
    parts.push("GPA comfortably exceeds the minimum requirement");
  } else if (gpaMargin >= REACH_GPA_MARGIN) {
    parts.push("GPA meets the minimum requirement with some margin");
  } else {
    parts.push("GPA just meets the minimum requirement");
  }

  const englishMargin = getEnglishMargin(input.testScores, course.englishRequirement);
  if (englishMargin) {
    if (englishMargin.margin >= 0.5) {
      parts.push(`${englishMargin.type} score exceeds requirement`);
    } else if (englishMargin.margin >= 0) {
      parts.push(`${englishMargin.type} score meets requirement`);
    }
  }

  if (withinBudget) {
    const savings = input.budgetMax - course.tuitionFee;
    if (savings > 0) {
      parts.push(`within budget with ${course.currency} ${savings.toLocaleString()} headroom`);
    } else {
      parts.push("right at budget limit");
    }
  } else {
    const overage = course.tuitionFee - input.budgetMax;
    parts.push(`${course.currency} ${overage.toLocaleString()} over budget (within 15% stretch)`);
  }

  if (hasScholarship) parts.push("scholarship opportunities available");
  if (course.university.ranking) parts.push(`university ranked #${course.university.ranking}`);

  const bucketLabel =
    bucket === "STRONG_MATCH"
      ? "Strong match overall."
      : bucket === "SAFETY"
      ? "Safe choice with comfortable margins."
      : "Aspirational reach — competitive but achievable.";

  return `${parts.join("; ")}. ${bucketLabel}`;
}

// ─── Single Course Scoring ────────────────────────────────────────────────────

/**
 * Score a single course against the applicant's profile.
 * Returns null if the course doesn't pass hard filters.
 */
function scoreCourse(course, input, normalizedGpa) {
  // ── Hard filters ──────────────────────────────────────────────────────────

  if (course.minGPA > normalizedGpa) return null;
  if (!meetsEnglishRequirement(input.testScores, course.englishRequirement)) return null;

  const budgetCeiling = input.budgetMax * TUITION_STRETCH_FACTOR;
  if (course.tuitionFee > budgetCeiling) return null;
  if (course.seatsRemaining <= 0) return null;

  // ── Weighted scoring ──────────────────────────────────────────────────────

  const gpaMargin = normalizedGpa - course.minGPA;
  const gpaScore = Math.min(gpaMargin / 1.0, 1.0) * WEIGHT_GPA_MARGIN;

  const budgetHeadroom =
    course.tuitionFee <= input.budgetMax
      ? (input.budgetMax - course.tuitionFee) / input.budgetMax
      : 0;
  const budgetScore = Math.min(budgetHeadroom, 1.0) * WEIGHT_BUDGET_HEADROOM;

  const visaRate = Number(course.university.visaSuccessRate) / 100;
  const visaScore = visaRate * WEIGHT_VISA_SUCCESS;

  const hasScholarship = !!course.scholarshipInfo && course.scholarshipInfo.trim().length > 0;
  const scholarshipScore = hasScholarship ? WEIGHT_SCHOLARSHIP : 0;

  let rankingScore = 0;
  if (course.university.ranking !== null && course.university.ranking > 0) {
    const normalizedRanking = Math.max(
      0,
      1 - course.university.ranking / MAX_RANKING_FOR_NORMALIZATION
    );
    rankingScore = normalizedRanking * WEIGHT_RANKING;
  }

  const totalScore =
    Math.round((gpaScore + budgetScore + visaScore + scholarshipScore + rankingScore) * 100) / 100;

  // ── Bucketing ─────────────────────────────────────────────────────────────

  const withinBudget = course.tuitionFee <= input.budgetMax;
  let bucket;

  if (gpaMargin >= SAFETY_GPA_MARGIN && withinBudget) {
    bucket = "SAFETY";
  } else if (gpaMargin < REACH_GPA_MARGIN || !withinBudget) {
    bucket = "REACH";
  } else {
    bucket = "STRONG_MATCH";
  }

  const rationale = generateRationale(course, input, gpaMargin, withinBudget, hasScholarship, bucket);

  return {
    courseId: course.id,
    courseName: course.name,
    courseLevel: course.level,
    universityId: course.university.id,
    universityName: course.university.name,
    universityCity: course.university.city,
    countryId: course.university.countryId,
    tuitionFee: course.tuitionFee,
    currency: course.currency,
    scholarshipAvailable: hasScholarship,
    score: totalScore,
    bucket,
    rationale,
  };
}

// ─── Batch Scoring & Ranking ──────────────────────────────────────────────────

const BUCKET_PRIORITY = { STRONG_MATCH: 0, SAFETY: 1, REACH: 2 };

/**
 * Score all candidate courses and return the top results, sorted by
 * bucket priority then by score descending within each bucket.
 */
function scoreAndRank(courses, input) {
  const normalizedGpa = normalizeGpa(input.gpa, input.gpaScale);
  const scored = [];

  for (const course of courses) {
    const result = scoreCourse(course, input, normalizedGpa);
    if (result) scored.push(result);
  }

  scored.sort((a, b) => {
    const bucketDiff = BUCKET_PRIORITY[a.bucket] - BUCKET_PRIORITY[b.bucket];
    if (bucketDiff !== 0) return bucketDiff;
    return b.score - a.score;
  });

  return scored.slice(0, MAX_RESULTS);
}

module.exports = {
  normalizeGpa,
  meetsEnglishRequirement,
  getEnglishMargin,
  scoreCourse,
  scoreAndRank,
  TUITION_STRETCH_FACTOR,
  WEIGHT_GPA_MARGIN,
  WEIGHT_BUDGET_HEADROOM,
  WEIGHT_VISA_SUCCESS,
  WEIGHT_SCHOLARSHIP,
  WEIGHT_RANKING,
  MAX_RESULTS,
};
