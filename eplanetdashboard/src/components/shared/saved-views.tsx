import { BookMarked } from 'lucide-react'
import { Card } from '@/components/ui/card'

const views = [
  { id: 1, name: 'Priority Students', description: 'High-value and active cases' },
  { id: 2, name: 'Visa Ready', description: 'Students with approved or pending visa updates' },
  { id: 3, name: 'Campus Shortlist', description: 'Applicants reviewing multiple universities' },
]

export function SavedViews() {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookMarked className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Saved Views</h3>
      </div>
      <div className="space-y-2">
        {views.map((view) => (
          <div key={view.id} className="rounded-lg border border-border/70 bg-secondary/30 px-3 py-2">
            <p className="text-sm font-medium">{view.name}</p>
            <p className="text-xs text-muted-foreground">{view.description}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
