import type { Counselor, Country, Course, University } from '@/types'
import { pad, pick, randFloat, randInt } from './generators'
import importedData from './imported-data.json'

export const countries: Country[] = [
  {
    id: 'c-au', name: 'Australia', code: 'AU', flag: '🇦🇺', universityCount: 6, studentCount: 142,
    popularCourses: ['Business Analytics', 'Nursing', 'IT'], visaDifficulty: 'moderate', avgTuitionUsd: 24000,
  },
  {
    id: 'c-uk', name: 'United Kingdom', code: 'UK', flag: '🇬🇧', universityCount: 5, studentCount: 118,
    popularCourses: ['MBA', 'Computer Science', 'Public Health'], visaDifficulty: 'moderate', avgTuitionUsd: 21000,
  },
  {
    id: 'c-ca', name: 'Canada', code: 'CA', flag: '🇨🇦', universityCount: 4, studentCount: 97,
    popularCourses: ['Data Analytics', 'Hospitality', 'Engineering'], visaDifficulty: 'strict', avgTuitionUsd: 18500,
  },
  {
    id: 'c-us', name: 'United States', code: 'US', flag: '🇺🇸', universityCount: 3, studentCount: 54,
    popularCourses: ['Computer Science', 'MBA', 'Data Science'], visaDifficulty: 'strict', avgTuitionUsd: 32000,
  },
  {
    id: 'c-nz', name: 'New Zealand', code: 'NZ', flag: '🇳🇿', universityCount: 2, studentCount: 33,
    popularCourses: ['Agriculture', 'IT', 'Hospitality'], visaDifficulty: 'easy', avgTuitionUsd: 19500,
  },
  {
    id: 'c-jp', name: 'Japan', code: 'JP', flag: '🇯🇵', universityCount: 2, studentCount: 21,
    popularCourses: ['Engineering', 'Japanese Studies'], visaDifficulty: 'moderate', avgTuitionUsd: 9500,
  },
  {
    id: 'c-de', name: 'Germany', code: 'DE', flag: '🇩🇪', universityCount: 2, studentCount: 16,
    popularCourses: ['Mechanical Engineering', 'Computer Science'], visaDifficulty: 'moderate', avgTuitionUsd: 4000,
  },
  {
    id: 'c-ma', name: 'Malta', code: 'MT', flag: '🇲🇹', universityCount: 1, studentCount: 9,
    popularCourses: ['Business Management'], visaDifficulty: 'easy', avgTuitionUsd: 12000,
  },
]

const universitySeeds: Array<[string, string, string, number]> = [
  ['University of Melbourne', 'c-au', 'Melbourne', 14],
  ['Monash University', 'c-au', 'Melbourne', 42],
  ['University of Sydney', 'c-au', 'Sydney', 19],
  ['RMIT University', 'c-au', 'Melbourne', 140],
  ['Deakin University', 'c-au', 'Geelong', 251],
  ['Griffith University', 'c-au', 'Brisbane', 301],
  ['University of Manchester', 'c-uk', 'Manchester', 32],
  ['University of Leeds', 'c-uk', 'Leeds', 75],
  ['Coventry University', 'c-uk', 'Coventry', 501],
  ['University of Greenwich', 'c-uk', 'London', 601],
  ['Cardiff Metropolitan University', 'c-uk', 'Cardiff', 701],
  ['University of Toronto', 'c-ca', 'Toronto', 21],
  ['Conestoga College', 'c-ca', 'Kitchener', 851],
  ['Centennial College', 'c-ca', 'Toronto', 901],
  ['Douglas College', 'c-ca', 'New Westminster', 1001],
  ['Arizona State University', 'c-us', 'Tempe', 121],
  ['University of Illinois Chicago', 'c-us', 'Chicago', 251],
  ['Northeastern University', 'c-us', 'Boston', 176],
  ['University of Auckland', 'c-nz', 'Auckland', 68],
  ['Auckland University of Technology', 'c-nz', 'Auckland', 401],
  ['University of Tokyo', 'c-jp', 'Tokyo', 28],
  ['Ritsumeikan Asia Pacific Univ.', 'c-jp', 'Beppu', 601],
  ['TU Munich', 'c-de', 'Munich', 37],
  ['University of Stuttgart', 'c-de', 'Stuttgart', 251],
  ['University of Malta', 'c-ma', 'Msida', 501],
]

