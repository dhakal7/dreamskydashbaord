import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Clock, Video, Target, Building2, Printer, BellRing, Sparkles } from 'lucide-react'
import type { Role } from '@/types'

export function RoleSettingsPanel({ role }: { role: Role }) {
  if (role === 'counselor') return <CounselorSettingsPanel />
  if (role === 'teacher') return <TeacherSettingsPanel />
  if (role === 'student') return <StudentSettingsPanel />
  if (role === 'referral_agent') return <ReferralAgentSettingsPanel />
  if (role === 'front_desk') return <FrontDeskSettingsPanel />
  return null
}

/* ── Counselor Settings Panel ────────────────────────────────────────── */

function CounselorSettingsPanel() {
  const [meetingUrl, setMeetingUrl] = useState('https://meet.google.com/abc-defg-hij')
  const [dailyLeadQuota, setDailyLeadQuota] = useState('15')
  const [notifyLeadAssigned, setNotifyLeadAssigned] = useState(true)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success('Counselor consultation settings updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-4 text-primary" />
          Counselor Consultation & Availability Settings
        </CardTitle>
        <CardDescription>
          Configure your online consultation link, daily lead assignments, and availability schedule
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Virtual Meeting Link (Zoom / Google Meet)</label>
            <div className="relative">
              <Input
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://zoom.us/j/123456789"
                icon={<Video />}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Target Daily Lead Capacity</label>
              <Input
                type="number"
                value={dailyLeadQuota}
                onChange={(e) => setDailyLeadQuota(e.target.value)}
                placeholder="15"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Working Hours Schedule</label>
              <Input value="Mon - Fri (10:00 AM - 5:00 PM)" readOnly className="bg-muted/50" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="notify-leads"
              checked={notifyLeadAssigned}
              onCheckedChange={(checked) => setNotifyLeadAssigned(Boolean(checked))}
            />
            <label htmlFor="notify-leads" className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
              Notify me instantly via email & notification popups when a new lead is assigned
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit">Save Counselor Settings</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ── Teacher Settings Panel ───────────────────────────────────────────── */

function TeacherSettingsPanel() {
  const [classLink, setClassLink] = useState('https://zoom.us/j/987654321')
  const [reminderMinutes, setReminderMinutes] = useState('15')
  const [autoAttendanceAlert, setAutoAttendanceAlert] = useState(true)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success('Teacher classroom settings updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Teacher Classroom & Schedule Settings
        </CardTitle>
        <CardDescription>
          Set up default online classroom links, student attendance alerts, and reminder timers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Default Online Classroom Link</label>
            <Input
              value={classLink}
              onChange={(e) => setClassLink(e.target.value)}
              placeholder="https://zoom.us/j/987654321"
              icon={<Video />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Class Reminder Lead Time (Minutes)</label>
              <Input
                type="number"
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(e.target.value)}
                placeholder="15"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Class Subjects Assigned</label>
              <Input value="IELTS Academic & PTE Preparation" readOnly className="bg-muted/50" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="auto-attendance"
              checked={autoAttendanceAlert}
              onCheckedChange={(checked) => setAutoAttendanceAlert(Boolean(checked))}
            />
            <label htmlFor="auto-attendance" className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
              Prompt for class attendance submission immediately after class ends
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit">Save Teacher Settings</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ── Student Settings Panel ───────────────────────────────────────────── */

function StudentSettingsPanel() {
  const [targetCountry, setTargetCountry] = useState('Australia, Canada, UK')
  const [preferredIntake, setPreferredIntake] = useState('Fall 2026')
  const [guardianName, setGuardianName] = useState('Ram Bahadur Shrestha')
  const [guardianPhone, setGuardianPhone] = useState('+977 9841234567')

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success('Student study preferences updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-4 text-primary" />
          Student Academic Preferences & Parent Info
        </CardTitle>
        <CardDescription>
          Keep your target study abroad countries, preferred intake, and guardian contacts up to date
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Target Study Countries</label>
              <Input
                value={targetCountry}
                onChange={(e) => setTargetCountry(e.target.value)}
                placeholder="e.g. Australia, Canada"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Preferred Admission Intake</label>
              <Input
                value={preferredIntake}
                onChange={(e) => setPreferredIntake(e.target.value)}
                placeholder="e.g. Fall 2026"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Parent / Guardian Name</label>
              <Input
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="Guardian Name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Parent / Guardian Phone</label>
              <Input
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="+977 98XXXXXXXX"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit">Save Student Preferences</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ── Referral Agent Settings Panel ────────────────────────────────────── */

function ReferralAgentSettingsPanel() {
  const [bankName, setBankName] = useState('Nabil Bank Limited')
  const [accountName, setAccountName] = useState('Partner Agency Pvt. Ltd.')
  const [accountNumber, setAccountNumber] = useState('012000192837401')
  const [panNumber, setPanNumber] = useState('600987654')

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success('Referral payout & bank details updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          Commission Payout & Bank Account Details
        </CardTitle>
        <CardDescription>
          Provide your bank account information for commission payouts and tax records
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Bank Name</label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Nabil Bank"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Account Holder Name</label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Exact Account Name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Account Number</label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Bank Account Number"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">PAN / Tax ID Number</label>
              <Input
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value)}
                placeholder="PAN Number"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit">Save Payout Details</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ── Front Desk Settings Panel ───────────────────────────────────────── */

function FrontDeskSettingsPanel() {
  const [soundAlerts, setSoundAlerts] = useState(true)
  const [autoPrintSlip, setAutoPrintSlip] = useState(false)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success('Front desk reception settings updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="size-4 text-primary" />
          Front Desk & Reception Desk Settings
        </CardTitle>
        <CardDescription>
          Configure visitor check-in sounds, reception desk alerts, and token printing defaults
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sound-alert"
                checked={soundAlerts}
                onCheckedChange={(checked) => setSoundAlerts(Boolean(checked))}
              />
              <label htmlFor="sound-alert" className="text-xs font-medium text-muted-foreground cursor-pointer select-none flex items-center gap-1.5">
                <BellRing className="size-3.5 text-primary" /> Play chime alert when a new visitor arrives at reception desk
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="auto-print"
                checked={autoPrintSlip}
                onCheckedChange={(checked) => setAutoPrintSlip(Boolean(checked))}
              />
              <label htmlFor="auto-print" className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
                Automatically trigger thermal printer for visitor check-in token slips
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit">Save Desk Settings</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
