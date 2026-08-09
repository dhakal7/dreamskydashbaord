import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { CurrentUser } from '@/types'
import type { ReportFilters } from './report-selectors'
import {
  getApplicationsByMonth, getLeadsByMonth, getConversionTrend,
  getCountryDistribution, getSourceDistribution, getCumulativeStudents,
} from './report-selectors'

const BRAND = '#2563EB'
const PALETTE = ['#2563EB', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DB2777', '#0891B2', '#64748B']

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-popover">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color ?? p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground font-tabular">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

interface ReportChartsProps {
  user: CurrentUser
  filters: ReportFilters
}

export function ApplicationsByMonthChart({ user, filters }: ReportChartsProps) {
  const data = getApplicationsByMonth(user, filters)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Applications by Month</CardTitle>
        <CardDescription>Applications submitted over the last 6 months</CardDescription>
      </CardHeader>
      <CardContent className="h-64 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -12, right: 8, top: 4 }}>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" />
            <YAxis tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" width={28} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', className: 'text-secondary' } as any} />
            <Bar dataKey="applications" name="Applications" fill={BRAND} radius={[6, 6, 0, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function LeadsByMonthChart({ user, filters }: ReportChartsProps) {
  const data = getLeadsByMonth(user, filters)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads by Month</CardTitle>
        <CardDescription>New leads captured vs. converted over 6 months</CardDescription>
      </CardHeader>
      <CardContent className="h-64 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -12, right: 8, top: 4 }}>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" />
            <YAxis tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" width={28} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', className: 'text-secondary' } as any} />
            <Bar dataKey="leads" name="Leads" fill="#7C3AED" radius={[6, 6, 0, 0]} barSize={14} />
            <Bar dataKey="converted" name="Converted" fill="#16A34A" radius={[6, 6, 0, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function ConversionTrendChart({ user, filters }: ReportChartsProps) {
  const data = getConversionTrend(user, filters)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion Trend</CardTitle>
        <CardDescription>Lead-to-application conversion rate over time</CardDescription>
      </CardHeader>
      <CardContent className="h-64 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -12, right: 8, top: 4 }}>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" />
            <YAxis tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" width={28} unit="%" />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="rate" name="Conversion %" stroke={BRAND} strokeWidth={2} dot={{ r: 4, fill: BRAND }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function CountryDistributionChart({ user, filters }: ReportChartsProps) {
  const data = getCountryDistribution(user, filters)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Country Distribution</CardTitle>
        <CardDescription>Students by destination country</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function SourceDistributionChart({ user, filters }: ReportChartsProps) {
  const data = getSourceDistribution(user, filters)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Sources</CardTitle>
        <CardDescription>Distribution of leads by acquisition source</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} paddingAngle={2}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {data.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function CumulativeStudentsChart({ user, filters }: ReportChartsProps) {
  const data = getCumulativeStudents(user, filters)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative Students</CardTitle>
        <CardDescription>Total students over time (last 6 months)</CardDescription>
      </CardHeader>
      <CardContent className="h-64 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -12, right: 8, top: 4 }}>
            <defs>
              <linearGradient id="studentsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" />
            <YAxis tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" width={28} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="students" name="Students" stroke={BRAND} fill="url(#studentsGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
