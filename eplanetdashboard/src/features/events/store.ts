import { create } from 'zustand'
import { toast } from 'sonner'
import type { Event } from '@/types'
import { events as seedEvents } from '@/mock'



interface EventsState {
  events: Event[]
  addEvent: (data: Omit<Event, 'id'>) => Event
  deleteEvent: (id: string) => void
}

function getNextEventId(current: Event[]) {
  const numericIds = current
    .map((event) => parseInt(event.id.replace('evt-', ''), 10))
    .filter((n) => !Number.isNaN(n))

  const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0
  return `evt-${String(maxId + 1).padStart(3, '0')}`
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: seedEvents,

  addEvent: (data) => {
    const newEvent: Event = {
      ...data,
      id: getNextEventId(get().events),
    }

    set((state) => ({
      events: [...state.events, newEvent],
    }))

    toast.success(`Event “${newEvent.name}” created successfully.`)
    return newEvent
  },

  deleteEvent: (id) => {
    const event = get().events.find((item) => item.id === id)

    set((state) => ({
      events: state.events.filter((item) => item.id !== id),
    }))

    if (event) {
      toast.success(`Event “${event.name}” deleted.`)
    }
  },
}))
