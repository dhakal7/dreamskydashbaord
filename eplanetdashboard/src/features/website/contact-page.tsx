import { Link } from 'react-router-dom'
import { ArrowRight, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 lg:px-8">
          <Link to="/website" className="font-semibold">Dream Sky Consultancy</Link>
          <Button variant="ghost" asChild>
            <Link to="/website/inquiry">Inquiry Form</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <Card className="p-6">
          <h1 className="text-2xl font-semibold">Get in touch</h1>
          <p className="mt-2 text-sm text-muted-foreground">Our advisors are ready to help with applications, visa planning, and university selection.</p>
          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Mail className="size-4 text-primary" /> hello@dreamskyeducation.com</div>
            <div className="flex items-center gap-2"><Phone className="size-4 text-primary" /> +977 9800000000</div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold">Why students choose us</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>• Personalized university shortlist based on your profile</li>
            <li>• Clear timelines for applications and visa milestones</li>
            <li>• Dedicated support from counseling to enrollment</li>
          </ul>
          <Button className="mt-6" asChild>
            <Link to="/website/inquiry">Start your inquiry <ArrowRight className="ml-2 size-4" /></Link>
          </Button>
        </Card>
      </main>
    </div>
  )
}
