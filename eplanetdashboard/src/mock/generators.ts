// Small seeded PRNG so mock data is stable across reloads (no hydration surprises).
export function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260709)

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

export function pickMany<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rand() * copy.length)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}

export function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min
}

export function randFloat(min: number, max: number, decimals = 1) {
  const v = rand() * (max - min) + min
  return Number(v.toFixed(decimals))
}

export function pad(num: number, len: number) {
  return String(num).padStart(len, '0')
}

export function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export function daysFromNow(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

export function randomDateWithinDays(rangeDays: number) {
  const offset = randInt(-rangeDays, rangeDays)
  return offset >= 0 ? daysFromNow(offset) : daysAgo(-offset)
}

export const firstNamesMale = [
  'Aarav', 'Bibek', 'Sujan', 'Rohan', 'Nischal', 'Prasan', 'Sagar', 'Bishal',
  'Kiran', 'Anish', 'Sandesh', 'Prashant', 'Sunil', 'Rajan', 'Ashish', 'Dipesh',
  'Nabin', 'Manish', 'Yogesh', 'Saurav', 'Pravin', 'Rabin', 'Suman', 'Deepak',
  'Bikash', 'Sushant', 'Ujjwal', 'Pratik', 'Aayush', 'Kushal',
]

export const firstNamesFemale = [
  'Anjali', 'Sabina', 'Pratistha', 'Sneha', 'Manisha', 'Sarita', 'Nisha', 'Priya',
  'Sunita', 'Bandana', 'Rachana', 'Kritika', 'Rojina', 'Sabnam', 'Alisha', 'Sabita',
  'Reeya', 'Sujata', 'Anisha', 'Puja', 'Bina', 'Diksha', 'Namrata', 'Sristi',
  'Roshani', 'Sadikshya', 'Prasansha', 'Sabika', 'Merina', 'Rejina',
]

export const lastNames = [
  'Shrestha', 'Sharma', 'Poudel', 'Gurung', 'Tamang', 'Rai', 'Karki', 'Thapa',
  'Basnet', 'Adhikari', 'Bhattarai', 'Khadka', 'Magar', 'Limbu', 'Maharjan',
  'Pandey', 'Regmi', 'Bista', 'Chhetri', 'KC', 'Neupane', 'Acharya', 'Bhandari',
  'Lama', 'Dahal', 'Joshi', 'Subedi', 'Baral',
]

export function randomFullName() {
  const isMale = rand() > 0.48
  const first = pick(isMale ? firstNamesMale : firstNamesFemale)
  const last = pick(lastNames)
  return { name: `${first} ${last}`, gender: isMale ? ('male' as const) : ('female' as const) }
}

export function randomPhone() {
  return `98${randInt(0, 4)}${randInt(1000000, 9999999)}`
}

export function randomEmail(name: string) {
  const clean = name.toLowerCase().replace(/\s+/g, '.')
  return `${clean}${randInt(1, 99)}@gmail.com`
}

export function randomPassport() {
  return `PA${randInt(1000000, 9999999)}`
}
