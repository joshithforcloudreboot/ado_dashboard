# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Azure DevOps dashboard for the **Cloud Reboot AI Tiger Team** — fetches work item data directly from the ADO REST API and displays visual charts. No Power BI dependency.

## Stack

- **Frontend**: Vanilla HTML + CSS + JavaScript (`/frontend`)
- **Backend**: Python Azure Function (`/api/getWorkItems`) — HTTP-triggered, anonymous auth
- **Hosting**: Azure Static Web Apps (frontend) + Azure Functions (API)
- **CI/CD**: GitHub Actions — auto-deploys on push to `main`
- **Live URL**: `https://blue-dune-0d90cef0f7.azurestaticapps.net`

## Repo Structure

```
/
├── .github/workflows/azure-static-web-apps-blue-dune-0d90cef0f.yml
├── .claude/skills/commit-message/SKILL.md   # this repo's commit message format
├── api/
│   ├── getWorkItems/
│   │   ├── __init__.py        # ADO fetch + transformation logic
│   │   └── function.json      # HTTP trigger binding
│   ├── host.json
│   ├── requirements.txt       # fastapi, httpx, azure-functions
│   └── local.settings.json    # local env vars (gitignored)
├── frontend/
│   ├── index.html             # Dashboard markup, two tabs
│   ├── style.css              # Dark theme (IBM Plex Sans + Space Grotesk)
│   └── app.js                 # Data fetch, client-side filtering, rendering
├── staticwebapp.config.json
├── IMPLEMENTATION_PLAN.md
├── PROGRESS.md
└── README.md                  # tech rationale, data flow, assumptions, limitations
```

## Running Locally

```powershell
# API (Azure Functions)
cd api
venv\Scripts\activate
func start                      # runs on http://localhost:7071

# Frontend — open frontend/index.html directly in browser
# or use Live Server in VS Code (serves from /frontend)
```

## Environment Variables

| Variable | Where | Value |
|---|---|---|
| `ADO_PAT` | Azure Function | Personal Access Token (Work Items: Read) |
| `ADO_ORG` | Azure Function | `CRI-Org` |
| `ADO_PROJECT` | Azure Function | `Cloud Reboot AI Tiger Team` |

Set locally in `api/local.settings.json` (gitignored).
Set in production via Azure Portal → Static Web App → Configuration → Application settings.

## ADO Integration

- **Endpoint**: WIQL query → batch fetch work items
- **Org**: `CRI-Org`, **Project**: `Cloud Reboot AI Tiger Team`
- **Fetch strategy**: `$expand=all` (not an explicit `fields=` list) — ADO's batch API won't combine the two, and `relations` (Parent, Blocked By) are required for Epic rollup and Blocked detection
- **Fields used**: Id, Title, State, WorkItemType, AssignedTo, IterationPath, AreaPath, CreatedDate, ChangedDate, ClosedDate, DueDate/TargetDate, Priority, StoryPoints, Tags, plus `relations`
- **Batch size**: 200 items per request (ADO limit)
- **Blocked detection**: this board blocks work items with a linked **Spike** via ADO's "Blocked By" relation (not a tag/field) — confirmed with the team. See `_blocking_spikes()`.
- **Epic rollup**: walks `Parent` relations up to the nearest Epic ancestor via `_resolve_epic()`.

## Architecture

### API (`api/getWorkItems/__init__.py`)
1. WIQL query → get all work item IDs
2. Batch fetch fields + relations (200 at a time, `$expand=all`)
3. Transform into `{ kpis, by_status, by_assignee, by_epic, sprints, work_items, meta }`
4. Status grouping: Closed/Done/Resolved → Completed | Active/In Progress → In Progress | New/To Do → Pending
5. Per-item attention flags: `is_blocked`, `is_overdue`, `is_unassigned`, `is_stale` (7+ days unchanged, not completed), rolled into `kpis.blocked/overdue/unassigned/stale`

### Frontend (`frontend/app.js`)
- **Single fetch on load/refresh** — all data loaded into `fullItems[]` once
- **All filtering is client-side** — Epic, date range, assignee, sprint, state filters never trigger new API calls
- **Two tabs**: Summary (KPI cards + donut + assignee bars + Epic progress + Needs Attention + Recent Activity) and Intern Progress (person selector + type bars + state grid + table)
- **Donut chart**: CSS `conic-gradient`, computed dynamically
- **Assignee / Epic bars**: CSS flex with proportional widths, same component reused for both
- **Unified status tag**: `statusPillHTML()` renders every per-item status as Completed/In Progress/Pending/Other with consistent color, everywhere a status is shown (raw ADO state kept small, in parentheses, for reference)
- **Collapsible sections**: Needs Attention and Recent Activity default to collapsed (Open/Close toggle) with an always-visible summary line, to keep the Summary tab from feeling overloaded

## Data Transformation Pipeline

