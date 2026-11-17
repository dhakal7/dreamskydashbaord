/**
 * use-portal.ts
 *
 * React Query hooks for the Student Portal (/portal/:studentId/*) endpoints.
 * Disabled in mock mode or when studentId is missing.
 */

import { useQuery } from '@tanstack/react-query'
import { isMockMode } from '@/lib/api-client'
import { portalApi } from '@/api/portal-api'

export const portalKeys = {
  all: ['portal'] as const,
  dashboard: (studentId: string) => [...portalKeys.all, studentId, 'dashboard'] as const,
  applications: (studentId: string) => [...portalKeys.all, studentId, 'applications'] as const,
  visaCases: (studentId: string) => [...portalKeys.all, studentId, 'visa-cases'] as const,
  documents: (studentId: string) => [...portalKeys.all, studentId, 'documents'] as const,
  appointments: (studentId: string) => [...portalKeys.all, studentId, 'appointments'] as const,
}

export function usePortalDashboard(studentId?: string) {
  return useQuery({
    queryKey: portalKeys.dashboard(studentId ?? ''),
    queryFn: () => portalApi.getDashboard(studentId!),
    enabled: !isMockMode() && Boolean(studentId),
    staleTime: 60_000,
  })
}

export function usePortalApplications(studentId?: string) {
  return useQuery({
    queryKey: portalKeys.applications(studentId ?? ''),
    queryFn: () => portalApi.getApplications(studentId!),
    enabled: !isMockMode() && Boolean(studentId),
    staleTime: 60_000,
  })
}

export function usePortalVisaCases(studentId?: string) {
  return useQuery({
    queryKey: portalKeys.visaCases(studentId ?? ''),
    queryFn: () => portalApi.getVisaCases(studentId!),
    enabled: !isMockMode() && Boolean(studentId),
    staleTime: 60_000,
  })
}

export function usePortalDocuments(studentId?: string) {
  return useQuery({
    queryKey: portalKeys.documents(studentId ?? ''),
    queryFn: () => portalApi.getDocuments(studentId!),
    enabled: !isMockMode() && Boolean(studentId),
    staleTime: 60_000,
  })
}

export function usePortalAppointments(studentId?: string) {
  return useQuery({
    queryKey: portalKeys.appointments(studentId ?? ''),
    queryFn: () => portalApi.getAppointments(studentId!),
    enabled: !isMockMode() && Boolean(studentId),
    staleTime: 60_000,
  })
}

