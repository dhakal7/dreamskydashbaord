import { FeeManagementPanel } from './components/fee-management-panel'

export default function FeesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Fee & Payment Management</h1>
        <p className="text-xs text-muted-foreground">
          View due & fully paid student fees, record new payment collections, and dispatch email reminders.
        </p>
      </div>
      <FeeManagementPanel />
    </div>
  )
}
