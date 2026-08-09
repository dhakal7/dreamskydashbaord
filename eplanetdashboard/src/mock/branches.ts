import type { Branch } from '@/types'
import { randInt } from './generators'

const branchSeeds: Array<[string, string, boolean, string]> = [
  ['Chabahil Branch', 'Kathmandu', true, 'Sristi Baral'],
  ['Butwal Branch', 'Butwal', false, 'Nabin Shrestha'],
  ['Pokhara Branch', 'Pokhara', false, 'Bikash Karki'],
  ['Itahari Branch', 'Itahari', false, 'Reeya Tamang'],
]

export const branches: Branch[] = branchSeeds.map(([name, city, isHeadOffice, managerName], i) => ({
  id: `br-${i + 1}`,
  name,
  city,
  isHeadOffice,
  managerName,
  staffCount: randInt(4, 12),
  studentCount: randInt(40, 160),
  monthlyRevenueUsd: randInt(18000, 62000),
  monthlyTargetUsd: randInt(40000, 70000),
}))
