import { useState, useEffect, useMemo } from 'react'
import { Percent, Save, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCommissionSettingsStore, type AgentCommissionRule } from '../commission-settings-store'
import { useCommissionRules, useCreateCommissionRule, useUpdateCommissionRule } from '@/hooks/use-commissions'
import { isMockMode } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth-store'
import type { CommissionRuleType, CommissionTriggerStage } from '@/types'

function CommissionSetupPanel() {
  const mockMode = isMockMode()
  const currentUser = useAuthStore((s) => s.currentUser)
  const isSuperAdmin = currentUser.role === 'super_admin'

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

  const { data: apiRulesData, isLoading: isRulesLoading, isError: isRulesError, refetch: refetchRules } = useCommissionRules()
  const createRuleMutation = useCreateCommissionRule()
  const updateRuleMutation = useUpdateCommissionRule()

  const liveRulesList = useMemo(() => {
    if (mockMode) return []
    return Array.isArray(apiRulesData) ? apiRulesData : apiRulesData?.rules || []
  }, [mockMode, apiRulesData])

  const liveCounselorRule = useMemo(
    () => liveRulesList.find((r: any) => String(r.role).toUpperCase() === 'COUNSELOR' && r.isActive !== false)
      ?? liveRulesList.find((r: any) => String(r.role).toUpperCase() === 'COUNSELOR'),
    [liveRulesList]
  )

  const liveAgentRules = useMemo<AgentCommissionRule[]>(
    () =>
      liveRulesList
        .filter((r: any) => String(r.role).toUpperCase() === 'REFERRAL_AGENT')
        .map((r: any) => ({
          agentId: r.id,
          agentName: r.name || `Rule ${r.id.slice(-6)}`,
          type: (String(r.type || 'FIXED').toLowerCase() as CommissionRuleType),
          value: Number(r.fixedAmount ?? r.percentage ?? r.amount ?? 0),
          triggerStage: (String(r.triggerStage || 'ENROLLED').toLowerCase() as CommissionTriggerStage),
          active: r.isActive ?? true,
        })),
    [liveRulesList]
  )

  const [liveCounselorType, setLiveCounselorType] = useState<CommissionRuleType>('fixed')
  const [liveCounselorTrigger, setLiveCounselorTrigger] = useState<CommissionTriggerStage>('enrolled')
  const [counselorInput, setCounselorInput] = useState<string>(mockMode ? String(counselorValue) : '0')
  const [editedAgentRules, setEditedAgentRules] = useState<Record<string, AgentCommissionRule>>({})

  useEffect(() => {
    if (mockMode) return
    if (liveCounselorRule) {
      const rType = String(liveCounselorRule.type || 'FIXED').toLowerCase() as CommissionRuleType
      const rTrigger = String(liveCounselorRule.triggerStage || 'ENROLLED').toLowerCase() as CommissionTriggerStage
      const rVal = Number((liveCounselorRule as any).fixedAmount ?? (liveCounselorRule as any).percentage ?? liveCounselorRule.amount ?? 0)
      setLiveCounselorType(rType)
      setLiveCounselorTrigger(rTrigger)
      setCounselorInput(String(rVal))
    } else {
      setCounselorInput('0')
    }
  }, [mockMode, liveCounselorRule])

  useEffect(() => {
    if (mockMode) return
    const map: Record<string, AgentCommissionRule> = {}
    for (const r of liveAgentRules) {
      map[r.agentId] = r
    }
    setEditedAgentRules(map)
  }, [mockMode, liveAgentRules])

  const effectiveCounselorType = mockMode ? counselorType : liveCounselorType
  const effectiveCounselorTrigger = mockMode ? counselorTrigger : liveCounselorTrigger

  const handleSaveCounselor = () => {
    const parsed = parseFloat(counselorInput)
    if (isNaN(parsed) || parsed < 0) return

    if (mockMode) {
      setCounselorValue(parsed)
      return
    }
    if (!isSuperAdmin) return

    const backendType = effectiveCounselorType.toUpperCase()
    const payload: Record<string, unknown> = {
      role: 'COUNSELOR',
      type: backendType,
      triggerStage: effectiveCounselorTrigger.toUpperCase(),
      isActive: true,
      ...(backendType === 'FIXED' ? { fixedAmount: parsed } : {}),
      ...(backendType === 'PERCENTAGE' ? { percentage: parsed } : {}),
    }

    if (liveCounselorRule?.id) {
      updateRuleMutation.mutate({ id: liveCounselorRule.id, body: payload })
    } else {
      createRuleMutation.mutate({
        ...payload,
        effectiveFrom: new Date().toISOString(),
      })
    }
  }

  const handleAgentFieldChange = (agentId: string, field: keyof AgentCommissionRule, value: unknown) => {
    if (mockMode) {
      updateAgentRule(agentId, field, value as any)
      return
    }
    setEditedAgentRules((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [field]: value,
      },
    }))
  }

  const handleSaveAgentRules = async () => {
    if (mockMode || !isSuperAdmin) return
    const rulesToUpdate = Object.values(editedAgentRules)
    try {
      for (const rule of rulesToUpdate) {
        const backendType = rule.type.toUpperCase()
        await updateRuleMutation.mutateAsync({
          id: rule.agentId,
          body: {
            type: backendType,
            triggerStage: rule.triggerStage.toUpperCase(),
            isActive: rule.active,
            ...(backendType === 'FIXED' ? { fixedAmount: rule.value } : {}),
            ...(backendType === 'PERCENTAGE' ? { percentage: rule.value } : {}),
          },
        })
      }
    } catch {
      // Error toast is handled by useUpdateCommissionRule's onError
    }
  }

  const displayedAgentRules = mockMode ? agentRules : Object.values(editedAgentRules)
  const activeAgentRules = displayedAgentRules.filter((r: AgentCommissionRule) => r.active)
  const inactiveAgentRules = displayedAgentRules.filter((r: AgentCommissionRule) => !r.active)

  if (!mockMode && isRulesLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading commission rules from server...
        </CardContent>
      </Card>
    )
  }

  if (!mockMode && isRulesError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex items-center justify-between py-6 text-sm text-destructive">
          <span>Failed to load commission rules from the server.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => refetchRules()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

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
              <Select
                value={effectiveCounselorType}
                onValueChange={(v: CommissionRuleType) =>
                  mockMode ? setCounselorType(v) : setLiveCounselorType(v)
                }
                disabled={!mockMode && !isSuperAdmin}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Amount (NPR)</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="tiered">Tiered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {effectiveCounselorType === 'fixed' ? 'Amount (NPR)' : effectiveCounselorType === 'percentage' ? 'Percentage (%)' : 'Base Value'}
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={counselorInput}
                onChange={(e) => setCounselorInput(e.target.value)}
                placeholder={effectiveCounselorType === 'fixed' ? 'e.g. 150' : effectiveCounselorType === 'percentage' ? 'e.g. 5' : 'e.g. 8'}
                disabled={!mockMode && !isSuperAdmin}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Trigger Stage</label>
              <Select
                value={effectiveCounselorTrigger}
                onValueChange={(v: CommissionTriggerStage) =>
                  mockMode ? setCounselorTrigger(v) : setLiveCounselorTrigger(v)
                }
                disabled={!mockMode && !isSuperAdmin}
              >
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
            <Button
              type="button"
              onClick={handleSaveCounselor}
              disabled={(!mockMode && !isSuperAdmin) || createRuleMutation.isPending || updateRuleMutation.isPending}
              className="gap-1.5"
            >
              <Save className="size-4" />
              {createRuleMutation.isPending || updateRuleMutation.isPending ? 'Saving...' : 'Save Counselor Rule'}
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
          {!mockMode && displayedAgentRules.length === 0 && (
            <p className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
              No referral agent commission rules configured in the database yet.
            </p>
          )}
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
                      onValueChange={(v: CommissionRuleType) => handleAgentFieldChange(rule.agentId, 'type', v)}
                      disabled={!mockMode && !isSuperAdmin}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed (NPR)</SelectItem>
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
                      onChange={(e) => handleAgentFieldChange(rule.agentId, 'value', parseFloat(e.target.value) || 0)}
                      className="h-9"
                      disabled={!mockMode && !isSuperAdmin}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Trigger</label>
                    <Select
                      value={rule.triggerStage}
                      onValueChange={(v: CommissionTriggerStage) => handleAgentFieldChange(rule.agentId, 'triggerStage', v)}
                      disabled={!mockMode && !isSuperAdmin}
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
                      onClick={() => handleAgentFieldChange(rule.agentId, 'active', false)}
                      disabled={!mockMode && !isSuperAdmin}
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
                    onClick={() => handleAgentFieldChange(rule.agentId, 'active', true)}
                    disabled={!mockMode && !isSuperAdmin}
                  >
                    Reactivate
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSaveAgentRules}
              disabled={(!mockMode && (!isSuperAdmin || displayedAgentRules.length === 0)) || updateRuleMutation.isPending}
              className="gap-1.5"
            >
              <Save className="size-4" />
              {updateRuleMutation.isPending ? 'Saving...' : 'Save All Agent Rules'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export default CommissionSetupPanel
