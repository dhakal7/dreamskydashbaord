import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  getCountryDistribution, getCounselorPerformance, getLeadSourceDistribution,
  getMonthlyLeadsData, getUniversityDistribution,
} from '../selectors'

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

export function MonthlyLeadsChart() {
  const data = getMonthlyLeadsData()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Leads</CardTitle>
        <CardDescription>New leads captured vs. converted, last 6 months</CardDescription>
      </CardHeader>
      <CardContent className="h-64 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -12, right: 8, top: 4 }}>
            <defs>
              <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" />
            <YAxis tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" width={28} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="leads" name="Leads" stroke={BRAND} fill="url(#leadsGradient)" strokeWidth={2} />
            <Area type="monotone" dataKey="converted" name="Converted" stroke="#16A34A" fill="transparent" strokeWidth={2} strokeDasharray="4 3" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function CountryDistributionChart() {
  const data = getCountryDistribution()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Country Distribution</CardTitle>
        <CardDescription>Active students by destination country</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
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
      </CardContent>
    </Card>
  )
}

export function UniversityDistributionChart() {
  const data = getUniversityDistribution()
  return (
    <Card>
      <CardHeader>
        <CardTitle>University Distribution</CardTitle>
        <CardDescription>Applications by top universities</CardDescription>
      </CardHeader>
      <CardContent className="h-64 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={130}
              className="text-[11px] fill-muted-foreground"
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', className: 'text-secondary' } as any} />
            <Bar dataKey="value" name="Applications" fill={BRAND} radius={[0, 6, 6, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function LeadSourceChart() {
  const data = getLeadSourceDistribution()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Sources</CardTitle>
        <CardDescription>Where new leads are coming from</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
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
      </CardContent>
    </Card>
  )
}

export function CounselorPerformanceChart() {
  const data = getCounselorPerformance()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Counselor Performance</CardTitle>
        <CardDescription>Students handled and conversion rate</CardDescription>
      </CardHeader>
      <CardContent className="h-64 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -12, right: 8 }}>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-[11px] fill-muted-foreground" />
            <YAxis tickLine={false} axisLine={false} width={28} className="text-[11px] fill-muted-foreground" />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', className: 'text-secondary' } as any} />
            <Bar dataKey="students" name="Students" fill="#7C3AED" radius={[6, 6, 0, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
