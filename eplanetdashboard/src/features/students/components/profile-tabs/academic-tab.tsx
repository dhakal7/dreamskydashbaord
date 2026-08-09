import { Card } from '@/components/ui/card'
import type { Student } from '@/types'

export function AcademicTab({ student }: { student: Student }) {
  return (
    <div className="space-y-3">
      {student.academics.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No academic records available.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/60">
              <tr>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Level</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institution</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Board</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">GPA / %</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passed Year</th>
              </tr>
            </thead>
            <tbody>
              {student.academics.map((rec, i) => (
                <tr key={i} className="border-b border-border/70 last:border-0">
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[13px] font-medium">{rec.level}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[13px]">{rec.institution}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[13px]">{rec.board}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 font-tabular text-[13px]">{rec.gpaOrPercentage}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 font-tabular text-[13px]">{rec.passedYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