const countryMap = new Map(countries.map((c) => [c.id, c]))

export const universities: University[] = universitySeeds.map(([name, countryId, city, ranking], i) => {
  const country = countryMap.get(countryId)!
  return {
    id: `uni-${pad(i + 1, 3)}`,
    name,
    countryId,
    countryName: country.name,
    flag: country.flag,
    city,
    ranking,
    logoInitial: name[0],
    scholarshipAvailable: rand_bool(i),
    scholarshipDetail: rand_bool(i) ? `Up to ${randInt(15, 50)}% merit scholarship` : undefined,
    applicationDeadline: ['2026-09-15', '2026-10-01', '2027-01-15', '2027-02-28'][i % 4],
    acceptanceRate: randFloat(28, 78, 0),
    tuitionFromUsd: randInt(country.avgTuitionUsd - 4000, country.avgTuitionUsd + 6000),
    intakes: pick([['Feb', 'Jul'], ['Sep', 'Jan'], ['Jan', 'May', 'Sep']]),
    courseCount: randInt(6, 24),
  }
})

function rand_bool(seedOffset: number) {
  return (seedOffset * 7919) % 5 < 3
}

const fieldsByLevel: Record<string, string[]> = {
  bachelor: ['Business Administration', 'Computer Science', 'Nursing', 'Civil Engineering', 'Hospitality Management'],
  master: ['MBA', 'Data Analytics', 'Public Health', 'Information Technology', 'Project Management', 'Cyber Security'],
  diploma: ['Business Management', 'Hospitality', 'Early Childhood Education', 'Community Services'],
  foundation: ['Foundation in Business', 'Foundation in Engineering'],
  phd: ['Engineering (PhD)', 'Public Policy (PhD)'],
}

export const courses: Course[] = universities.flatMap((uni, uIdx) => {
  const levels: Array<Course['level']> = ['bachelor', 'master', 'diploma']
  return levels.map((level, lIdx) => {
    const field = fieldsByLevel[level][(uIdx + lIdx) % fieldsByLevel[level].length]
    return {
      id: `course-${uni.id}-${lIdx}`,
      name: field,
      universityId: uni.id,
      universityName: uni.name,
      countryName: uni.countryName,
      level,
      duration: level === 'master' ? `${randInt(1, 2)} years` : level === 'diploma' ? `${randInt(1, 2)} years` : '3-4 years',
      intake: uni.intakes,
      tuitionUsd: uni.tuitionFromUsd + randInt(-2000, 4000),
      field,
    }
  })
})

// keep exactly 15 as requested for the "Course" module summary, but retain full catalog for lookups
export const featuredCourses = courses.slice(0, 15)

export const counselors: Counselor[] = (importedData as any).counselors && (importedData as any).counselors.length > 0
  ? ((importedData as any).counselors as Counselor[])
  : [
      { id: 'cmsejoq9m0000z0tyq5vy1ytd', name: 'Dipshikha Dawadi', email: 'dipshikha.dawadi@dreamsky.com', avatarColor: '#2563EB', role: 'senior_counselor', studentsHandled: 235, conversionRate: 68, branchId: 'br-1' },
      { id: 'cmsejoqao0002z0tyce0e72ll', name: 'Amit Dhodari', email: 'amit.dhodari@dreamsky.com', avatarColor: '#7C3AED', role: 'counselor', studentsHandled: 110, conversionRate: 62, branchId: 'br-1' },
      { id: 'cmsejoqar0004z0tygo6vjk76', name: 'Vaibhav Joshi', email: 'vaibhav.joshi@dreamsky.com', avatarColor: '#0EA5E9', role: 'counselor', studentsHandled: 110, conversionRate: 59, branchId: 'br-1' }
    ]

