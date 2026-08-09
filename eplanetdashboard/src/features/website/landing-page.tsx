import { Link } from 'react-router-dom'
import { BadgeCheck, Compass, GraduationCap, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-2 font-semibold">
            <GraduationCap className="size-4 text-primary" />
            E-Planet Consultancy
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/website/contact">Contact</Link>
            </Button>
            <Button asChild>
              <Link to="/website/inquiry">Apply Now</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 lg:px-8 lg:py-16">
        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-sm text-muted-foreground">
              <Sparkles className="size-3.5" />
              Trusted study-abroad guidance for ambitious students
            </div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Study abroad with clarity, confidence, and a dedicated team.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              From counseling to visa support, we guide students through every step with transparent communication and expert planning.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/website/inquiry">Start your journey</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/website/contact">Book a consultation</Link>
              </Button>
            </div>
          </div>

          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Compass className="size-5" />
                </div>
                <div>
                  <p className="font-semibold">Personalized support</p>
                  <p className="text-sm text-muted-foreground">Counseling, admissions, and visa planning coordinated in one place.</p>
                </div>
              </div>
              <div className="space-y-2">
                {['University shortlisting', 'Scholarship guidance', 'Visa readiness support'].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BadgeCheck className="size-4 text-primary" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </section>
      </main>
    </div>
  )
}
