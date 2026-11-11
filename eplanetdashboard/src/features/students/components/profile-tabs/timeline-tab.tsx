import { useMemo } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/card'
import type { Student } from '@/types'
import { useStudentTimeline } from '@/hooks/use-students'
import { useApplications } from '@/hooks/use-applications'
import { useVisaCases } from '@/hooks/use-visa'
import { useDocuments } from '@/hooks/use-documents'
import { useFollowUps } from '@/hooks/use-followups'
import { isMockMode } from '@/lib/api-client'
import {
  User,
  FileText,
  Send,
  Plane,
  MessageSquare,
  ShieldAlert,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

interface TimelineEvent {
  id: string
  date: string
  title: string
  desc: React.ReactNode
  icon: React.ElementType
  color: string
}

function formatStageName(stage?: string): string {
  if (!stage) return 'Stage'
  return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export function TimelineTab({ student }: { student: Student }) {
  const { data: timelineData, isLoading: isLoadingTimeline, isError: isTimelineError } = useStudentTimeline(student.id)
  const { data: appsData, isLoading: isLoadingApps, isError: isAppsError } = useApplications({ studentId: student.id })
  const { data: visaData, isLoading: isLoadingVisa, isError: isVisaError } = useVisaCases({ studentId: student.id })
  const { data: docsData, isLoading: isLoadingDocs, isError: isDocsError } = useDocuments({ studentId: student.id })
  const { data: followUpsData, isLoading: isLoadingFollowUps, isError: isFollowUpsError } = useFollowUps({ studentId: student.id })

  const isInitialLoading =
    !isMockMode() &&
    isLoadingTimeline &&
    isLoadingApps &&
    isLoadingVisa &&
    isLoadingDocs &&
    isLoadingFollowUps

  const hasPartialError = !isMockMode() && (isTimelineError || isAppsError || isVisaError || isDocsError || isFollowUpsError)

  const events: TimelineEvent[] = useMemo(() => {
    const list: TimelineEvent[] = []

    // 1. Profile Creation Event
    list.push({
      id: `created_${student.id}`,
      date: student.createdAt || new Date().toISOString(),
      title: 'Profile Created',
      desc: (
        <span className="text-xs text-muted-foreground">
          Student registered in CRM{student.counselorName ? ` and assigned to ${student.counselorName}` : ''}.
        </span>
      ),
      icon: User,
      color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    })

    // 2. Stage History Events
    if (Array.isArray(timelineData)) {
      timelineData.forEach((item: any) => {
        const stageName = item.stage || item.toStage || 'Updated'
        list.push({
          id: `stage_${item.id}`,
          date: item.changedAt,
          title: `Stage: ${formatStageName(stageName)}`,
          desc: (
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span>
                Moved to {formatStageName(stageName)}
                {item.changedBy ? ` by ${item.changedBy.firstName || ''} ${item.changedBy.lastName || ''}`.trim() : ''}.
              </span>
              {item.reasonCode && <span className="text-[11px] italic">Note: {item.reasonCode}</span>}
            </div>
          ),
          icon: User,
          color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
        })
      })
    }

    // 3. Document Upload Events
    if (docsData?.documents && Array.isArray(docsData.documents)) {
      docsData.documents.forEach((doc: any) => {
        list.push({
          id: `doc_${doc.id}`,
          date: doc.createdAt || doc.uploadedAt || student.createdAt,
          title: `Document: ${doc.originalName || doc.fileName || doc.customName || doc.type || 'Document'}`,
          desc: (
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span>Category: {doc.category || 'General'}</span>
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted font-medium uppercase text-muted-foreground">
                {doc.status || 'UPLOADED'}
              </span>
            </div>
          ),
          icon: FileText,
          color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
        })
      })
    }

    // 4. Application Events
    if (appsData?.applications && Array.isArray(appsData.applications)) {
      appsData.applications.forEach((app: any) => {
        const uName = app.university?.name || 'Institution'
        const cName = app.course?.name || 'Selected Program'
        list.push({
          id: `app_${app.id}`,
          date: app.submittedAt || app.createdAt || student.createdAt,
          title: `Application: ${uName}`,
          desc: (
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span>{cName}</span>
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium uppercase">
                {app.status || 'SUBMITTED'}
              </span>
            </div>
          ),
          icon: Send,
          color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        })

        // Offers attached to application
        if (app.offers && Array.isArray(app.offers)) {
          app.offers.forEach((offer: any) => {
            list.push({
              id: `offer_${offer.id}`,
              date: offer.receivedAt || app.updatedAt || app.createdAt,
              title: `Offer Received: ${uName}`,
              desc: (
                <span className="text-xs text-muted-foreground">
                  {offer.type === 'CONDITIONAL' ? 'Conditional Offer' : 'Unconditional Offer'} issued.
                </span>
              ),
              icon: Send,
              color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
            })
          })
        }
      })
    }

    // 5. Visa Case Events
    if (visaData?.visaCases && Array.isArray(visaData.visaCases)) {
      visaData.visaCases.forEach((vc: any) => {
        const country = vc.country || 'Destination'
        list.push({
          id: `visa_${vc.id}`,
          date: vc.decisionDate || vc.submittedAt || vc.createdAt || student.createdAt,
          title: `Visa Case: ${country}`,
          desc: (
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span>{vc.visaType || 'Student Visa'}</span>
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium uppercase">
                {vc.status || 'PREPARING'}
              </span>
            </div>
          ),
          icon: Plane,
          color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        })
      })
    }

    // 6. Follow-up / Communication Events
    if (followUpsData?.followUps && Array.isArray(followUpsData.followUps)) {
      followUpsData.followUps.forEach((fu: any) => {
        list.push({
          id: `fu_${fu.id}`,
          date: fu.createdAt || student.createdAt,
          title: `Communication (${fu.channel || 'PHONE'}: ${fu.direction || 'OUTBOUND'})`,
          desc: (
            <div className="text-xs text-muted-foreground mt-0.5">
              {fu.author && (
                <span className="font-medium text-foreground">
                  {fu.author.firstName} {fu.author.lastName}:{' '}
                </span>
              )}
              <span>{fu.content ? (fu.content.length > 120 ? `${fu.content.slice(0, 120)}…` : fu.content) : 'Follow-up logged.'}</span>
            </div>
          ),
          icon: MessageSquare,
          color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
        })
      })
    }

    // Deduplicate and sort chronologically
    const map = new Map<string, TimelineEvent>()
    list.forEach((ev) => map.set(ev.id, ev))

    return Array.from(map.values()).sort((a, b) => {
      const timeA = dayjs(a.date).isValid() ? dayjs(a.date).valueOf() : 0
      const timeB = dayjs(b.date).isValid() ? dayjs(b.date).valueOf() : 0
      return timeA - timeB
    })
  }, [student, timelineData, docsData, appsData, visaData, followUpsData])

  if (isInitialLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-2">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading verified student timeline…</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Phase 5A Read-Only Notice ─────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-2.5 text-xs text-sky-800 dark:border-sky-800/40 dark:bg-sky-950/40 dark:text-sky-300">
        <ShieldAlert className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span>
          <strong>Phase 5A Read-Only Mode:</strong> Timeline events reflect strictly verified records from the database across student history, applications, visa cases, documents, and communications.
        </span>
      </div>

      {hasPartialError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
          <span>Some sub-records could not be loaded; displaying all verified records currently available.</span>
        </div>
      )}

      {events.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <p className="text-sm text-muted-foreground">No verified timeline events recorded for this student.</p>
        </Card>
      ) : (
        <div className="relative pl-4 sm:pl-0">
          {/* Vertical line connecting timeline dots */}
          <div className="absolute left-6 sm:left-[111px] top-4 bottom-4 w-px bg-border/80 hidden sm:block" />

          <div className="space-y-6">
            {events.map((event) => {
              const Icon = event.icon
              const formattedDate = dayjs(event.date).isValid() ? dayjs(event.date) : dayjs()

              return (
                <div key={event.id} className="relative flex flex-col sm:flex-row gap-4 sm:gap-6 group">
                  {/* Date Column */}
                  <div className="hidden sm:flex w-24 shrink-0 flex-col items-end pt-1">
                    <span className="text-sm font-medium text-foreground">{formattedDate.format('MMM D')}</span>
                    <span className="text-xs text-muted-foreground">{formattedDate.format('YYYY')}</span>
                  </div>

                  {/* Connector Dot */}
                  <div
                    className="absolute left-[-23px] sm:static sm:left-auto flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] border-background z-10 shadow-sm transition-transform group-hover:scale-110 duration-200"
                    style={{ backgroundColor: 'var(--background)' }}
                  >
                    <div className={`flex size-6 items-center justify-center rounded-full ${event.color}`}>
                      <Icon className="size-3.5" />
                    </div>
                  </div>

                  {/* Content Card */}
                  <Card className="flex-1 p-4 shadow-sm group-hover:shadow-soft transition-shadow border-border/60">
                    <div className="sm:hidden mb-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {formattedDate.format('MMM D, YYYY')}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold">{event.title}</h4>
                    <div className="mt-1">{event.desc}</div>
                  </Card>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

