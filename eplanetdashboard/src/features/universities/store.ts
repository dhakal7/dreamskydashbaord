import { create } from 'zustand'
import { toast } from 'sonner'
import type { University } from '@/types'
import { universities as seedUniversities } from '@/mock'
import { useCountriesStore } from '@/features/countries/store'

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

interface UniversitiesState {
  universities: University[]
  addUniversity: (data: Omit<University, 'id' | 'countryName' | 'flag' | 'logoInitial'>) => void
  updateUniversity: (id: string, patch: Partial<University>) => void
  removeUniversity: (id: string) => void
}

export const useUniversitiesStore = create<UniversitiesState>((set, get) => ({
  universities: seedUniversities,

  addUniversity: (data) => {
    const country = useCountriesStore.getState().countries.find((c) => c.id === data.countryId)
    if (!country) {
      toast.error('Country not found')
      return
    }
    const existing = get().universities.filter((u) => u.countryId === data.countryId)
    const index = existing.length + 1
    const slug = toSlug(data.name)
    const id = `uni-${slug}-${index}`
    const newUniversity: University = {
      ...data,
      id,
      countryName: country.name,
      flag: country.flag,
      logoInitial: data.name[0],
    }
    set({ universities: [...get().universities, newUniversity] })
    useCountriesStore.getState().updateCountry(country.id, { universityCount: country.universityCount + 1 })
    toast.success(`${data.name} added as a university`)
  },

  updateUniversity: (id, patch) =>
    set((state) => {
      const uni = state.universities.find((u) => u.id === id)
      if (uni) toast.success(`${uni.name} updated`)
      return { universities: state.universities.map((u) => (u.id === id ? { ...u, ...patch } : u)) }
    }),

  removeUniversity: (id) =>
    set((state) => {
      const uni = state.universities.find((u) => u.id === id)
      if (!uni) return state
      const country = useCountriesStore.getState().countries.find((c) => c.id === uni.countryId)
      if (country) {
        useCountriesStore.getState().updateCountry(country.id, { universityCount: Math.max(0, country.universityCount - 1) })
      }
      toast.success(`${uni.name} removed`)
      return { universities: state.universities.filter((u) => u.id !== id) }
    }),
}))
