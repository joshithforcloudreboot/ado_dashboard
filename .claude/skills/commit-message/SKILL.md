---
name: commit-message
description: Formats git commit messages for this repo (ado_dashboard). Use whenever creating a commit in this project.
---

This repo's commit history uses a specific, consistent format. Follow it exactly.

## Format

```
<Subject line>

Co-Authored-By: joshithforcloudreboot <joshitha@cloudrebootinc.com>
```

- **Subject only, no body paragraphs.** Every commit in this repo's history is a single sentence-case subject line — no bullet lists, no "What/Why" sections, no explanation of rationale in the body.
- **Imperative mood**, present tense: "Add", "Update", "Fix", "Restructure" — not "Added"/"Adding".
- **Sentence case**, no trailing period.
- Keep it under ~70 characters where possible; slightly longer is fine if it stays one line and stays specific.
- When the change belongs to a specific project phase (see `IMPLEMENTATION_PLAN.md` / `PROGRESS.md`), prefix with `Phase N: ` — e.g. `Phase 4: dashboard charts, KPI cards, summary and intern progress tabs`. Only use this prefix for phase-scoped milestone work, not incidental fixes.
- Always end with a blank line then the trailer:
  ```
  Co-Authored-By: joshithforcloudreboot <joshitha@cloudrebootinc.com>
  ```
  This is the fixed trailer for this repo — use this literal name/email, not a generic Claude co-author line.

## Examples from this repo's actual history

```
Restructure PROGRESS.md as session list, add phases to Session 1
Add session summary to PROGRESS.md
Client-side filtering: no API calls on sprint/assignee/state changes
Add sprint slicer to Intern Progress tab
Phase 4: implement Cloud Reboot dark design (Space Grotesk, donut, assignee bars)
Phase 2: ADO work items API endpoint
Fix app_location to frontend in Azure Static Web Apps workflow
```

## One commit per logical unit of work

When a single turn of work touches multiple concerns (e.g. a backend API change plus a frontend feature plus a docs update), split into separate commits by area rather than one large commit — e.g.:

```
Add Blocked/Overdue/Unassigned/Stale detection and Epic rollup to API
Add Epic slicer, attention KPIs, Needs Attention table, and Recent Activity to dashboard
Rewrite README with tech rationale, data flow, assumptions, and limitations
```

Each commit should be independently understandable from its subject line alone — a person skimming `git log --oneline` should be able to tell what changed without opening the diff.

## Before committing

1. `git status` and `git diff` to see what's actually staged/changed.
2. Group changes into logical commits (backend / frontend / docs / config are natural boundaries in this repo).
3. Stage each group with `git add <specific files>` — never `git add -A` or `git add .`.
4. Commit with the format above using a heredoc so formatting is preserved:
   ```bash
   git commit -m "$(cat <<'EOF'
   Subject line here

   Co-Authored-By: joshithforcloudreboot <joshitha@cloudrebootinc.com>
   EOF
   )"
   ```
5. Only commit when the user explicitly asks. Only push when the user explicitly asks — pushing to `main` triggers the GitHub Actions deploy to the live Azure Static Web App.
