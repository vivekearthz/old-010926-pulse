# MASTER PATCH v59 — Repo Name Policy + IMSP JSON Channel

Mandatory for the master portal, every sub-portal and every slave portal owned by
vivekearthz (vivekearthz@gmail.com). Master wins on every conflict.

## 1. GitHub repository naming policy (zero human intervention)

1. A repository name MUST equal the Lovable project name, slugified
   (lowercase, non-alphanumeric -> "-", max 90 chars). Random Lovable shells
   such as `my-secret-automagic-0ad5a80b` are NON-COMPLIANT.
2. Non-compliant repos are RENAMED in place to the canonical name via
   `PATCH /repos/{owner}/{repo} { name }`. Never create a duplicate repo, never
   ask a human to rename anything.
3. If the canonical name is already occupied by a different repository (project
   moved to another workspace and re-connected to GitHub), the incumbent is
   RETIRED FIRST by renaming it to `old-DDMMYY-<name>` (UTC date), then the live
   repo takes the canonical name.
4. Orphan random-named repos that no active portal claims are retired with the
   same `old-DDMMYY-` prefix.
5. `portal_registry.github_repo` is repaired after every rename, legacy links are
   archived to `audit_logs`, and the admin ledger shows CURRENT repos only.
6. Enforcement runs every 24 hours (pg_cron `repo-name-policy-daily`, 02:50 IST)
   plus inside the daily fleet orchestrator, then triggers a fleet republish.

Master implementation: `src/lib/repo-naming.server.ts`,
hook `/api/public/hooks/repo-name-policy`.

## 2. IMSP — Inter-Master Slave Protocol (JSON) is now live on the master

Root cause of the fleet error "Only HTML requests are supported here": slaves
called flat JSON paths that had no server route, so the SSR shell answered with
HTML even though the HMAC signature was valid. Master now serves IMSP JSON on:

- `POST /api/portal-sync`
- `POST /api/public/portal-sync`
- `POST /api/imsp/{action}`
- `POST /api/public/imsp/{action}`

Actions: `sync` (default), `instructions`, `patch`, `report`, `ack`,
`heartbeat`, `capabilities`, `ping` (unauthenticated health probe).

Auth: `X-Sync-Signature: hmac_sha256(MASTER_SYNC_SECRET, rawBody)`.
Body: `{ "portal_key": "<slave key>", "action": "sync", "patch_version": "v59" }`.
Every authenticated call updates `last_event_at` + `sync_status`, so a sync is
also a heartbeat. Slaves MUST treat any HTML response as a transport failure and
retry against the next alias with exponential backoff.

## 3. Slave requirements

- Keep the born-wired `/api/public/portal/sync-now` receiver.
- Push code inventory and command acks to the master IMSP `report` / `ack`
  actions; never assume pull-only sync.
- Do not rename your own GitHub repo; the master owns naming.


<!-- applied-by: MARTECH master | version: v59 | reason: cron:fleet-identity-drift | at: 2026-08-24T02:25:36.472Z -->
