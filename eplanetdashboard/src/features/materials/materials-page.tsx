import { useMemo } from 'react'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { Bookmark, FileText, Download } from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
import { useClassMaterialsStore } from '@/features/classes/materials-store'
import { enrollments } from '@/mock'

export default function MaterialsPage() {
  const linkedId = useAuthStore((s) => s.currentUser.linkedId)
  const classMaterials = useClassMaterialsStore((s) => s.materials)

  const enrolledClassIds = useMemo(() => enrollments.filter((e) => e.studentId === linkedId).map((e) => e.classId), [linkedId])
  const myClassMaterials = useMemo(() => classMaterials.filter((m) => enrolledClassIds.includes(m.classId)), [classMaterials, enrolledClassIds])

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
                  {myClassMaterials.length}
                </span>
              </div>
            </CardTitle>
            <CardDescription>Download or preview teacher-uploaded files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {myClassMaterials.length === 0 ? (
              <EmptyState icon={Bookmark} title="No materials yet" description="Materials from your teachers will appear here." className="py-8" />
            ) : (
              <div className="space-y-2">
                {myClassMaterials.map((material) => (
                  <div key={material.id} className="rounded-lg border border-border/70 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{material.title}</p>
                        {material.fileName && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            <FileText className="inline mr-1 size-3" /> {material.fileName}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{material.type}</p>
                      </div>
                      {material.fileUrl && (
                        <a href={material.fileUrl} download={material.fileName} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent">
                          <Download className="size-3" /> Download
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
