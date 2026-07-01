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
└── PROGRESS.md
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
- **Fields fetched**: Id, Title, State, WorkItemType, AssignedTo, IterationPath, AreaPath, CreatedDate, ChangedDate, Priority, StoryPoints
- **Batch size**: 200 items per request (ADO limit)

## Architecture

### API (`api/getWorkItems/__init__.py`)
1. WIQL query → get all work item IDs
2. Batch fetch fields (200 at a time)
3. Transform into `{ kpis, by_status, by_assignee, sprints, work_items }`
4. Status grouping: Closed/Done/Resolved → Completed | Active/In Progress → In Progress | New/To Do → Pending

### Frontend (`frontend/app.js`)
- **Single fetch on load/refresh** — all data loaded into `fullItems[]` once
- **All filtering is client-side** — sprint, assignee, state filters never trigger new API calls
- **Two tabs**: Summary (KPI cards + donut + assignee bars) and Intern Progress (person selector + type bars + state grid + table)
- **Donut chart**: CSS `conic-gradient`, computed dynamically
- **Assignee bars**: CSS flex with proportional widths

## Data Transformation Pipeline

```
ADO REST API
│
│  POST /wit/wiql → all work item IDs (ordered by ChangedDate DESC)
│  GET  /wit/workitems?ids={batch}&fields=... → raw fields (200/batch)
│
▼
RAW WORK ITEM (per item from ADO)
{
  id, rev,
  fields: {
    System.Id, System.Title, System.State, System.WorkItemType,
    System.AssignedTo { displayName, uniqueName, ... },
    System.IterationPath          → "Cloud Reboot AI Tiger Team\Sprint 2"
    System.AreaPath, System.CreatedDate, System.ChangedDate,
    Microsoft.VSTS.Common.Priority, Microsoft.VSTS.Scheduling.StoryPoints
  }
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
│
▼
TRANSFORMED RESPONSE (JSON to browser)
{
  kpis: {
    total, completed, in_progress, pending,
    pct_complete  ← round(completed / total * 100, 1)
  },

  by_status: {
    Completed: N, "In Progress": N, Pending: N, Other: N
  },

  by_assignee: [                        ← sorted by total workload desc
    { name, Completed, "In Progress", Pending, Other },
    ...
  ],

  sprints: ["Sprint 1", "Sprint 2", ...],   ← sorted, unique

  work_items: [                         ← flat list, one per item
    {
      id, title, state, status_group, type,
      assignee, sprint, area,
      priority, story_points,
      created_date, changed_date
    },
    ...
  ]
}
│
│  Client-side (frontend/app.js)
│  fullItems[] stored in memory after first fetch
│
├─ Sprint filter   → filteredBySprint()  filters work_items by item.sprint
├─ Assignee filter → filters by item.assignee
├─ State filter    → filters by item.state (multi-select)
│
├─ computeSummary(filteredItems)
│     re-computes kpis, by_status, by_assignee from filtered set
│
├─ renderDonut()       → CSS conic-gradient degrees from by_status counts
├─ renderAssigneeBars() → CSS flex proportional width from by_assignee
├─ renderIntern()      → type bars, state grid, work items table
▼
DOM updated — no extra API calls
```

## Design

Dark theme matching the Cloud Reboot design system:
- Background: `#090C14` with blue radial glows
- Fonts: IBM Plex Sans (body), Space Grotesk (headings/numbers)
- Colors: Completed `#3B9EFF` | In Progress `#34D399` | Pending `#FB6D5C` | Other `#FBBF24`
- Cards: `#141A26` with `rgba(255,255,255,0.07)` border

## What's Next (Remaining Phases)

- **Phase 5**: Azure Table Storage cache + refresh cooldown + concurrent lock
- **Phase 6**: Azure AD authentication
