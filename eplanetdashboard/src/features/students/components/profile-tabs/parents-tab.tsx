import { Phone, Mail, Briefcase } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Student } from '@/types'

export function ParentsTab({ student }: { student: Student }) {
  if (student.parents.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">No parent/guardian records available.</p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {student.parents.map((parent) => (
        <Card key={parent.id} className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">{parent.name}</p>
            <Badge variant="slate" className="capitalize">{parent.relation}</Badge>
          </div>
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="size-3" /> {parent.phone}
            </p>
            {parent.email && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="size-3" /> {parent.email}
              </p>
            )}
            {parent.occupation && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Briefcase className="size-3" /> {parent.occupation}
              </p>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
