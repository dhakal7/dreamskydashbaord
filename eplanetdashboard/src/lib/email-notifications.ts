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
