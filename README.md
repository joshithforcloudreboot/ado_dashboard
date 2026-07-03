# Azure DevOps Progress Dashboard

A leadership dashboard for the **Cloud Reboot AI Tiger Team** that pulls work item data directly from the Azure DevOps REST API and shows overall progress, person-wise workload, Epic progress, blocked/overdue/stale items, and recent activity — in one page, no Power BI required.

**Live URL**: https://blue-dune-0d90cef0f7.azurestaticapps.net

## What Was Built

- A **Summary tab** with KPI cards (Total, Completed, In Progress, Pending, % Complete), an attention row (Blocked, Overdue, Unassigned, Stale), a status donut chart, an assignee workload chart, a per-Epic progress chart, a "Needs Attention" table, and a "Recent Activity" (last 7 days) panel.
- An **Intern Progress tab** for drilling into a single person's work items, filterable by Sprint, Epic, and State.
- Sprint, Epic, and Created-Date-range filters — all applied client-side after a single data fetch, so filtering is instant.

## Technology Used and Why

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JavaScript | No build step, deploys as static files, fastest path to a working dashboard |
| Backend | Python Azure Function | Keeps the ADO Personal Access Token off the browser; HTTP-triggered, anonymous auth is enough since it only proxies read-only ADO data |
| Hosting | Azure Static Web Apps + Azure Functions | Free tier, auto-deploys from GitHub on every push to `main` |
| Charts | CSS (`conic-gradient`, flexbox bars) | No charting library dependency; every visual matches the dark design system exactly |

## How Data Is Pulled

1. The Azure Function (`api/getWorkItems/__init__.py`) authenticates to Azure DevOps with a Personal Access Token (Basic auth header).
2. It runs a WIQL query (`SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC`) to get every work item ID in the project.
3. It batch-fetches full field + relation data for those IDs (200 per request, ADO's limit), using `$expand=all` so both fields and work item **relations** (parent/child, "Blocked By") come back in one call.
4. The Function transforms the raw ADO payload into a compact JSON shape: `{ kpis, by_status, by_assignee, by_epic, sprints, work_items, meta }`.
5. The frontend fetches this once on page load / Refresh click. All filtering (Sprint, Epic, Assignee, State, Date range) happens **client-side** against the already-fetched data — no extra API calls per filter change.

## Azure DevOps Fields Used

| Field | Used For |
|---|---|
| `System.Id`, `System.Title`, `System.State`, `System.WorkItemType` | Core identity, status grouping |
| `System.AssignedTo` | Person-wise progress, Unassigned KPI |
| `System.IterationPath` | Sprint slicer |
| `System.AreaPath` | Stored, not currently surfaced in the UI |
| `System.CreatedDate`, `System.ChangedDate` | Created-date filter, Stale detection, Recent Activity |
| `Microsoft.VSTS.Common.ClosedDate` | Recent Activity ("Completed this week") — falls back to `ChangedDate` if not set on the item |
| `Microsoft.VSTS.Scheduling.DueDate` / `Microsoft.VSTS.Scheduling.TargetDate` | Overdue KPI — falls back to Target Date if Due Date isn't set |
| `Microsoft.VSTS.Common.Priority`, `Microsoft.VSTS.Scheduling.StoryPoints` | Stored, not currently surfaced in the UI |
| `System.Tags` | Stored; not the mechanism used for Blocked (see below) |
| Work item **relations** (`Parent`, `Blocked By`) | Epic rollup, Blocked detection |

## How "Blocked" Is Detected

This board uses **Spike work items** to block other work items, linked via ADO's built-in **"Blocked By"** relation — not a tag or custom field. A work item is marked Blocked when it has an active "Blocked By" relation to a Spike that is not yet Completed/Done/Resolved/Closed. If your board later starts using a different mechanism (a tag, a custom field, a "Blocked" state), update `_blocking_spikes()` in `api/getWorkItems/__init__.py`.

## How to Run / Open the Dashboard

```powershell
# API (Azure Functions) — from the api/ folder
venv\Scripts\activate
func start                      # http://localhost:7071

# Frontend — open frontend/index.html directly, or use VS Code Live Server
```

Set `ADO_PAT`, `ADO_ORG`, `ADO_PROJECT` in `api/local.settings.json` for local runs (gitignored). In production these are set in Azure Portal → Static Web App → Configuration → Application settings.

## How to Refresh Data

Manual only — click the **Refresh** button in the top-right corner. There is no auto-refresh or server-side cache; every click re-fetches live data from Azure DevOps.

## Assumptions

- Azure DevOps Boards is the single source of truth for work item data.
- The dashboard targets **one ADO project** (`Cloud Reboot AI Tiger Team`) at a time — see Limitations below.
- "Blocked" is represented by a Spike work item linked via a "Blocked By" relation (confirmed with the team; see above).
- A work item is "stale" if it hasn't changed in 7+ days and isn't already Completed.
- Status grouping: `Closed/Done/Resolved/Completed` → Completed, `Active/In Progress/Committed` → In Progress, `New/To Do/Proposed/Ready` → Pending, anything else → Other.

## Limitations

- **Single project only.** `ADO_PROJECT` is a single environment variable; multi-project support is not implemented. The current project in scope is shown under the dashboard title.
- **Due Date / Target Date may be empty.** Not every work item has one set, so the Overdue KPI only reflects items where a due/target date exists.
- **Blocked detection depends on Spike → "Blocked By" links being used consistently.** If a work item is functionally blocked but nobody created the ADO relation, it will not show as Blocked here.
- **No authentication.** The API endpoint is anonymous; anyone with the URL can call it. Azure AD login is planned (see Future Improvements) but not yet implemented.
- **No server-side cache.** Every Refresh click hits the live ADO API directly; there is no rate-limit protection beyond what ADO itself enforces.
- The "Recent Activity" window is fixed at 7 days and is not currently user-configurable.

## Future Improvements

- Azure AD authentication (planned — see `CLAUDE.md` Phase 6).
- Azure AD app registration for ADO auth in place of a manually-rotated PAT (see `CLAUDE.md` Phase 5).
- Multi-project support.
- Export dashboard data to Excel/PDF.
- Configurable stale/recent-activity thresholds.
- Search across work items.
- Workload-balance view across team members.
