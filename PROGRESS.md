# Project Progress

---

## Sessions

### Session 1 — 2026-07-01

| Field | Value |
|---|---|
| Session ID | `ffad7776-0c81-4ac9-aa2d-a451c2ee0c2f` |
| Developer | joshithforcloudreboot |
| Email | joshitha@cloudrebootinc.com |
| Phases completed | 1, 2, 3, 4 |

**Summary:** Built a full Azure DevOps dashboard from scratch — GitHub repo, Azure Static Web Apps CI/CD pipeline, Python Azure Function fetching live ADO work items, and a dark-themed frontend with KPI cards, donut chart, and assignee bars. Implemented two tabs (Summary and Intern Progress) with sprint, assignee, and state slicers, all filtered client-side for instant response. Applied the Cloud Reboot design system (Space Grotesk + IBM Plex Sans, dark theme) imported directly from Claude Design. Token count for this session is not directly accessible from within Claude Code.

---

### Session 2 — 2026-07-03

| Field | Value |
|---|---|
| Session ID | `543d3a3c-dac1-4d38-97e1-f088dab8ffe5` |
| Developer | joshithforcloudreboot |
| Email | joshitha@cloudrebootinc.com |
| Phases completed | Phase 4 enhancements (docx alignment + UX pass) |

**Summary:** Compared the implementation against the original "Azure DevOps CEO Dashboard Use Case" intern document and closed the gaps found (Blocked/Overdue/Unassigned/Stale detection, Epic progress rollups, a Needs Attention section, a Recent Activity section, a date-range filter, and documentation of assumptions/limitations). Backend now resolves Blocked status via ADO's Spike "Blocked By" relations and Epic ancestry via Parent relations, fetched through `$expand=all`. Frontend gained an Epic slicer, a collapsible Needs Attention table with summary chips, a collapsible Recent Activity panel, and a unified status-pill component (Completed / In Progress / Pending / Other) used consistently everywhere a per-item status is shown. Ran a full UX pass — launched the app locally (Azure Functions host + a small dev proxy + Playwright MCP browser automation) against live ADO data, found and fixed real issues (truncated assignee names, an empty ghost badge, an oversized Epic column, a confusing "sprint" label on root-level items), and simplified the Summary tab back down to a clean, low-density layout by collapsing the heaviest sections behind Open/Close toggles. Rewrote `README.md` per the intern document's documentation requirements. Added `.claude/skills/commit-message/SKILL.md` to keep future commits consistent with this repo's format.

---

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

## Phase 4 Enhancements — Docx Alignment & UX Pass ✅

- **Gap analysis**: diffed the implementation against `Azure_DevOps_CEO_Dashboard_Use_Case_Intern_Document.docx` and scoped the missing pieces (Blocked/Overdue/Unassigned/Stale, Epic rollups, Needs Attention, Recent Activity, date-range filter, documentation).
- **Backend (`api/getWorkItems/__init__.py`)**:
  - Switched from an explicit `fields=` list to `$expand=all` so `relations` (Parent, Blocked By) are available alongside every field.
  - `is_blocked`: true when a work item has an active "Blocked By" relation to a Spike that isn't yet completed (confirmed with the team — blocking is done via Spikes, not tags).
  - `is_overdue`, `is_unassigned`, `is_stale` (7+ days since last change, not completed) computed per item.
  - Epic rollup: walks `Parent` relations up to the nearest Epic ancestor; exposed as `epic_id`/`epic_title` per item and a new `by_epic` aggregate.
  - `_sprint_label()`: items with no real sprint sub-path now show "No Sprint" instead of the raw project name.
  - Response now includes `meta: { org, project }` for the single-project-scope note in the UI.
- **Frontend**:
  - Epic slicer on both Summary and Intern Progress tabs; a "Progress by Epic" chart that jumps to the Intern tab pre-filtered to that Epic's work items on click.
  - Needs Attention: collapsible table (Task, Assigned To, Status, Last Updated, Reason for Attention) with always-visible summary chips (Blocked/Overdue/Unassigned/Stale — dimmed when zero).
  - Recent Activity: collapsible 3-column panel (Completed/Updated/Created in the last 7 days) with an always-visible count summary.
  - Created-date range filter, applied across Summary and Intern views.
  - Unified `statusPillHTML()` component — every per-item status tag site-wide renders as Completed/In Progress/Pending/Other with consistent colors (raw ADO state shown small, in parentheses).
  - Removed the Sprint slicer from the Summary tab (Epic slicer + date range cover that need there); it remains on the Intern Progress tab.
- **UX pass (tested locally against live ADO data with Playwright)**: fixed truncated assignee-name pills, removed an empty ghost badge on the Intern person card, truncated the Epic table column with a hover tooltip instead of bloating row height, and confirmed responsive behavior at desktop/mobile widths.
- **Docs**: rewrote `README.md` (tech rationale, data flow, ADO fields used, Blocked-detection mechanism, run/refresh steps, assumptions, limitations, future improvements) and added `.claude/skills/commit-message/SKILL.md`.

## Phases Remaining

| Phase | Description | Status |
|---|---|---|
| 5 | Azure AD app registration for ADO auth + custom domain | Not started |
| 6 | Azure AD user authentication | Not started |

## Key Decisions

| Decision | Reason |
|---|---|
| Vanilla JS (no framework) | No build step needed, deploys as static files |
| Client-side filtering | Eliminates per-interaction API latency |
| No server-side cache | Client-side filtering already handles latency; keeps infra free |
| CSS conic-gradient for donut | No Chart.js dependency, matches design exactly |
| WIQL + batch fetch over OData | Simpler auth, works with PAT |
| Azure Static Web Apps | Auto-generates GitHub Actions CI/CD on repo link |
| Blocked via Spike "Blocked By" relation, not a tag | Confirmed with the team — this board blocks work items with linked Spikes, not a tag/field |
| `$expand=all` instead of an explicit `fields=` list | ADO's batch API won't combine `fields` and `$expand`, and relations (needed for Blocked + Epic) require `$expand` |
| Single unified status-pill component everywhere | Docx feedback: raw ADO states (New/Active/Resolved…) shown inconsistently across the UI were harder to scan than one Completed/In Progress/Pending/Other vocabulary |
| Heaviest sections (Needs Attention, Recent Activity) collapsed by default | Docx feedback: the fully-expanded page was too dense for a leadership-facing summary view |
| Single ADO project only (`ADO_PROJECT` env var) | Documented as a known limitation rather than building multi-project support out of scope |
