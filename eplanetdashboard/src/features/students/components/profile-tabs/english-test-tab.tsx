import dayjs from 'dayjs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Student } from '@/types'

export function EnglishTestTab({ student }: { student: Student }) {
  const test = student.englishTest

  if (test.type === 'None') {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">No English test taken yet.</p>
      </Card>
    )
  }

  const bands = [
    { label: 'Overall', value: test.overallScore, highlight: true },
    { label: 'Listening', value: test.listening },
    { label: 'Reading', value: test.reading },
    { label: 'Writing', value: test.writing },
    { label: 'Speaking', value: test.speaking },
  ]

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant="default" className="text-sm px-3 py-1">{test.type}</Badge>
        {test.testDate && (
          <span className="text-xs text-muted-foreground font-tabular">
            Taken on {dayjs(test.testDate).format('MMM D, YYYY')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-3">
        {bands.map((b) => (
          <div
            key={b.label}
            className={`rounded-lg border border-border p-3 text-center ${b.highlight ? 'bg-primary/5 border-primary/20' : ''}`}
          >
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className={`mt-1 font-tabular text-lg font-semibold ${b.highlight ? 'text-primary' : ''}`}>
              {b.value ?? '—'}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
