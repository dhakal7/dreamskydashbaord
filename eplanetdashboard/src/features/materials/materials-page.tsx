import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { Bookmark, FileText, Download } from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
import { useClassMaterialsStore } from '@/features/classes/materials-store'
import { enrollments } from '@/mock'
import { isMockMode } from '@/lib/api-client'
import { classApi } from '@/api/class-api'
import { classKeys } from '@/hooks/use-classes'

export default function MaterialsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const linkedId = useMemo(() => {
    if (!currentUser) return ''
    if (isMockMode()) {
      return currentUser.linkedId || ''
    }
    // In live mode, require a verified student linkedId and never fall back to User.id
    if (!currentUser.linkedId || currentUser.linkedId === currentUser.id) {
      return ''
    }
    return currentUser.linkedId
  }, [currentUser])
  const classMaterials = useClassMaterialsStore((s) => s.materials)

  const enrollmentsQuery = useQuery({
    queryKey: classKeys.studentEnrollments(linkedId),
    queryFn: () => classApi.getStudentEnrollments(linkedId),
    enabled: !isMockMode() && !!linkedId,
  })

  const liveEnrolledClassIds = useMemo(() => {
    if (isMockMode()) return []
    const raw = enrollmentsQuery.data
    const list = Array.isArray(raw) ? raw : (raw as any)?.enrollments ?? []
    return Array.from<string>(
      new Set(
        list
          .map((e: any) => e.classId || e.class?.id)
          .filter((cid: unknown): cid is string => typeof cid === 'string' && cid.length > 0)
      )
    )
  }, [enrollmentsQuery.data])

  const contentQueries = useQueries({
    queries: liveEnrolledClassIds.map((classId: string) => ({
      queryKey: classKeys.content(classId),
      queryFn: () => classApi.listContent(classId),
      enabled: !isMockMode() && !!classId,
    })),
  })

  const isLiveLoading =
    !isMockMode() &&
    (enrollmentsQuery.isLoading || contentQueries.some((q) => q.isLoading))

  const isLiveError =
    !isMockMode() &&
    (enrollmentsQuery.isError || contentQueries.some((q) => q.isError))

  const liveErrorMessage =
    (enrollmentsQuery.error as Error)?.message ||
    (contentQueries.find((q) => q.error)?.error as Error)?.message ||
    'Unable to load class materials from the server.'

  const handleRetryLive = () => {
    if (enrollmentsQuery.isError) {
      enrollmentsQuery.refetch()
    }
    contentQueries.forEach((q) => {
      if (q.isError) q.refetch()
    })
  }

  const enrolledClassIds = useMemo(
    () => (isMockMode() ? enrollments.filter((e) => e.studentId === linkedId).map((e) => e.classId) : liveEnrolledClassIds),
    [linkedId, liveEnrolledClassIds]
  )

  const myClassMaterials = useMemo(() => {
    if (!isMockMode()) {
      return contentQueries.flatMap((q) =>
        (q.data ?? []).map((c) => {
          const resolvedFileUrl = c.fileUrl ?? c.url ?? undefined
          const resolvedDescription = c.body ?? c.description ?? undefined
          return {
            id: c.id,
            classId: c.classId,
            title: c.title,
            type: (c.type?.toLowerCase() as any) ?? 'material',
            uploadedAt: c.createdAt,
            dueDate: c.dueDate ?? undefined,
            fileUrl: resolvedFileUrl,
            fileName: resolvedFileUrl ? c.title : undefined,
            description: resolvedDescription,
          }
        })
      )
    }
    return classMaterials.filter((m) => enrolledClassIds.includes(m.classId))
  }, [classMaterials, enrolledClassIds, contentQueries])

  return (
    <div className="space-y-5">
      <PageHeader title="My Materials" description="All materials provided by your teachers across enrolled classes." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Bookmark className="size-4 text-primary" />
                Materials
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold size-5">
                  {isLiveLoading || isLiveError || (!isMockMode() && !linkedId) ? '—' : myClassMaterials.length}
                </span>
              </div>
            </CardTitle>
            <CardDescription>Download or preview teacher-uploaded files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isMockMode() && !linkedId ? (
              <EmptyState
                icon={Bookmark}
                title="Student profile not linked"
                description="Your portal account is not linked to a verified student record yet. Please contact your counselor or administrator."
                className="py-8"
              />
            ) : isLiveLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Loading your class materials…
              </div>
            ) : isLiveError ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-xs font-semibold text-destructive">Failed to load materials</p>
                <p className="text-xs text-muted-foreground">{liveErrorMessage}</p>
                <Button size="sm" variant="outline" className="h-7 text-xs mt-1" onClick={handleRetryLive}>
                  Retry
                </Button>
              </div>
            ) : myClassMaterials.length === 0 ? (
              <EmptyState icon={Bookmark} title="No materials yet" description="Materials from your teachers will appear here." className="py-8" />
            ) : (
              <div className="space-y-2">
                {myClassMaterials.map((material) => (
                  <div key={material.id} className="rounded-lg border border-border/70 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{material.title}</p>
                        {(material as any).description && (
                          <p className="text-xs text-muted-foreground mt-1">{(material as any).description}</p>
                        )}
                        {material.fileName && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            <FileText className="inline mr-1 size-3" /> {material.fileName}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{material.type}</p>
                      </div>
                      {material.fileUrl && (
                        <a
                          href={material.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={isMockMode() ? material.fileName : undefined}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                        >
                          <Download className="size-3" /> {isMockMode() ? 'Download' : 'Open'}
                        </a>
                      )}
                    </div>
                    {material.dueDate && <p className="mt-1.5 text-xs text-amber-600">Due: {dayjs(material.dueDate).format('MMM D, YYYY')}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
