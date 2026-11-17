import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const panelPath = path.resolve(__dirname, 'components/fee-management-panel.tsx')
const panelSource = fs.readFileSync(panelPath, 'utf8')

describe('Phase 4.10.8 Front Desk Fee Management Panel', () => {
  it('enforces role-based action flags for fee management, reminders, and deletion', () => {
    expect(panelSource).toContain("const canCreateFee = ['super_admin', 'branch_admin', 'front_desk'].includes(currentUser.role)")
    expect(panelSource).toContain('const canManageFees = canCreateFee')
    expect(panelSource).toContain("const canSendReminder = ['super_admin', 'branch_admin', 'front_desk', 'counselor'].includes(currentUser.role)")
    expect(panelSource).toContain("const canDeleteFee = currentUser.role === 'super_admin'")
    expect(panelSource).toContain('{canManageFees && !isPaid && !isCancelled && (')
    expect(panelSource).toContain('{!isPaid && !isCancelled && canSendReminder && (')
    expect(panelSource).toContain('{canManageFees && (')
    expect(panelSource).toContain('{canDeleteFee && (')
  })

  it('renders Cancelled badge and blocks Installment and Send Mail actions for cancelled payments', () => {
    expect(panelSource).toContain("const isCancelled = fee.status === 'CANCELLED'")
    expect(panelSource).toContain('{isCancelled && (')
    expect(panelSource).toContain('Cancelled')
    expect(panelSource).toContain('Total Fee Records')
    expect(panelSource).toContain('Outstanding Fee Records')
    expect(panelSource).not.toContain('stats.dbCount')
    expect(panelSource).not.toContain('stats.localDraftCount')
  })

  it('unlocks Update Fee & Record Installment with proper validation and POST /transactions', () => {
    expect(panelSource).not.toContain('Modifying payment amounts or recording transactions is locked in read-only mode')
    expect(panelSource).toContain('await api.post(`/payments/${installmentRecord.id}/transactions`')
    expect(panelSource).toContain('Total amount cannot be lower than already collected amount')
    expect(panelSource).toContain('Installment amount cannot exceed remaining due')
  })

  it('unlocks Send Fee Due Email with server-generated preview and balance/email guards', () => {
    expect(panelSource).not.toContain('Email dispatch is locked during read-only verification')
    expect(panelSource).toContain('await api.post(`/payments/${mailRecord.id}/remind`)')
    expect(panelSource).toContain('mailRecord.dueAmount <= 0')
    expect(panelSource).toContain("!mailRecord.studentEmail.includes('@')")
  })

  it('supports Cash, Fonepay/Bank Transfer, Card, and Cheque payment methods and refreshes dashboard/payments', () => {
    expect(panelSource).toContain('value="Cash"')
    expect(panelSource).toContain('value="Fonepay"')
    expect(panelSource).toContain('value="Bank Transfer"')
    expect(panelSource).toContain('value="Card"')
    expect(panelSource).toContain('value="Cheque"')
    expect(panelSource).toContain("queryClient.invalidateQueries({ queryKey: paymentKeys.all })")
    expect(panelSource).toContain("queryClient.invalidateQueries({ queryKey: ['dashboard'] })")
  })
})
