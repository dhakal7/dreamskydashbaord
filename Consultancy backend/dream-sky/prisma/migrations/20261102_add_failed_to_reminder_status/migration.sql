-- DreamSky CRM: Phase 34E.11C - Additive ReminderStatus Enum Extension
-- Objective: Add 'FAILED' value to ReminderStatus enum for terminal reminder failure tracking.
-- PostgreSQL 12+ / 16+ safe: Additive enum extension without table locks or row rewrites.

ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'FAILED';

