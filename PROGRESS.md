# Project Progress

## Phase 1 — Project Setup & Automated Deployment ✅

- Created repo structure: `/frontend`, `/api`, `.github/workflows`
- Added `.gitignore`, `staticwebapp.config.json`
- Connected GitHub repo to Azure Static Web Apps
- Fixed `app_location` to `frontend` in the GitHub Actions workflow
- **Result**: Auto-deploy pipeline live at `https://blue-dune-0d90cef0f7.azurestaticapps.net`

## Phase 2 — Azure DevOps Data Integration ✅

- Built HTTP-triggered Azure Function (`api/getWorkItems/__init__.py`)
- Auth: PAT via `Authorization: Basic` header, stored in env vars (never hardcoded)
- Flow: WIQL query for all IDs → batch fetch fields (200/request)
- Fields: Id, Title, State, WorkItemType, AssignedTo, IterationPath, AreaPath, CreatedDate, ChangedDate, Priority, StoryPoints
- Returns transformed JSON: `{ kpis, by_status, by_assignee, sprints, work_items }`
- Tested locally via `func start` — confirmed live ADO data returned
- **Result**: `GET /api/getWorkItems` returns all work items from CRI-Org / Cloud Reboot AI Tiger Team

## Phase 3 — End-to-End Prototype ✅

- Built frontend with Refresh button, loading spinner, error banner
- On load: fetches API and displays raw JSON + item count
- Confirmed full flow working on production URL

## Phase 4 — Visualizations & Design ✅

- Implemented Cloud Reboot dark design (from Claude Design project)
- **Summary tab**:
  - Sprint slicer (All / Sprint 1–N)
  - 5 KPI cards: Total, Completed, In Progress, Pending, % Complete (with progress bar)
  - Donut chart: CSS conic-gradient, dynamically computed from live data
  - Assignee stacked bars: proportional CSS flex, ranked by total workload
- **Intern Progress tab**:
  - Sprint slicer
  - Assignee selector grid (click to filter)
  - State filter pills (multi-select toggle)
  - WI Total count card
  - Person card with initials avatar
  - WI by Work Item Type bars
  - WI by State grid
  - Work items table (Title, State, Type, Sprint)
- Design tokens: IBM Plex Sans + Space Grotesk, `#090C14` background, blue radial glows
- **Performance**: Switched to client-side filtering — single API fetch on load/refresh, all sprint/assignee/state changes are instant (no extra network calls)

## Phases Remaining

| Phase | Description | Status |
|---|---|---|
| 5 | Azure Table Storage cache, refresh cooldown, concurrent lock | Not started |
| 6 | Azure AD authentication | Not started |

## Key Decisions

| Decision | Reason |
|---|---|
| Vanilla JS (no framework) | No build step needed, deploys as static files |
| Client-side filtering | Eliminates per-interaction API latency |
| CSS conic-gradient for donut | No Chart.js dependency, matches design exactly |
| WIQL + batch fetch over OData | Simpler auth, works with PAT |
| Azure Static Web Apps | Auto-generates GitHub Actions CI/CD on repo link |
