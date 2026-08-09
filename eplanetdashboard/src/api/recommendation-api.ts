/**
 * recommendation-api.ts  — Phase F5
 *
 * Axios wrappers for dream-sky /recommendations endpoints.
 *
 * The scoring engine uses the student's GPA, budget, and test scores to
 * bucket courses into STRONG_MATCH / REACH / SAFETY categories.
 * POST /recommendations — SUPER_ADMIN or COUNSELOR only.
 */

import { api } from '@/lib/api-client'

export type MatchLevel = 'STRONG_MATCH' | 'REACH' | 'SAFETY'

export interface RecommendationCriteria {
  /** The student record ID whose profile data the engine will read from the DB */
  studentId: string
  targetCountryId?: string
  targetLevel?: string
  targetFieldOfStudy?: string
  maxBudgetUsd?: number
}

export interface RecommendationResult {
  courseId: string
  universityId: string
  courseName: string
  universityName: string
  country: string
  matchLevel: MatchLevel
  score: number
  tuitionFee: number | null
  currency: string | null
}

export interface RecommendationRecord {
  id: string
  studentId: string
  criteria: RecommendationCriteria
  results: RecommendationResult[]
  generatedAt: string
}

export const recommendationApi = {
  /**
   * POST /recommendations
   * Runs the scoring engine against the student's stored profile.
   * Returns a new RecommendationRecord with all match buckets.
   */
  generate(criteria: RecommendationCriteria): Promise<RecommendationRecord> {
    return api.post('/recommendations', criteria)
  },

  /**
   * GET /recommendations/:recordId/latest
   * Returns the most recent recommendation record for this student.
   */
  getLatest(studentId: string): Promise<RecommendationRecord> {
    return api.get(`/recommendations/${studentId}/latest`)
  },

  /**
   * GET /recommendations/:recordId/history
   * Returns all historical recommendation records for this student.
   */
  getHistory(studentId: string): Promise<RecommendationRecord[]> {
    return api.get(`/recommendations/${studentId}/history`)
  },
}
