# E-Planet Consultancy CRM — Frontend

A premium, enterprise-grade frontend for an education consultancy CRM. Built with React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query/Table, Zustand, dnd-kit, Recharts, and Framer Motion. **Frontend only — mock data throughout, designed to plug into an ASP.NET Core Web API later.**

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`).

```bash
npm run build     # type-check + production build
npm run preview   # preview the production build
npm run lint       # oxlint
```

## What's built in this phase

- **App shell** — collapsible sidebar (all 13 modules routed), top bar with breadcrumbs, global search (Cmd/Ctrl+K) across students/leads/universities/courses, notification center, user menu, dark mode toggle, mobile nav drawer.
- **Dashboard** — 7 KPI stat cards, 5 chart types (monthly leads area chart, country distribution donut, university distribution bar, lead source donut, counselor performance bar), plus today's appointments, recent activity timeline, upcoming follow-ups, recent students, and recent applications panels. All driven by the mock data layer.
- **Leads module (fully built)** — table view (TanStack Table: sorting, column visibility, pagination, row selection, bulk-action bar) and a Kanban pipeline view (dnd-kit drag-and-drop across all 9 stages: New -> Contacted -> Counseling -> Interested -> Application -> Offer Letter -> Visa -> Travel -> Completed), with a filter bar (search, stage, source, priority, counselor) and a live stat strip.
- **Mock data layer** — 50 students, 200 leads, 100 follow-ups, 50 applications, 20 visa cases, 30 appointments, 140 documents, 8 countries, 25 universities, 75 courses, 7 counselors, an activity feed, and notifications — all deterministically seeded so the UI is stable across reloads.
- **Design system** — full token set in `src/index.css` (brand blue #2563EB, slate neutrals, semantic success/warning/danger, light + dark themes, soft/elevated/popover shadow scale, Inter + JetBrains Mono type pairing — monospace is used consistently for IDs, passport numbers, and application refs as a signature detail), plus a reusable primitive library in `src/components/ui` (Button, Card, Badge, Avatar, Input, Select, Dialog, DropdownMenu, Tabs, Tooltip, Popover, Checkbox, Switch, Progress, ScrollArea, Skeleton, Separator).

## What's stubbed for the next phase

Students, Follow-ups, Appointments, Applications, Visa Processing, Documents, Universities, Countries, Courses, Reports, and Settings are routed and render a styled "coming soon" state rather than being blank or broken — the mock data, types, and status-badge helpers for every one of these already exist in `src/mock` and `src/types`, so building out each module is mostly assembling existing primitives (DataTable, PersonAvatar, StatusBadges, PageHeader, EmptyState) rather than starting from scratch. Suggested build order:

1. **Students** — list (DataTable) + detail page with the 10 requested tabs (Personal, Academic, English Test, Study Preferences, Parents, Documents, Applications, Visa, Activity, Timeline)
2. **Follow-ups** — list view first (reuse DataTable), then calendar/timeline views
3. **Appointments** — calendar scheduler (react-big-calendar is already installed)
4. **Applications** — timeline/kanban by stage (same dnd-kit pattern as the Leads pipeline)
5. **Visa Processing** — checklist UI + progress bars (visaCases mock data already models this)
6. **Documents** — drag-and-drop upload UI (react-dropzone is already installed)
7. **Universities / Countries / Courses** — card grids + filterable tables
8. **Reports** — charts + filters (recharts patterns already established in Dashboard)
9. **Settings** — forms (react-hook-form + zod are already installed)

## Folder structure

```
src/
  app/            # router config
  components/
    ui/           # primitive design-system components (button, card, dialog, ...)
    layout/       # sidebar, topbar, breadcrumbs, global search, notifications
    shared/       # cross-feature components (DataTable, PageHeader, EmptyState, status badges)
  features/       # one folder per CRM module (dashboard, leads, students, ...)
  mock/           # deterministic mock data generators + seeded entities
  store/          # Zustand stores (UI state, leads pipeline state)
  types/          # shared TypeScript domain types
  lib/            # utilities (cn, formatters)
```

## Notes for API integration later

- Mock data lives entirely in `src/mock` — swap the imports in each feature's selectors/store for TanStack Query hooks hitting your ASP.NET Core endpoints; the component layer already consumes typed arrays (`Student[]`, `Lead[]`, etc. from `src/types`) so it won't need to change shape-wise if your API DTOs match.
- `axios` is installed and ready for an API client module (not yet created, since there's no backend to point at).
- Zustand's `leads/store.ts` is the pattern to follow for other modules that need optimistic client-side mutations (e.g. drag-and-drop) before wiring to real mutations.
