import { Sparkles, CheckCircle2, TrendingUp, ShieldCheck, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { Student } from '@/types'
import { useGenerateRecommendations, useLatestRecommendation } from '@/hooks/use-recommendations'

export function PreferencesTab({ student }: { student: Student }) {
  const { data: latestRec, isLoading: isFetchingRec } = useLatestRecommendation(student.id)
  const generateRec = useGenerateRecommendations()

  const handleGenerate = () => {
    generateRec.mutate({
      studentId: student.id,
      targetCountryId: student.preferredCountries[0],
      targetLevel: student.preferredLevel,
      maxBudgetUsd: student.budgetUsd,
    })
  }

  const matches = latestRec?.results ?? []

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <h4 className="text-sm font-semibold text-foreground">Study Preferences</h4>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Preferred Countries</p>
          <div className="flex flex-wrap gap-1.5">
            {student.preferredCountries.map((c) => (
              <Badge key={c} variant="info">{c}</Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Preferred Level</p>
            <p className="mt-0.5 text-[13px] font-medium capitalize">{student.preferredLevel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Budget</p>
            <p className="mt-0.5 font-tabular text-[13px] font-medium">{formatCurrency(student.budgetUsd)}</p>
          </div>
        </div>
      </Card>

      {/* ── AI Recommendation Engine Section ── */}
      <Card className="border-brand-500/20 bg-gradient-to-br from-brand-500/5 via-background to-brand-500/10 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">AI Course & University Recommendation Engine</h4>
              <p className="text-xs text-muted-foreground">Matches student GPA, budget, and test scores against university requirements</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generateRec.isPending || isFetchingRec}
            className="gap-1.5 bg-brand-600 text-white hover:bg-brand-700"
          >
            {generateRec.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Run AI Engine
          </Button>
        </div>

        {isFetchingRec ? (
          <div className="flex items-center justify-center py-8 text-center">
            <Loader2 className="size-5 animate-spin text-primary mr-2" />
            <span className="text-xs text-muted-foreground">Evaluating matching courses...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <Sparkles className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No AI recommendations generated yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Click &quot;Run AI Engine&quot; above to calculate matching courses and universities based on this student&apos;s academic background and study preferences.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {matches.map((item: any) => (
              <div key={item.courseId + item.universityName} className="flex items-center justify-between rounded-lg border border-border/80 bg-card p-3 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{item.courseName}</span>
                    {item.matchLevel === 'STRONG_MATCH' && <Badge variant="success" className="gap-1 text-[10px]"><CheckCircle2 className="size-3" /> Strong Match</Badge>}
                    {item.matchLevel === 'REACH' && <Badge variant="warning" className="gap-1 text-[10px]"><TrendingUp className="size-3" /> Reach Target</Badge>}
                    {item.matchLevel === 'SAFETY' && <Badge variant="info" className="gap-1 text-[10px]"><ShieldCheck className="size-3" /> Safety Choice</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.universityName} • {item.country}</p>
                </div>

                <div className="text-right">
                  <span className="text-sm font-bold font-tabular text-brand-600">{item.score}% Match</span>
                  {item.tuitionFee && (
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.tuitionFee)} / yr</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
