import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface InquiryFormState {
  fullName: string
  email: string
  destination: string
  notes: string
}

const initialState: InquiryFormState = {
  fullName: '',
  email: '',
  destination: '',
  notes: '',
}

import { useSubmitInquiry } from '@/hooks/use-public'

export default function InquiryPage() {
  const [form, setForm] = useState<InquiryFormState>(initialState)
  const [submitted, setSubmitted] = useState(false)
  const submitInquiry = useSubmitInquiry()

  const canSubmit = useMemo(() => {
    return form.fullName.trim() && form.email.trim() && form.destination.trim()
  }, [form.email, form.destination, form.fullName])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    const parts = form.fullName.trim().split(' ')
    const firstName = parts[0] || 'Inquirer'
    const lastName = parts.slice(1).join(' ') || 'User'

    submitInquiry.mutate(
      {
        firstName,
        lastName,
        email: form.email,
        interestedCountry: form.destination,
        message: form.notes || 'Inquiry submitted from public website.',
      },
      {
        onSuccess: () => {
          setSubmitted(true)
          setForm(initialState)
        },
      }
    )
  }


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 lg:px-8">
          <Link to="/website" className="font-semibold">E-Planet Consultancy</Link>
          <Button variant="ghost" asChild>
            <Link to="/website/contact">Contact</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 lg:px-8">
        <Card className="p-6 sm:p-8">
          <div className="mb-6 space-y-2">
            <h1 className="text-2xl font-semibold">Tell us about your study plans</h1>
            <p className="text-sm text-muted-foreground">Share a few details and our team will reach out with the next steps.</p>
          </div>

          {submitted ? (
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
              <CheckCircle2 className="mt-0.5 size-4" />
              <div>
                <p className="font-semibold">Inquiry received</p>
                <p className="mt-1">Thanks for reaching out. We will contact you shortly with personalized guidance.</p>
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                placeholder="Full name"
                value={form.fullName}
                onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              />
              <Input
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
              <Select
                value={form.destination}
                onValueChange={(value) => setForm((current) => ({ ...current, destination: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Destination country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Australia">Australia</SelectItem>
                  <SelectItem value="Canada">Canada</SelectItem>
                  <SelectItem value="UK">UK</SelectItem>
                  <SelectItem value="USA">USA</SelectItem>
                </SelectContent>
              </Select>
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="What are you looking for?"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
              <Button type="submit" disabled={!canSubmit}>
                <Send className="mr-2 size-4" /> Submit inquiry
              </Button>
            </form>
          )}
        </Card>
      </main>
    </div>
  )
}
