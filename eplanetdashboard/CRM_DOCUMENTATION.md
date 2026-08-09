# E-Planet Consultancy CRM — Technical Documentation

This document describes the structure, architecture, and feature implementations of the E-Planet Consultancy CRM.

---

## 1. Directory Structure

The project follows a standard modern React application structure:

```
src/
  app/            # App setup, router configuration
  components/
    ui/           # Primitives/design-system (buttons, cards, badge, select, etc.)
    layout/       # Shell layouts (sidebar, topbar, search, mobile navigation)
    shared/       # Reusable domain components (DataTable, Stepper, StatusBadges)
  features/       # Feature modules containing pages, stores, and sub-components
    dashboard/    # Performance analytics charts & quick summaries
    leads/        # Leads pipeline (Kanban and table view)
    students/     # Student records and details
    applications/ # Phase 5: Applications tracking, list & details
    appointments/ # Appointments schedules
    visa/         # Visa checklist (upcoming Phase 6)
  mock/           # Seeded entities & generators representing backend responses
  types/          # Domain TypeScript interfaces
  lib/            # Utilities (formatting, class mergers)
```

---

## 2. Shared Core Architecture

- **UI & Styling**: Built with Tailwind CSS v4 and custom design variables in `src/index.css` (using brand blue `#2563EB` and modern typography).
- **State Management**: Zustand is utilized for fast, lightweight client-side stores with optimistic UI mutations, maintaining state across route changes.
- **Routing**: `react-router-dom` with code-splitting lazy loading for high initial load speeds.
- **Table Controls**: TanStack Table (`@tanstack/react-table`) is encapsulated inside `src/components/shared/data-table.tsx` with sorting, column visibility toggle, and built-in pagination.

---

## 3. Phase 5: Applications Module Implementation Details

### A. State Management Store (`src/features/applications/store.ts`)
Uses Zustand to manage application records. It is initialized from the 50 deterministically generated mock applications:
- **`applications`**: List of all student university applications.
- **`moveApplication(id, stage)`**: Updates application stage in store, automatically recalculates `lastUpdate`, and dispatches a success toast via `sonner`.

### B. List Page (`src/features/applications/applications-page.tsx`)
- Displays overall stats cards (Total Applications, Under Review, Offers, Enrolled/Accepted).
- Integrates filter selectors (`stage`, `country`, `university`, `counselor`) and a text search bar.
- Renders the DataTable. When clicking any row, navigates the router to `/applications/:id`.

### C. Details Page (`src/features/applications/application-detail-page.tsx`)
- Features code-styled application refs and a back navigation action.
- Contains the premium horizontal timeline (`Stepper`) showing the sequence:
  `Submitted` ➔ `University Review` ➔ `Conditional Offer` ➔ `Unconditional Offer` ➔ `Accepted`.
- If an application enters the `rejected` stage, it splits off into a distinct red branching terminal state rather than sitting inline.
- Shows date stamps under completed phases.
- Offers interactive control to transition stage inline (dropdown stage selector and primary "Move to Next Stage" button).
- Resolves student details from `useStudentsStore` to render GPAs, English score assessments, and contact cards dynamically.

### D. Generic Stepper Component (`src/components/shared/stepper.tsx`)
A flexible stepper component created to be fully reusable in the next phase (e.g. Visa Processing checklists). It supports:
- Orientation: horizontal or vertical.
- Distinct styling for completed, active, and muted nodes.
- Custom terminal branch items (like rejections) styled with warning/danger colors breaking off the main progression path.

---

## 4. Notes for Future Integrations

- **API Integration**: Swap the Zustand seeded data in `store.ts` files with queries using React Query (`@tanstack/react-query`) fetching actual ASP.NET Core Web API endpoints.
- **UI Customizations**: All colors are tailored to support light & dark modes out of the box. Use the Tailwind class `dark:` prefix to maintain seamless design matching.
