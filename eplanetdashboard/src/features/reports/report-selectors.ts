import dayjs from 'dayjs'
import type { CurrentUser } from '@/types'
import {
  students, leads, applications, visaCases, counselors, countries, universities,
} from '@/mock'
import {
  visibleStudents, visibleLeads, visibleApplications, visibleVisaCases,
} from '@/lib/data-visibility'

export interface ReportFilters {
  country: string
  counselor: string
  university: string
  dateFrom: string
  dateTo: string
}

function matchesCountry(dataCountry: string, filterCountry: string): boolean {
  return filterCountry === 'all' || dataCountry === filterCountry
}

function matchesUniversity(dataUni: string, filterUni: string): boolean {
  return filterUni === 'all' || dataUni === filterUni
}

function matchesDateRange(dateStr: string, dateFrom: string, dateTo: string): boolean {
  if (!dateStr) return true
  const d = dayjs(dateStr)
  if (dateFrom && d.isBefore(dayjs(dateFrom), 'day')) return false
  if (dateTo && d.isAfter(dayjs(dateTo), 'day')) return false
  return true
}

function matchesCounselor(counselorId: string, filterCounselor: string): boolean {
  return filterCounselor === 'all' || counselorId === filterCounselor
}

export function getReportStats(user: CurrentUser, filters: ReportFilters) {
  const scopedStudents = visibleStudents(user, students)
  const scopedLeads = visibleLeads(user, leads)
  const scopedApplications = visibleApplications(user, applications, students)
  const scopedVisa = visibleVisaCases(user, visaCases, students)

  const filteredStudents = scopedStudents.filter((s) =>
    matchesCountry(s.preferredCountries[0] ?? '', filters.country) &&
    matchesCounselor(s.counselorId, filters.counselor) &&
    matchesDateRange(s.createdAt, filters.dateFrom, filters.dateTo)
  )
  const filteredLeads = scopedLeads.filter((l) =>
    matchesCountry(l.interestedCountry, filters.country) &&
    matchesCounselor(l.counselorId, filters.counselor) &&
    matchesDateRange(l.createdAt, filters.dateFrom, filters.dateTo)
  )
  const filteredApplications = scopedApplications.filter((a) =>
    matchesCountry(a.countryName, filters.country) &&
    matchesUniversity(a.universityName, filters.university) &&
    matchesDateRange(a.submittedDate, filters.dateFrom, filters.dateTo)
  )
  const filteredVisa = scopedVisa.filter((v) =>
    matchesCountry(v.countryName, filters.country)
  )

  const totalStudents = filteredStudents.length
  const totalLeads = filteredLeads.length
  const totalApplications = filteredApplications.length
  const visaProcessing = filteredVisa.filter((v) => v.overallStatus === 'in_progress' || v.overallStatus === 'submitted').length

  return [
    { label: 'Students', value: totalStudents },
    { label: 'Leads', value: totalLeads },
    { label: 'Applications', value: totalApplications },
    { label: 'Visa Processing', value: visaProcessing },
  ]
}

export function getApplicationsByMonth(user: CurrentUser, filters: ReportFilters) {
  const scoped = visibleApplications(user, applications, students)
  const filtered = scoped.filter((a) =>
    matchesCountry(a.countryName, filters.country) &&
    matchesUniversity(a.universityName, filters.university) &&
    matchesDateRange(a.submittedDate, filters.dateFrom, filters.dateTo)
  )

  const months = Array.from({ length: 6 }).map((_, i) => dayjs().subtract(5 - i, 'month'))
  return months.map((m) => ({
    month: m.format('MMM'),
    applications: filtered.filter((a) => dayjs(a.submittedDate).isSame(m, 'month')).length,
  }))
}

export function getLeadsByMonth(user: CurrentUser, filters: ReportFilters) {
  const scoped = visibleLeads(user, leads)
  const filtered = scoped.filter((l) =>
    matchesCountry(l.interestedCountry, filters.country) &&
    matchesCounselor(l.counselorId, filters.counselor) &&
    matchesDateRange(l.createdAt, filters.dateFrom, filters.dateTo)
  )

  const months = Array.from({ length: 6 }).map((_, i) => dayjs().subtract(5 - i, 'month'))
  return months.map((m) => ({
    month: m.format('MMM'),
    leads: filtered.filter((l) => dayjs(l.createdAt).isSame(m, 'month')).length,
    converted: filtered.filter((l) => dayjs(l.createdAt).isSame(m, 'month') && l.stage === 'completed').length,
  }))
}

export function getConversionTrend(user: CurrentUser, filters: ReportFilters) {
  const scopedLeads = visibleLeads(user, leads)
  const scopedApps = visibleApplications(user, applications, students)

  const months = Array.from({ length: 6 }).map((_, i) => dayjs().subtract(5 - i, 'month'))
  return months.map((m) => {
    const monthLeads = scopedLeads.filter((l) =>
      dayjs(l.createdAt).isSame(m, 'month') &&
      matchesCountry(l.interestedCountry, filters.country) &&
      matchesCounselor(l.counselorId, filters.counselor)
    ).length
    const monthApps = scopedApps.filter((a) =>
      dayjs(a.submittedDate).isSame(m, 'month') &&
      matchesCountry(a.countryName, filters.country) &&
      matchesUniversity(a.universityName, filters.university)
    ).length
    const rate = monthLeads > 0 ? Math.round((monthApps / monthLeads) * 100) : 0
    return { month: m.format('MMM'), rate, leads: monthLeads, applications: monthApps }
  })
}

export function getCountryDistribution(user: CurrentUser, filters: ReportFilters) {
  const scoped = visibleStudents(user, students)
  const counts = new Map<string, number>()
  scoped.forEach((s) => {
    const country = s.preferredCountries[0] ?? 'Unknown'
    if (matchesCountry(country, filters.country) && matchesCounselor(s.counselorId, filters.counselor)) {
      counts.set(country, (counts.get(country) ?? 0) + 1)
    }
  })
  const countryFlags = new Map(countries.map((c) => [c.name, c.flag]))
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value, flag: countryFlags.get(name) ?? '' }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}

export function getSourceDistribution(user: CurrentUser, filters: ReportFilters) {
  const scoped = visibleLeads(user, leads)
  const counts = new Map<string, number>()
  scoped.forEach((l) => {
    if (matchesCountry(l.interestedCountry, filters.country) && matchesCounselor(l.counselorId, filters.counselor)) {
      const src = l.source.replace('_', ' ')
      counts.set(src, (counts.get(src) ?? 0) + 1)
    }
  })
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

export function getCumulativeStudents(user: CurrentUser, filters: ReportFilters) {
  const scoped = visibleStudents(user, students)
  const filtered = scoped.filter((s) =>
    matchesCountry(s.preferredCountries[0] ?? '', filters.country) &&
    matchesCounselor(s.counselorId, filters.counselor)
  ).sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())

  const months = Array.from({ length: 6 }).map((_, i) => dayjs().subtract(5 - i, 'month'))
  let cumulative = 0
  return months.map((m) => {
    const monthCount = filtered.filter((s) => dayjs(s.createdAt).isSame(m, 'month')).length
    cumulative += monthCount
    return { month: m.format('MMM'), students: cumulative }
  })
}

export function getCounselorsForFilter() {
  return counselors.map((c) => ({ id: c.id, name: c.name }))
}

export function getUniversitiesForFilter() {
  return universities.map((u) => ({ id: u.id, name: u.name }))
}
