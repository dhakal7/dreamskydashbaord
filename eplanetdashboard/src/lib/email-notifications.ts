import { api, isMockMode } from './api-client'
import { toast } from 'sonner'

export interface EmailNotificationPayload {
  to: string[]
  subject: string
  body: string
}

export function sendEmailNotification(payload: EmailNotificationPayload): boolean {
  const recipients = payload.to.filter(Boolean)
  if (recipients.length === 0) {
    return false
  }

  if (!isMockMode()) {
    recipients.forEach(async (email) => {
      try {
        await api.post('/notifications/send', {
          to: email,
          subject: payload.subject,
          body: payload.body,
        })
        toast.success(`Email sent to ${email}`)
      } catch (err: any) {
        toast.error(`Failed to send email to ${email}: ${err.message}`)
      }
    })
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  const mailtoUrl = `mailto:${encodeURIComponent(recipients.join(','))}?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.body)}`

  try {
    window.location.href = mailtoUrl
    return true
  } catch {
    return false
  }
}
