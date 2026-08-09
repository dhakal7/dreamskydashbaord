# E-Planet CRM - Code Structure & Module Guide

A comprehensive guide to understanding the main logic, file structure, and module organization of the E-Planet CRM application.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Directory Structure](#directory-structure)
4. [Core Modules](#core-modules)
5. [Component Architecture](#component-architecture)
6. [State Management](#state-management)
7. [Key Data Types](#key-data-types)
8. [Utilities & Helpers](#utilities--helpers)

---

## Project Overview

**E-Planet CRM** is a comprehensive Customer Relationship Management system designed for educational consultancies managing student admissions, university applications, visa processing, and follow-ups.

**Key Features:**
- Lead management with pipeline stages
- Student profile management
- Application tracking
- Appointment scheduling
- Follow-up management
- Visa process tracking
- Document management
- Dashboard analytics with charts

**Main Tech Stack:**
- **Frontend Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **Routing:** React Router v6
- **State Management:** Zustand
- **UI Components:** Custom components with Tailwind CSS
- **Charts:** Custom chart implementations
- **Query Management:** TanStack React Query
- **Notifications:** Sonner (toast)
- **Icons:** Lucide React

---

## Tech Stack Details

```
vite.config.ts          - Vite build configuration
tsconfig.json           - TypeScript configuration
package.json            - Dependencies & scripts
```

---

## Directory Structure

```
src/
├── app/
│   └── router.tsx           # React Router configuration
├── components/
│   ├── layout/              # Main layout components
│   ├── shared/              # Reusable shared components
│   └── ui/                  # Base UI components (headless)
├── features/                # Feature-based modules
├── hooks/                   # Custom React hooks
├── lib/
│   └── utils.ts             # Utility functions
├── mock/                    # Mock data generators
├── store/                   # Global state (Zustand)
├── types/                   # TypeScript type definitions
├── App.tsx                  # App root component
├── main.tsx                 # Entry point
└── index.css                # Global styles
```

---

## Core Modules

Each module in the `src/features/` directory represents a distinct business domain. Below is a detailed breakdown:

### 📊 1. Dashboard Module
**Location:** `src/features/dashboard/`

**Purpose:** Provides at-a-glance analytics and key metrics for the organization.

**Key Files:**
- **`dashboard-page.tsx`** - Main dashboard view
  - Displays stat cards (key KPIs)
  - Renders multiple charts (Monthly Leads, Country Distribution, University Distribution, Lead Source, Counselor Performance)
  - Shows panels for today's appointments, upcoming follow-ups, recent activity, and recent students
  
- **`selectors.ts`** - Dashboard data selectors
  - Computes derived metrics from application state
  - Calculates statistics for display

- **`components/stat-cards.tsx`** - KPI stat cards
- **`components/charts.tsx`** - All visualization charts
- **`components/panels.tsx`** - Info panels (appointments, follow-ups, activity, students, applications)

**Main Logic:**
- Aggregates data from multiple sources
- Displays real-time metrics and trends
- Provides quick access buttons (New Lead, Export)

---

### 👥 2. Leads Module
**Location:** `src/features/leads/`

**Purpose:** Manages lead generation, tracking, and conversion through the sales pipeline.

**Key Files:**
- **`leads-page.tsx`** - Main leads view
  - Toggles between table and pipeline views
  - Filters leads by search, stage, source, priority, and counselor
  - Displays metrics: Total Leads, Pipeline Value, Hot Leads
  
- **`store.ts`** - Zustand state management
  - State: Array of leads
  - Actions: `moveLead()` - moves lead between pipeline stages
  - Uses mock data seeded from `src/mock/`
  
- **`components/lead-columns.tsx`** - Data table column definitions
- **`components/lead-filters.tsx`** - Filter UI and state
- **`components/leads-pipeline.tsx`** - Kanban-style pipeline view

**Main Logic:**
- Lead filtering (search, stage, source, priority, counselor)
- Pipeline visualization (new → contacted → counseling → interested → application → offer_letter → visa → travel → completed)
- Lead valuation and hot lead identification

---

### 🎓 3. Students Module
**Location:** `src/features/students/`

**Purpose:** Manages complete student profiles, documents, and academic progress.

**Key Files:**
- **`students-page.tsx`** - List view of all students
  - Data table with filtering and sorting
  - Bulk actions (assign counselor, delete)
  - Navigation to individual student profiles
  
- **`student-profile-page.tsx`** - Individual student detail view
  - Full student information (personal, academic, family)
  - Document tracking
  - Activity timeline
  
- **`store.ts`** - Zustand state management
  - State: Array of students
  - Actions:
    - `addStudent()` - creates new student with auto-generated ID
    - `updateStudent()` - updates student profile
    - `deleteStudents()` - bulk delete
    - `assignCounselor()` - assigns counselor to students
  
- **`components/student-columns.tsx`** - Table column definitions
- **`components/student-filters.tsx`** - Filter UI

**Main Logic:**
- CRUD operations for students
- Document requirement tracking (uploaded vs required)
- Counselor assignment and management
- Student unique ID generation (`EPC-2026-XXXX`)

---

### 📅 4. Appointments Module
**Location:** `src/features/appointments/`

**Purpose:** Schedules and manages counselor-student appointments.

**Key Files:**
- **`appointments-page.tsx`** - Calendar view with scheduling
  
- **`store.ts`** - State management for appointments
  
- **`components/appointment-dialog.tsx`** - Appointment creation/edit dialog
  
- **`components/calendar-views.tsx`** - Multiple calendar view modes

**Main Logic:**
- Calendar-based appointment scheduling
- Status tracking (scheduled, confirmed, completed, cancelled, no_show)
- Integration with counselor and student data

---

### 📝 5. Follow-ups Module
**Location:** `src/features/followups/`

**Purpose:** Tracks follow-ups with leads and students across multiple channels.

**Key Files:**
- **`followups-page.tsx`** - Main follow-ups view
  
- **`store.ts`** - Follow-up state management
  
- **`components/calendar-view.tsx`** - Calendar display
- **`components/timeline-view.tsx`** - Timeline/list view
- **`components/followup-filters.tsx`** - Filter options
- **`components/followup-detail-dialog.tsx`** - Follow-up detail editor

**Main Logic:**
- Multiple view modes (calendar, timeline, list)
- Follow-up status tracking (pending, completed, missed, rescheduled)
- Filter by date range, priority, and status

---

### 🎯 6. Applications Module
**Location:** `src/features/applications/`

**Purpose:** Tracks university applications and their progress through the review cycle.

**Key Files:**
- **`applications-page.tsx`** - Applications list
  
- **`application-detail-page.tsx`** - Individual application detail view
  - Full application information
  - Application timeline/history
  - Associated documents
  
- **`store.ts`** - Application state management
  
- **`components/application-columns.tsx`** - Table structure
- **`components/application-filters.tsx`** - Filter UI

**Main Logic:**
- Application lifecycle tracking (submitted → university_review → conditional_offer → unconditional_offer → accepted/rejected)
- University and course association
- Document management and submission tracking

---

### 📄 7. Visa Module
**Location:** `src/features/visa/`

**Purpose:** Manages visa application processes and tracking.

**Key Files:**
- **`visa-page.tsx`** - Visa applications view

**Main Logic:**
- Visa steps tracking (medical → biometric → financial → interview → embassy_submission → decision)
- Status management (not_started, in_progress, submitted, approved, rejected)
- Timeline and document requirements

---

### 📚 8. Courses Module
**Location:** `src/features/courses/`

**Purpose:** Manages available courses and their metadata.

**Key Files:**
- **`courses-page.tsx`** - Browse available courses

**Main Logic:**
- Course catalog management
- Association with universities and study levels
- Course search and filtering

---

### 🏫 9. Universities Module
**Location:** `src/features/universities/`

**Purpose:** Manages university information and partnerships.

**Key Files:**
- **`universities-page.tsx`** - Universities directory

**Main Logic:**
- University database
- Country association
- Course offerings per university
- Rankings and specializations

---

### 🌍 10. Countries Module
**Location:** `src/features/countries/`

**Purpose:** Manages destination country information.

**Key Files:**
- **`countries-page.tsx`** - Countries directory

**Main Logic:**
- Country metadata (visa difficulty, average tuition)
- Student and university counts per country
- Popular courses by country

---

### 📋 11. Documents Module
**Location:** `src/features/documents/`

**Purpose:** Centralized document management for all student/application documents.

**Key Files:**
- **`documents-page.tsx`** - Document repository

**Main Logic:**
- Document upload and tracking
- Document type categorization (passport, citizenship, academic, CV, SOP, recommendation, financial, offer_letter, visa_letter)
- Document requirement validation

---

### 📊 12. Reports Module
**Location:** `src/features/reports/`

**Purpose:** Analytics and reporting for business intelligence.

**Key Files:**
- **`reports-page.tsx`** - Reports dashboard

**Main Logic:**
- Custom report generation
- Data export capabilities
- Performance metrics and trends

---

### ⚙️ 13. Settings Module
**Location:** `src/features/settings/`

**Purpose:** Application configuration and user preferences.

**Key Files:**
- **`settings-page.tsx`** - Settings interface

**Main Logic:**
- User preferences
- Application configuration
- Admin settings

---

## Component Architecture

### Layout Components (`src/components/layout/`)

| File | Purpose |
|------|---------|
| **app-shell.tsx** | Main app layout wrapper with sidebar, topbar, mobile nav |
| **sidebar.tsx** | Desktop navigation sidebar |
| **topbar.tsx** | Top navigation bar with user menu and search |
| **mobile-nav.tsx** | Mobile navigation drawer |
| **breadcrumbs.tsx** | Breadcrumb navigation |
| **notification-center.tsx** | Notifications/alerts panel |
| **global-search.tsx** | Global search across app |
| **nav-items.ts** | Navigation menu configuration |

### Shared Components (`src/components/shared/`)

| File | Purpose |
|------|---------|
| **data-table.tsx** | Reusable data table with sorting, filtering, selection |
| **page-header.tsx** | Standardized page title, description, and actions |
| **page-loader.tsx** | Loading skeleton for pages |
| **status-badges.tsx** | Status display components |
| **empty-state.tsx** | Empty state UI |
| **coming-soon.tsx** | Placeholder for under-construction pages |
| **stepper.tsx** | Multi-step progress indicator |

### UI Components (`src/components/ui/`)

Base headless UI components built with Tailwind CSS:
- **button.tsx** - Button variants
- **card.tsx** - Card container
- **input.tsx** - Text input
- **select.tsx** - Dropdown select
- **dialog.tsx** - Modal dialog
- **dropdown-menu.tsx** - Dropdown menu
- **badge.tsx** - Badge/label
- **checkbox.tsx** - Checkbox input
- **switch.tsx** - Toggle switch
- **tabs.tsx** - Tab navigation
- **tooltip.tsx** - Tooltip
- **popover.tsx** - Popover menu
- **avatar.tsx** - User avatar
- **progress.tsx** - Progress bar
- **scroll-area.tsx** - Scrollable area
- **separator.tsx** - Visual divider
- **skeleton.tsx** - Loading skeleton

---

## State Management

### Architecture: Zustand Stores

The app uses **Zustand** for lightweight, decentralized state management. Each feature module has its own store.

### Store Pattern

```typescript
// Example: src/features/leads/store.ts
interface LeadsState {
  leads: Lead[]
  moveLead: (id: string, stage: LeadStage) => void
}

export const useLeadsStore = create<LeadsState>((set) => ({
  leads: seedLeads,
  moveLead: (id, stage) => set((state) => ({
    leads: state.leads.map((l) => (l.id === id ? { ...l, stage } : l))
  }))
}))
```

### Available Stores

| Store | Path | Purpose |
|-------|------|---------|
| **useLeadsStore** | `src/features/leads/store.ts` | Lead pipeline management |
| **useStudentsStore** | `src/features/students/store.ts` | Student CRUD operations |
| **useAppointmentsStore** | `src/features/appointments/store.ts` | Appointment scheduling |
| **useFollowUpsStore** | `src/features/followups/store.ts` | Follow-up tracking |
| **useApplicationsStore** | `src/features/applications/store.ts` | Application tracking |
| **useUIStore** | `src/store/ui-store.ts` | Global UI state |

### Query Management

**TanStack React Query** is configured in [App.tsx](src/App.tsx) for:
- API caching
- Stale time: 60 seconds
- Automatic refetching disabled on window focus

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
})
```

---

## Key Data Types

**Location:** [src/types/index.ts](src/types/index.ts)

### Enums & Status Types

```typescript
// Lead pipeline stages
LeadStage = 'new' | 'contacted' | 'counseling' | 'interested' | 
            'application' | 'offer_letter' | 'visa' | 'travel' | 'completed'

// Lead information source
LeadSource = 'website' | 'facebook' | 'referral' | 'walk_in' | 
             'education_fair' | 'google_ads' | 'agent_partner' | 'instagram'

// Application progression
ApplicationStage = 'submitted' | 'university_review' | 'conditional_offer' | 
                   'unconditional_offer' | 'accepted' | 'rejected'

// Visa processing stages
VisaStep = 'medical' | 'biometric' | 'financial' | 'interview' | 
           'embassy_submission' | 'decision'

// Priority levels
Priority = 'low' | 'medium' | 'high' | 'urgent'
```

### Core Entities

#### Counselor
```typescript
interface Counselor {
  id: string
  name: string
  email: string
  avatarColor: string
  role: 'counselor' | 'senior_counselor' | 'branch_manager' | 'admin'
  studentsHandled: number
  conversionRate: number
}
```

#### Lead
```typescript
interface Lead {
  id: string
  name: string
  email: string
  phone: string
  source: LeadSource
  stage: LeadStage
  priority: Priority
  counselorId: string
  value: number  // Estimated tuition value
  interestedCountries: string[]
  interestedStudyLevels: StudyLevel[]
  notes?: string
}
```

#### Student
```typescript
interface Student {
  id: string
  studentId: string  // Generated: EPC-2026-XXXX
  name: string
  email: string
  phone: string
  dateOfBirth: string
  nationality: string
  passportNumber: string
  counselorId: string
  parents: Parent[]
  documentsUploaded: number
  documentsRequired: number
  createdAt: string
}
```

#### Country
```typescript
interface Country {
  id: string
  name: string
  code: string
  flag: string
  universityCount: number
  studentCount: number
  popularCourses: string[]
  visaDifficulty: 'easy' | 'moderate' | 'strict'
  avgTuitionUsd: number
}
```

#### University
```typescript
interface University {
  id: string
  name: string
  countryId: string
  countryName: string
  ranking: number
  courses: string[]
}
```

---

## Utilities & Helpers

### [src/lib/utils.ts](src/lib/utils.ts)

Common utility functions:
- **formatCurrency()** - Formats numbers as currency
- **cn()** - Class name utility (Tailwind merge)
- Date formatting
- Data transformation helpers

### Mock Data

**Location:** `src/mock/`

| File | Purpose |
|------|---------|
| **index.ts** | Exports all mock data |
| **entities.ts** | Mock entity instances |
| **generators.ts** | Functions to generate mock data |
| **activity.ts** | Activity/timeline entries |
| **reference.ts** | Reference lists (countries, counselors, etc.) |

Mock data is used to seed Zustand stores with initial data.

---

## Routing Architecture

**Location:** [src/app/router.tsx](src/app/router.tsx)

Routes are organized hierarchically under the main `AppShell` layout:

```
/ (Dashboard)
├── /leads
├── /students
├── /students/:id (Profile)
├── /follow-ups
├── /appointments
├── /applications
├── /applications/:id (Detail)
├── /visa
├── /documents
├── /universities
├── /countries
├── /courses
├── /reports
└── /settings
```

All routes are lazy-loaded for code splitting with React's `lazy()`.

---

## Data Flow Summary

1. **User navigates** → Router matches route and renders component
2. **Component mounts** → Accesses Zustand store via `useXxxStore()`
3. **Store provides** → Current state + action functions
4. **Component renders** → UI based on state + user events
5. **User interaction** → Dispatches store actions (moveLead, addStudent, etc.)
6. **Store updates** → Zustand re-renders affected components
7. **Notifications** → Sonner toast shows action feedback

---

## Styling

- **Framework:** Tailwind CSS
- **Color Scheme:** CSS variables in global styles
- **Responsive Design:** Mobile-first approach
- **Custom Components:** Built with Tailwind + optional shadcn/ui patterns

---

## Quick Reference: Finding Things

| What | Where |
|------|-------|
| Add new feature | Create folder in `src/features/XXX/` |
| Add UI component | Create file in `src/components/ui/` |
| Add reusable component | Create file in `src/components/shared/` |
| Add feature state | Create `store.ts` in feature folder |
| Add types | Update `src/types/index.ts` |
| Add utilities | Update `src/lib/utils.ts` |
| Add routes | Update `src/app/router.tsx` |
| Add mock data | Update files in `src/mock/` |

---

## Next Steps for Development

1. **Replace mock data** with real API calls
2. **Add authentication** to protect routes
3. **Implement API integration** using React Query
4. **Add form validation** with libraries like Zod or React Hook Form
5. **Expand analytics** in dashboard
6. **Add export/import** functionality for reports
7. **Implement real-time** notifications with WebSockets

---

*Last Updated: 2026-07-17*
