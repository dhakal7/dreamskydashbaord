import dayjs from 'dayjs'
import {
  students, leads, followUps, applications, visaCases, appointments, activities, counselors, countries,
} from '@/mock'

export function getDashboardStats() {
  const totalStudents = students.length
  const newLeadsThisMonth = leads.filter((l) => dayjs(l.createdAt).isAfter(dayjs().subtract(30, 'day'))).length
  const todaysFollowUps = followUps.filter((f) => dayjs(f.date).isSame(dayjs(), 'day')).length
  const totalApplications = applications.length
  const offerLetters = applications.filter((a) => a.stage === 'conditional_offer' || a.stage === 'unconditional_offer').length
  const visaProcessing = visaCases.filter((v) => v.overallStatus === 'in_progress' || v.overallStatus === 'submitted').length
  const enrolledStudents = students.filter((s) => s.status === 'enrolled').length

  return [
    { label: 'Total Students', value: totalStudents, delta: '+8.2%', trend: 'up' as const },
    { label: 'New Leads', value: newLeadsThisMonth, delta: '+12.4%', trend: 'up' as const },
    { label: "Today's Follow-ups", value: todaysFollowUps, delta: 'Due today', trend: 'flat' as const },
    { label: 'Applications', value: totalApplications, delta: '+5.1%', trend: 'up' as const },
    { label: 'Offer Letters', value: offerLetters, delta: '+3', trend: 'up' as const },
    { label: 'Visa Processing', value: visaProcessing, delta: `${visaCases.length} total cases`, trend: 'flat' as const },
    { label: 'Enrolled Students', value: enrolledStudents, delta: '+2 this month', trend: 'up' as const },
  ]
}

export function getMonthlyLeadsData() {
  const months = Array.from({ length: 6 }).map((_, i) => dayjs().subtract(5 - i, 'month'))
  return months.map((m) => ({
    month: m.format('MMM'),
    leads: leads.filter((l) => dayjs(l.createdAt).isSame(m, 'month')).length,
    converted: leads.filter((l) => dayjs(l.createdAt).isSame(m, 'month') && l.stage === 'completed').length,
  }))
}

export function getCountryDistribution() {
  return countries
    .map((c) => ({ name: c.name, value: c.studentCount, flag: c.flag }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
}

export function getUniversityDistribution() {
  const counts = new Map<string, number>()
  applications.forEach((a) => counts.set(a.universityName, (counts.get(a.universityName) ?? 0) + 1))
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
}

export function getLeadSourceDistribution() {
  const counts = new Map<string, number>()
  leads.forEach((l) => counts.set(l.source, (counts.get(l.source) ?? 0) + 1))
  return Array.from(counts.entries()).map(([name, value]) => ({
    name: name.replace('_', ' '),
    value,
  }))
}

export function getCounselorPerformance() {
  return counselors
    .map((c) => ({ name: c.name.split(' ')[0], students: c.studentsHandled, conversion: c.conversionRate }))
    .sort((a, b) => b.students - a.students)
}

export function getTodaysAppointments() {
  return appointments
    .filter((a) => dayjs(a.start).isSame(dayjs(), 'day'))
    .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())
}

export function getRecentActivities(limit = 8) {
  return [...activities].sort((a, b) => dayjs(b.timestamp).valueOf() - dayjs(a.timestamp).valueOf()).slice(0, limit)
}

export function getUpcomingFollowUps(limit = 6) {
  return [...followUps]
    .filter((f) => f.status === 'pending')
    .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())
    .slice(0, limit)
}

export function getRecentStudents(limit = 5) {
  return [...students].sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()).slice(0, limit)
}

export function getRecentApplications(limit = 5) {
  return [...applications].sort((a, b) => dayjs(b.lastUpdate).valueOf() - dayjs(a.lastUpdate).valueOf()).slice(0, limit)
}
