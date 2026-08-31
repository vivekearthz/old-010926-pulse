import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// MARTECH "born-wired" slave: MASTER EMAIL RELAY CLIENT (Master Policy v69).
//
// This portal sends NO email of its own and holds NO email provider keys.
// Every message is relayed to the master, which rotates across its shared
// provider pool inside each provider's FREE daily allowance.
//
// Local app code calls THIS route (same-origin, no secrets in the browser):
//   POST /api/public/hooks/email-send { to, subject, html, text? }
//
// Master owns this file - do not hand-edit; drift is overwritten on next sync.
// ---------------------------------------------------------------------------

const PRODUCT = process.env.SLAVE_PRODUCT_KEY ?? "old250826pulse";
const MASTER = process.env.MASTER_BASE_URL ?? "https://martech.innovexsis.com";

function sign(body: string) {
  const secret = process.env.MASTER_SYNC_SECRET;
  if (!secret) throw new Error("MASTER_SYNC_SECRET is not configured");
  return createHmac("sha256", secret).update(body).digest("hex");
}

function localCallerOk(raw: string, header: string | null): boolean {
  const secret = process.env.MASTER_SYNC_SECRET;
  if (!secret || !header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  try {
    const a = Buffer.from(header, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const Route = createFileRoute("/api/public/hooks/email-send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        // Public route: require the shared signature so this can never be used
        // as an open mail relay by anonymous callers.
        if (!localCallerOk(raw, request.headers.get("X-Sync-Signature"))) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(raw || "{}");
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }

        const body = JSON.stringify({ ...payload, portal_key: PRODUCT });
        // Self-healing: 3 attempts with exponential backoff before giving up.
        let lastError = "relay failed";
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(`${MASTER}/api/public/hooks/email-relay`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Sync-Signature": sign(body) },
              body,
            });
            const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (res.ok && json && json.ok === true) {
              return Response.json({ ok: true, via: "master_email_relay", detail: json });
            }
            lastError = `master ${res.status}`;
          } catch (err) {
            lastError = err instanceof Error ? err.message : "relay error";
          }
          if (attempt < 3) await sleep(attempt * 900);
        }
        return Response.json(
          { ok: false, via: "master_email_relay", error: lastError },
          { status: 502 },
        );
      },
    },
  },
});
