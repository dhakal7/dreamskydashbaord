import { create } from 'zustand'
import { toast } from 'sonner'
import type { Country } from '@/types'
import { countries as seedCountries } from '@/mock'

interface CountriesState {
  countries: Country[]
  addCountry: (data: Omit<Country, 'id'>) => void
  updateCountry: (id: string, patch: Partial<Country>) => void
  removeCountry: (id: string) => void
}

export const useCountriesStore = create<CountriesState>((set, get) => ({
  countries: seedCountries,

  addCountry: (data) => {
    const id = `c-${data.code.toLowerCase()}`
    if (get().countries.some((c) => c.id === id)) {
      toast.error(`Country with code ${data.code} already exists`)
      return
    }
    const newCountry: Country = { ...data, id }
    set({ countries: [...get().countries, newCountry] })
    toast.success(`${data.name} added as a country`)
  },

  updateCountry: (id, patch) =>
    set((state) => {
      const country = state.countries.find((c) => c.id === id)
      if (country) toast.success(`${country.name} updated`)
      return { countries: state.countries.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
    }),

  removeCountry: (id) =>
    set((state) => {
      const country = state.countries.find((c) => c.id === id)
      if (!country) return state
      toast.success(`${country.name} removed`)
      return { countries: state.countries.filter((c) => c.id !== id) }
    }),
}))
