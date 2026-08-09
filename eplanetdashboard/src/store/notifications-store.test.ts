import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useNotificationsStore } from './notifications-store'

describe('notifications store email delivery', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ notifications: [] })
    vi.restoreAllMocks()
  })

  it('sends an email when recipient email addresses are provided', () => {
    const sendEmailSpy = vi.fn()
    const originalWindow = globalThis.window

    Object.defineProperty(globalThis, 'window', {
      value: {
        ...originalWindow,
        location: { href: 'http://localhost' },
        open: vi.fn(),
      },
      configurable: true,
    })

    const store = useNotificationsStore.getState()
    store.addNotification({
      title: 'Fee reminder',
      description: 'Your payment is due.',
      type: 'fee_due',
      read: false,
      recipientEmails: ['student@example.com'],
      sendEmail: sendEmailSpy,
    })

    const notifications = useNotificationsStore.getState().notifications
    expect(notifications).toHaveLength(1)
    expect(sendEmailSpy).toHaveBeenCalledWith({
      to: ['student@example.com'],
      subject: 'Fee reminder',
      body: 'Your payment is due.',
    })
  })
})
