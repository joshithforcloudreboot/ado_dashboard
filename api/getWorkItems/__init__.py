import azure.functions as func
import httpx
import json
import os
import base64
from urllib.parse import quote


STATUS_MAP = {
    "closed": "Completed", "done": "Completed", "resolved": "Completed", "completed": "Completed",
    "active": "In Progress", "in progress": "In Progress", "committed": "In Progress",
    "new": "Pending", "to do": "Pending", "proposed": "Pending", "ready": "Pending",
}


def map_status(state: str) -> str:
    return STATUS_MAP.get((state or "").lower(), "Other")


def main(req: func.HttpRequest) -> func.HttpResponse:
    pat = os.environ.get("ADO_PAT", "")
    org = os.environ.get("ADO_ORG", "CRI-Org")
    project = quote(os.environ.get("ADO_PROJECT", "Cloud Reboot AI Tiger Team"))
    sprint_filter = req.params.get("sprint", "")

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
                return _json_response(_empty_response())

            fields = ",".join([
                "System.Id", "System.Title", "System.State", "System.WorkItemType",
                "System.AssignedTo", "System.IterationPath", "System.AreaPath",
                "System.CreatedDate", "System.ChangedDate",
                "Microsoft.VSTS.Common.Priority", "Microsoft.VSTS.Scheduling.StoryPoints"
            ])

            raw_items = []
            for i in range(0, len(ids), 200):
                batch = ",".join(map(str, ids[i:i + 200]))
                url = f"https://dev.azure.com/{org}/{project}/_apis/wit/workitems?ids={batch}&fields={fields}&api-version=7.1"
                resp = client.get(url, headers=headers)
                resp.raise_for_status()
                raw_items.extend(resp.json().get("value", []))

            return _json_response(_transform(raw_items, sprint_filter))

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


def _transform(raw_items, sprint_filter):
    sprints = sorted(set(
        item["fields"].get("System.IterationPath", "").split("\\")[-1]
        for item in raw_items
        if item["fields"].get("System.IterationPath")
    ))

    if sprint_filter:
        items = [i for i in raw_items if i["fields"].get("System.IterationPath", "").endswith(sprint_filter)]
    else:
        items = raw_items

    by_status = {"Completed": 0, "In Progress": 0, "Pending": 0, "Other": 0}
    by_assignee = {}
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

        work_items.append({
            "id": item["id"],
            "title": f.get("System.Title", ""),
            "state": state,
            "status_group": status_group,
            "type": f.get("System.WorkItemType", ""),
            "assignee": assignee,
            "sprint": f.get("System.IterationPath", "").split("\\")[-1],
            "area": f.get("System.AreaPath", ""),
            "priority": f.get("Microsoft.VSTS.Common.Priority"),
            "story_points": f.get("Microsoft.VSTS.Scheduling.StoryPoints"),
            "created_date": f.get("System.CreatedDate", ""),
            "changed_date": f.get("System.ChangedDate", ""),
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
        },
        "by_status": by_status,
        "by_assignee": [
            {"name": name, **counts}
            for name, counts in sorted(by_assignee.items(), key=lambda x: -sum(x[1].values()))
        ],
        "sprints": sprints,
        "work_items": work_items,
    }


def _empty_response():
    return {
        "kpis": {"total": 0, "completed": 0, "in_progress": 0, "pending": 0, "pct_complete": 0},
        "by_status": {"Completed": 0, "In Progress": 0, "Pending": 0, "Other": 0},
        "by_assignee": [],
        "sprints": [],
        "work_items": [],
    }


def _json_response(data):
    return func.HttpResponse(
        json.dumps(data),
        mimetype="application/json",
        headers={"Access-Control-Allow-Origin": "*"}
    )
