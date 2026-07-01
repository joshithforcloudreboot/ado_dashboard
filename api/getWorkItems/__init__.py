import azure.functions as func
import httpx
import json
import os
import base64
from urllib.parse import quote

def main(req: func.HttpRequest) -> func.HttpResponse:
    pat = os.environ.get("ADO_PAT", "")
    org = os.environ.get("ADO_ORG", "CRI-Org")
    project = quote(os.environ.get("ADO_PROJECT", "Cloud Reboot AI Tiger Team"))

    credentials = base64.b64encode(f":{pat}".encode()).decode()
    headers = {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/json"
    }

    wiql_url = f"https://dev.azure.com/{org}/{project}/_apis/wit/wiql?api-version=7.1"
    wiql_body = {
        "query": "SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC"
    }

    try:
        with httpx.Client(timeout=30) as client:
            wiql_resp = client.post(wiql_url, json=wiql_body, headers=headers)
            wiql_resp.raise_for_status()
            ids = [item["id"] for item in wiql_resp.json().get("workItems", [])]

            if not ids:
                return _json_response([])

            fields = ",".join([
                "System.Id",
                "System.Title",
                "System.State",
                "System.WorkItemType",
                "System.AssignedTo",
                "System.IterationPath",
                "System.AreaPath",
                "System.CreatedDate",
                "System.ChangedDate",
                "Microsoft.VSTS.Common.Priority",
                "Microsoft.VSTS.Scheduling.StoryPoints"
            ])

            all_items = []
            for i in range(0, len(ids), 200):
                batch = ",".join(map(str, ids[i:i + 200]))
                url = f"https://dev.azure.com/{org}/{project}/_apis/wit/workitems?ids={batch}&fields={fields}&api-version=7.1"
                resp = client.get(url, headers=headers)
                resp.raise_for_status()
                all_items.extend(resp.json().get("value", []))

            return _json_response(all_items)

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


def _json_response(data):
    return func.HttpResponse(
        json.dumps(data),
        mimetype="application/json",
        headers={"Access-Control-Allow-Origin": "*"}
    )
