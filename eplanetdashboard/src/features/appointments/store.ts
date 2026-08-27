import { create } from 'zustand'
import { toast } from 'sonner'
import type { Appointment } from '@/types'
import { appointments as seedAppointments } from '@/mock'

import { isMockMode } from '@/lib/api-client'

interface AppointmentsState {
  appointments: Appointment[]
  addAppointment: (data: Omit<Appointment, 'id'>) => Appointment
  updateAppointment: (id: string, patch: Partial<Appointment>) => void
  cancelAppointment: (id: string) => void
  removeAppointment: (id: string) => void
}

export const useAppointmentsStore = create<AppointmentsState>((set, get) => ({
  appointments: isMockMode() ? seedAppointments : [],

  addAppointment: (data) => {
    const current = get().appointments
    
    // Find the next available numeric index for id (e.g. appt-031)
    const numericIds = current
      .map((a) => parseInt(a.id.replace('appt-', ''), 10))
      .filter((n) => !isNaN(n))
    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0
    const nextNum = maxId + 1
    
    const newAppt: Appointment = {
      ...data,
      id: `appt-${String(nextNum).padStart(3, '0')}`,
    }

    set({ appointments: [...current, newAppt] })
    toast.success(`Appointment for ${newAppt.studentName} scheduled successfully.`)
    return newAppt
  },

  updateAppointment: (id, patch) =>
    set((state) => {
      const appt = state.appointments.find((a) => a.id === id)
      if (appt) {
        toast.success(`Appointment for ${appt.studentName} updated successfully.`)
      }
      return {
        appointments: state.appointments.map((a) =>
          a.id === id ? { ...a, ...patch } : a
        ),
      }
    }),

  cancelAppointment: (id) =>
    set((state) => {
      const appt = state.appointments.find((a) => a.id === id)
      if (appt) {
        toast.success(`Appointment for ${appt.studentName} has been cancelled.`)
      }
      return {
        appointments: state.appointments.map((a) =>
          a.id === id ? { ...a, status: 'cancelled' } : a
        ),
      }
    }),

  removeAppointment: (id) =>
    set((state) => {
      const appt = state.appointments.find((a) => a.id === id)
      if (appt) {
        toast.success(`Appointment for ${appt.studentName} deleted.`)
      }
      return {
        appointments: state.appointments.filter((a) => a.id !== id),
      }
    }),
}))
