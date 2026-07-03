import azure.functions as func
import httpx
import json
import os
import base64
from datetime import datetime, timezone
from urllib.parse import quote


STATUS_MAP = {
    "closed": "Completed", "done": "Completed", "resolved": "Completed", "completed": "Completed",
    "active": "In Progress", "in progress": "In Progress", "committed": "In Progress",
    "new": "Pending", "to do": "Pending", "proposed": "Pending", "ready": "Pending",
}

# Items whose ChangedDate is older than this (and not completed) are flagged "stale".
STALE_DAYS = 7


def map_status(state: str) -> str:
    return STATUS_MAP.get((state or "").lower(), "Other")


def _sprint_label(iteration_path: str) -> str:
    """Items directly under the project root (no '\\Sprint N' segment) have no
    real sprint — label them clearly instead of showing the raw project name."""
    if not iteration_path:
        return "No Sprint"
    return iteration_path.split("\\")[-1] if "\\" in iteration_path else "No Sprint"


def _parse_dt(value: str):
    """Parse an ADO ISO-8601 timestamp (e.g. '2026-07-01T12:00:00Z') to aware datetime, or None."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def main(req: func.HttpRequest) -> func.HttpResponse:
    pat = os.environ.get("ADO_PAT", "")
    org = os.environ.get("ADO_ORG", "CRI-Org")
    raw_project = os.environ.get("ADO_PROJECT", "Cloud Reboot AI Tiger Team")
    project = quote(raw_project)
    sprint_filter = req.params.get("sprint", "")
    meta = {"org": org, "project": raw_project}

    credentials = base64.b64encode(f":{pat}".encode()).decode()
    headers = {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/json"
    }

    wiql_url = f"https://dev.azure.com/{org}/{project}/_apis/wit/wiql?api-version=7.1"
    wiql_body = {"query": "SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC"}

    try:
        with httpx.Client(timeout=30) as client:
            wiql_resp = client.post(wiql_url, json=wiql_body, headers=headers)
            wiql_resp.raise_for_status()
            ids = [item["id"] for item in wiql_resp.json().get("workItems", [])]

            if not ids:
                return _json_response({**_empty_response(), "meta": meta})

            # $expand=all pulls every field plus `relations` (needed to detect Spike
            # "Blocked By" links) — ADO's batch API does not allow combining `fields` with `$expand`.
            raw_items = []
            for i in range(0, len(ids), 200):
                batch = ",".join(map(str, ids[i:i + 200]))
                url = f"https://dev.azure.com/{org}/{project}/_apis/wit/workitems?ids={batch}&$expand=all&api-version=7.1"
                resp = client.get(url, headers=headers)
                resp.raise_for_status()
                raw_items.extend(resp.json().get("value", []))

            return _json_response({**_transform(raw_items, sprint_filter), "meta": meta})

    except httpx.HTTPStatusError as e:
        return func.HttpResponse(
            json.dumps({"error": str(e), "status": e.response.status_code}),
            status_code=e.response.status_code,
            mimetype="application/json"
        )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            status_code=500,
            mimetype="application/json"
        )


def _blocking_spikes(item: dict, id_lookup: dict) -> list:
    """A work item is blocked when it has a 'Blocked By' relation to a Spike
    that isn't yet completed. Returns the list of blocking Spike {id, title} dicts."""
    blockers = []
    for rel in item.get("relations", []) or []:
        rel_name = (rel.get("attributes", {}) or {}).get("name", "")
        if rel_name.strip().lower() != "blocked by":
            continue
        try:
            target_id = int(rel.get("url", "").rstrip("/").split("/")[-1])
        except (ValueError, IndexError):
            continue
        target = id_lookup.get(target_id)
        if not target:
            continue
        if target["type"] != "Spike":
            continue
        if map_status(target["state"]) == "Completed":
            continue
        blockers.append({"id": target_id, "title": target["title"]})
    return blockers


def _parent_id(item: dict):
    for rel in item.get("relations", []) or []:
        rel_name = (rel.get("attributes", {}) or {}).get("name", "")
        if rel_name.strip().lower() == "parent":
            try:
                return int(rel.get("url", "").rstrip("/").split("/")[-1])
            except (ValueError, IndexError):
                return None
    return None


def _resolve_epic(item_id: int, id_lookup: dict, parent_map: dict, cache: dict):
    """Walk the Parent chain up from item_id until an Epic is found (or the chain ends)."""
    if item_id in cache:
        return cache[item_id]

    cache[item_id] = None  # guard against cycles
    node = id_lookup.get(item_id)
    if node and node["type"] == "Epic":
        cache[item_id] = {"id": item_id, "title": node["title"]}
        return cache[item_id]

    parent_id = parent_map.get(item_id)
    result = _resolve_epic(parent_id, id_lookup, parent_map, cache) if parent_id else None
    cache[item_id] = result
    return result


