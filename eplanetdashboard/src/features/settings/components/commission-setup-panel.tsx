import { useState } from 'react'
import { Percent, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCommissionSettingsStore, type AgentCommissionRule } from '../commission-settings-store'
import type { CommissionRuleType, CommissionTriggerStage } from '@/types'

function CommissionSetupPanel() {
  const {
    counselorType,
    counselorValue,
    counselorTrigger,
    agentRules,
    setCounselorType,
    setCounselorValue,
    setCounselorTrigger,
    updateAgentRule,
  } = useCommissionSettingsStore()

  const [counselorInput, setCounselorInput] = useState<string>(String(counselorValue))

  const handleSaveCounselor = () => {
    const parsed = parseFloat(counselorInput)
    if (isNaN(parsed) || parsed < 0) return
    setCounselorValue(parsed)
  }

  const handleSaveAgentRules = () => {
    // Persist — currently no-op in mock
  }

  const activeAgentRules = agentRules.filter((r: AgentCommissionRule) => r.active)
  const inactiveAgentRules = agentRules.filter((r: AgentCommissionRule) => !r.active)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="size-4 text-muted-foreground" />
            Counselor Commission — Global Rule
          </CardTitle>
          <CardDescription>
            This commission structure applies to all counselors uniformly. Set one rule that governs
            how every counselor earns commission.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Commission Type</label>
              <Select value={counselorType} onValueChange={(v: CommissionRuleType) => setCounselorType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Amount (₨)</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="tiered">Tiered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {counselorType === 'fixed' ? 'Amount (NPR)' : counselorType === 'percentage' ? 'Percentage (%)' : 'Base Value'}
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={counselorInput}
                onChange={(e) => setCounselorInput(e.target.value)}
                onBlur={handleSaveCounselor}
                placeholder={counselorType === 'fixed' ? 'e.g. 150' : counselorType === 'percentage' ? 'e.g. 5' : 'e.g. 8'}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Trigger Stage</label>
              <Select value={counselorTrigger} onValueChange={(v: CommissionTriggerStage) => setCounselorTrigger(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offer_received">Offer Received</SelectItem>
                  <SelectItem value="fee_paid">Fee Paid</SelectItem>
                  <SelectItem value="visa_granted">Visa Granted</SelectItem>
                  <SelectItem value="enrolled">Enrolled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveCounselor} className="gap-1.5">
              <Save className="size-4" />
              Save Counselor Rule
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="size-4 text-muted-foreground" />
            Referral Agent Commission — Per-Agent Rules
          </CardTitle>
          <CardDescription>
            Each referral agent can have a custom commission structure. Configure individual rates,
            types, and trigger stages per agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeAgentRules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active Agents ({activeAgentRules.length})
              </p>
              {activeAgentRules.map((rule: AgentCommissionRule) => (
                <div
                  key={rule.agentId}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 p-3 sm:grid-cols-5 sm:items-end"
                >
                  <div className="space-y-1 sm:col-span-1">
                    <label className="text-xs font-medium text-muted-foreground">Agent</label>
                    <p className="text-sm font-medium truncate">{rule.agentName}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <Select
                      value={rule.type}
                      onValueChange={(v: CommissionRuleType) => updateAgentRule(rule.agentId, 'type', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed ($)</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="tiered">Tiered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Value</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rule.value}
                      onChange={(e) => updateAgentRule(rule.agentId, 'value', parseFloat(e.target.value) || 0)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Trigger</label>
                    <Select
                      value={rule.triggerStage}
                      onValueChange={(v: CommissionTriggerStage) => updateAgentRule(rule.agentId, 'triggerStage', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offer_received">Offer Received</SelectItem>
                        <SelectItem value="fee_paid">Fee Paid</SelectItem>
                        <SelectItem value="visa_granted">Visa Granted</SelectItem>
                        <SelectItem value="enrolled">Enrolled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateAgentRule(rule.agentId, 'active', false)}
                      className="text-xs"
                    >
                      Deactivate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {inactiveAgentRules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Inactive Agents ({inactiveAgentRules.length})
              </p>
              {inactiveAgentRules.map((rule: AgentCommissionRule) => (
                <div
                  key={rule.agentId}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{rule.agentName}</p>
                    <p className="text-xs text-muted-foreground/60">Commission inactive</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateAgentRule(rule.agentId, 'active', true)}
                  >
                    Reactivate
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveAgentRules} className="gap-1.5">
              <Save className="size-4" />
              Save All Agent Rules
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export default CommissionSetupPanel
