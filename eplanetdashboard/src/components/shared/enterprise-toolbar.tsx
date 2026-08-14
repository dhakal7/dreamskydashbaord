import { Download, FileText, Printer, Save, SlidersHorizontal, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { exportCsv } from '@/lib/export'
import { students } from '@/mock'

export function EnterpriseToolbar({ label = 'Quick actions' }: { label?: string }) {
  const exportStudents = () => {
    const rows = students.map((student) => ({
      id: student.studentId,
      name: student.name,
      counselor: student.counselorName,
      status: student.status,
      country: student.preferredCountries[0] ?? '—',
      budgetUsd: student.budgetUsd,
    }))
    exportCsv('dreamsky-students.csv', rows)
    toast.success('Exported student workbook')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/80 p-2 shadow-soft">
      <div className="mr-1 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <Button variant="outline" size="sm" onClick={() => toast.success('Saved view updated')}>
        <Save className="mr-1.5 size-3.5" /> Save view
      </Button>
      <Button variant="outline" size="sm" onClick={() => toast.success('Filters applied')}>
        <SlidersHorizontal className="mr-1.5 size-3.5" /> Filters
      </Button>
      <Button variant="outline" size="sm" onClick={() => toast.success('Exported PDF report')}>
        <FileText className="mr-1.5 size-3.5" /> PDF
      </Button>
      <Button variant="outline" size="sm" onClick={exportStudents}>
        <Download className="mr-1.5 size-3.5" /> Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="mr-1.5 size-3.5" /> Print
      </Button>
      <Button variant="ghost" size="sm" onClick={() => toast.success('Smart insights ready')}>
        <Sparkles className="mr-1.5 size-3.5" /> Insights
      </Button>
    </div>
  )
}