def _transform(raw_items, sprint_filter):
    now = datetime.now(timezone.utc)

    # Cross-reference for Spike "Blocked By" relations and Epic ancestry — built
    # from the full fetched set so links outside the sprint filter still resolve.
    id_lookup = {
        item["id"]: {
            "type": item["fields"].get("System.WorkItemType", ""),
            "state": item["fields"].get("System.State", ""),
            "title": item["fields"].get("System.Title", ""),
        }
        for item in raw_items
    }
    parent_map = {item["id"]: pid for item in raw_items if (pid := _parent_id(item))}
    epic_cache = {}

    sprints = sorted(set(
        _sprint_label(item["fields"].get("System.IterationPath", ""))
        for item in raw_items
        if item["fields"].get("System.IterationPath")
    ), key=lambda s: (s == "No Sprint", s))

    if sprint_filter:
        items = [i for i in raw_items if i["fields"].get("System.IterationPath", "").endswith(sprint_filter)]
    else:
        items = raw_items

    by_status = {"Completed": 0, "In Progress": 0, "Pending": 0, "Other": 0}
    by_assignee = {}
    by_epic = {}
    work_items = []

    for item in items:
        f = item["fields"]
        state = f.get("System.State", "")
        status_group = map_status(state)
        by_status[status_group] = by_status.get(status_group, 0) + 1

        assignee_obj = f.get("System.AssignedTo")
        assignee = assignee_obj["displayName"] if isinstance(assignee_obj, dict) else (assignee_obj or "(Blank)")

        if assignee not in by_assignee:
            by_assignee[assignee] = {"Completed": 0, "In Progress": 0, "Pending": 0, "Other": 0}
        by_assignee[assignee][status_group] += 1

        epic = _resolve_epic(item["id"], id_lookup, parent_map, epic_cache)
        epic_key = epic["id"] if epic else None
        epic_title = epic["title"] if epic else "(No Epic)"
        if f.get("System.WorkItemType") == "Epic":
            # An Epic doesn't belong to itself — only its descendants roll up under it.
            epic_key, epic_title = None, "(No Epic)"
        if epic_key not in by_epic:
            by_epic[epic_key] = {
                "id": epic_key, "title": epic_title,
                "Completed": 0, "In Progress": 0, "Pending": 0, "Other": 0,
            }
        by_epic[epic_key][status_group] += 1

        # ── Attention flags (docx §8.5, §9) ─────────────────────────────
        changed_raw = f.get("System.ChangedDate", "")
        due_raw = f.get("Microsoft.VSTS.Scheduling.DueDate") or f.get("Microsoft.VSTS.Scheduling.TargetDate") or ""
        changed_dt = _parse_dt(changed_raw)
        due_dt = _parse_dt(due_raw)

        is_completed = status_group == "Completed"
        is_unassigned = assignee == "(Blank)"
        blocking_spikes = _blocking_spikes(item, id_lookup)
        is_blocked = bool(blocking_spikes)
        is_overdue = bool(due_dt and due_dt < now and not is_completed)
        stale_days = (now - changed_dt).days if changed_dt else None
        is_stale = bool(stale_days is not None and stale_days >= STALE_DAYS and not is_completed)

        reasons = []
        if is_blocked:
            reasons.append("Blocked by " + ", ".join(f"Spike #{s['id']}" for s in blocking_spikes))
        if is_overdue:
            reasons.append("Overdue")
        if is_unassigned:
            reasons.append("No owner")
        if is_stale:
            reasons.append(f"No update in {stale_days}d")

        work_items.append({
            "id": item["id"],
            "title": f.get("System.Title", ""),
            "state": state,
            "status_group": status_group,
            "type": f.get("System.WorkItemType", ""),
            "assignee": assignee,
            "sprint": _sprint_label(f.get("System.IterationPath", "")),
            "epic_id": epic_key,
            "epic_title": epic_title,
            "area": f.get("System.AreaPath", ""),
            "priority": f.get("Microsoft.VSTS.Common.Priority"),
            "story_points": f.get("Microsoft.VSTS.Scheduling.StoryPoints"),
            "tags": f.get("System.Tags", "") or "",
            "created_date": f.get("System.CreatedDate", ""),
            "changed_date": changed_raw,
            "closed_date": f.get("Microsoft.VSTS.Common.ClosedDate", "") or "",
            "due_date": due_raw,
            # attention flags — client renders §8.1 KPIs and §8.5 table from these
            "is_blocked": is_blocked,
            "blocking_spikes": blocking_spikes,
            "is_overdue": is_overdue,
            "is_unassigned": is_unassigned,
            "is_stale": is_stale,
            "stale_days": stale_days,
            "attention_reasons": reasons,
        })

    total = len(items)
    completed = by_status["Completed"]

    return {
        "kpis": {
            "total": total,
            "completed": completed,
            "in_progress": by_status["In Progress"],
            "pending": by_status["Pending"],
            "pct_complete": round((completed / total * 100), 1) if total else 0,
            "blocked": sum(1 for w in work_items if w["is_blocked"]),
            "overdue": sum(1 for w in work_items if w["is_overdue"]),
            "unassigned": sum(1 for w in work_items if w["is_unassigned"]),
            "stale": sum(1 for w in work_items if w["is_stale"]),
        },
        "by_status": by_status,
        "by_assignee": [
            {"name": name, **counts}
            for name, counts in sorted(by_assignee.items(), key=lambda x: -sum(x[1].values()))
        ],
        "by_epic": sorted(
            by_epic.values(),
            key=lambda e: (e["id"] is None, e["title"].lower())
        ),
        "sprints": sprints,
        "work_items": work_items,
    }


def _empty_response():
    return {
        "kpis": {
            "total": 0, "completed": 0, "in_progress": 0, "pending": 0, "pct_complete": 0,
            "blocked": 0, "overdue": 0, "unassigned": 0, "stale": 0,
        },
        "by_status": {"Completed": 0, "In Progress": 0, "Pending": 0, "Other": 0},
        "by_assignee": [],
        "by_epic": [],
        "sprints": [],
        "work_items": [],
    }


def _json_response(data):
    return func.HttpResponse(
        json.dumps(data),
        mimetype="application/json",
        headers={"Access-Control-Allow-Origin": "*"}
    )