```
ADO REST API
│
│  POST /wit/wiql → all work item IDs (ordered by ChangedDate DESC)
│  GET  /wit/workitems?ids={batch}&$expand=all → raw fields + relations (200/batch)
│  (fields and $expand can't be combined — $expand=all returns everything,
│   including `relations` needed for Blocked/Epic detection)
│
▼
RAW WORK ITEM (per item from ADO)
{
  id, rev,
  fields: {
    System.Id, System.Title, System.State, System.WorkItemType,
    System.AssignedTo { displayName, uniqueName, ... },
    System.IterationPath          → "Cloud Reboot AI Tiger Team\Sprint 2"
    System.AreaPath, System.CreatedDate, System.ChangedDate, System.Tags,
    Microsoft.VSTS.Common.Priority, Microsoft.VSTS.Scheduling.StoryPoints,
    Microsoft.VSTS.Common.ClosedDate,
    Microsoft.VSTS.Scheduling.DueDate / TargetDate
  },
  relations: [ { rel, url, attributes: { name } }, ... ]
    → "Parent" relation used for Epic rollup
    → "Blocked By" relation (to a Spike) used for Blocked detection
}
│
│  _transform()  [api/getWorkItems/__init__.py]
│
├─ State → Status Group mapping (STATUS_MAP)
│     "Closed" / "Done" / "Resolved" / "Completed"  →  Completed
│     "Active" / "In Progress" / "Committed"         →  In Progress
│     "New"    / "To Do" / "Proposed" / "Ready"      →  Pending
│     anything else                                   →  Other
│
├─ AssignedTo: extract displayName from object, fallback to "(Blank)"
│
├─ Sprint: last segment of IterationPath after "\"
│     "Cloud Reboot AI Tiger Team\Sprint 2"  →  "Sprint 2"
│     no "\" in path (root-level item)        →  "No Sprint"
│
├─ Epic: _resolve_epic() walks "Parent" relations up to the nearest
│     ancestor of type Epic (memoized); Epics don't roll up under themselves
│
├─ Blocked: _blocking_spikes() finds "Blocked By" relations pointing to a
│     Spike whose status_group isn't Completed
│
├─ Overdue: DueDate (or TargetDate fallback) is before now, and not Completed
├─ Unassigned: AssignedTo is empty
├─ Stale: ChangedDate is 7+ days old, and not Completed
│
▼
TRANSFORMED RESPONSE (JSON to browser)
{
  kpis: {
    total, completed, in_progress, pending,
    pct_complete,                              ← round(completed / total * 100, 1)
    blocked, overdue, unassigned, stale         ← counts of flagged items
  },

  by_status: {
    Completed: N, "In Progress": N, Pending: N, Other: N
  },

  by_assignee: [                        ← sorted by total workload desc
    { name, Completed, "In Progress", Pending, Other },
    ...
  ],

  by_epic: [                            ← same shape, grouped by Epic ancestor
    { id, title, Completed, "In Progress", Pending, Other },
    ...
  ],

  sprints: ["Sprint 1", ..., "No Sprint"],   ← sorted, unique

  work_items: [                         ← flat list, one per item
    {
      id, title, state, status_group, type,
      assignee, sprint, epic_id, epic_title, area,
      priority, story_points, tags,
      created_date, changed_date, closed_date, due_date,
      is_blocked, blocking_spikes, is_overdue,
      is_unassigned, is_stale, stale_days, attention_reasons
    },
    ...
  ],

  meta: { org, project }                ← for the single-project-scope note in the UI
}
│
│  Client-side (frontend/app.js)
│  fullItems[] stored in memory after first fetch
│
├─ Epic filter        → filteredByEpic()       filters work_items by item.epic_title
├─ Date range filter  → filteredByDateRange()  filters by item.created_date
├─ Sprint filter (Intern tab only) → filteredBySprint()
├─ Assignee filter (Intern tab)    → filters by item.assignee
├─ State filter (Intern tab)       → filters by item.state (multi-select)
│
├─ computeSummary(filteredItems)
│     re-computes kpis (incl. attention counts), by_status, by_assignee from filtered set
├─ computeByEpic(items) → by_epic breakdown for the Progress by Epic chart
│
├─ renderDonut()          → CSS conic-gradient degrees from by_status counts
├─ renderAssigneeBars() / renderEpicBars() → CSS flex proportional width
├─ renderAttentionTable() → collapsible Needs Attention table, sorted by severity
├─ renderRecentActivity() → collapsible Completed/Updated/Created-this-week panel
├─ statusPillHTML(item)   → unified status tag, used in every table row site-wide
├─ renderIntern()         → type bars, state grid, work items table
▼
DOM updated — no extra API calls
```

## Design

Dark theme matching the Cloud Reboot design system:
- Background: `#090C14` with blue radial glows
- Fonts: IBM Plex Sans (body), Space Grotesk (headings/numbers)
- Status colors: Completed `#3B9EFF` | In Progress `#34D399` | Pending `#FB6D5C` | Other `#FBBF24`
- Attention colors: Blocked `#FB6D5C` | Overdue `#F59E0B` | Unassigned `#FBBF24` | Stale `#9AA6BD` (zero-value chips dim to 45% opacity)
- Cards: `#141A26` with `rgba(255,255,255,0.07)` border

## What's Next (Remaining Phases)

- **Phase 5**: Azure Table Storage cache + refresh cooldown + concurrent lock
- **Phase 6**: Azure AD authentication
