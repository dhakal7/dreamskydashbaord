import dayjs from 'dayjs'
import { History, Download, Clock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DocumentStatusBadge } from '@/components/shared/status-badges'
import { useDocumentHistory, useDownloadDocument } from '@/hooks/use-documents'
import type { DocumentVersion } from '@/types'

interface VersionHistoryDialogProps {
  documentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VersionHistoryDialog({ documentId, open, onOpenChange }: VersionHistoryDialogProps) {
  const { data: doc, isLoading } = useDocumentHistory(documentId)
  const downloadFn = useDownloadDocument()

  const versions: DocumentVersion[] = doc?.versions && doc.versions.length > 0
    ? doc.versions.map((v: any) => ({
        id: v.id,
        documentId: v.documentId,
        versionNumber: v.versionNumber,
        fileUrl: v.fileUrl,
        originalName: v.originalName || (doc as any).originalName || doc.fileName || 'document',
        mimeType: v.mimeType,
        fileSizeKb: v.fileSize ? Math.round(v.fileSize / 1024) : 0,
        uploadedBy: v.uploadedBy ? `${v.uploadedBy.firstName} ${v.uploadedBy.lastName}` : 'Counselor',
        uploadedAt: v.createdAt,
        status: (v.status || doc.status || 'uploaded').toLowerCase() as any,
        notes: v.notes,
      }))
    : doc
    ? [
        {
          id: doc.id,
          documentId: doc.id,
          versionNumber: doc.version || 1,
          fileUrl: (doc as any).fileUrl || '',
          originalName: doc.fileName || (doc as any).originalName || 'document',
          fileSizeKb: doc.fileSizeKb || 0,
          uploadedBy: doc.uploadedBy || 'Counselor',
          uploadedAt: doc.uploadedAt,
          status: doc.status,
          notes: doc.notes,
        },
      ]
    : []

  const docName = doc ? (doc.customName || (doc as any).originalName || doc.fileName || doc.type) : 'Document'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            <DialogTitle>Version History</DialogTitle>
          </div>
          <DialogDescription>
            Showing all historical versions uploaded for <span className="font-semibold text-foreground">{docName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading version history...</div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No previous version history found.</div>
          ) : (
            versions.map((ver) => (
              <div
                key={ver.id || ver.versionNumber}
                className="rounded-xl border border-border/80 bg-accent/20 p-3.5 space-y-2 transition hover:bg-accent/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      v{ver.versionNumber}
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate max-w-[220px]">
                      {ver.originalName}
                    </span>
                  </div>
                  <DocumentStatusBadge status={ver.status} className="shrink-0 text-[10px]" />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3 text-muted-foreground/80" /> {dayjs(ver.uploadedAt).format('MMM D, YYYY · h:mm A')}
                    </span>
                    <span>•</span>
                    <span>By {ver.uploadedBy}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => downloadFn(doc?.id || ver.documentId, ver.originalName)}
                  >
                    <Download className="size-3" /> Download
                  </Button>
                </div>

                {ver.notes && (
                  <p className="text-[11px] text-muted-foreground bg-background/60 p-2 rounded border border-border/40">
                    <span className="font-semibold text-foreground">Notes:</span> {ver.notes}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
