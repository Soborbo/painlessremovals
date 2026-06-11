# i-mve outage: diagnosis, lead recovery and replay

**Incident:** since the 2026-06-11 afternoon deploy window, leads reach the
Painless-CRM but every call to the i-mve API
(`https://api.app.i-mve.com/job/user/…`) times out after 10s:

```
[ERROR][i-mve] API call timed out {"timeoutMs":10000}
[ERROR][i-mve] Sync failed {"quoteId":"CB-…","error":"Timeout after 10000ms"}
```

## What we know (verified)

1. **The i-mve call path in this repo is unchanged.** The Painless-CRM PRs
   (#11, #12) only added a new CRM block *after* the i-mve sync; payload,
   headers, timeout and enablement logic are byte-identical.
2. **Outbound fetch from the production Worker works.** The same Worker
   delivers to Painless-CRM, Resend and GA4 Measurement Protocol without
   issues. Only the i-mve destination fails, and it fails with a *silent*
   10s timeout (no HTTP response at all), which is the signature of a
   firewall **dropping** the connection rather than rejecting it.
3. **The earlier incident report's "external 403 allowlist" evidence is
   invalid.** Those probes were made from a sandboxed agent whose egress
   proxy returns `403 Host not in allowlist` / `x-deny-reason:
   host_not_allowed` for *every* non-allowlisted domain (`example.com`
   included). That response came from the probe's own proxy, not from
   i-mve. Do not quote it to i-mve support.

Net: the failure sits between Cloudflare's egress and i-mve's server —
either i-mve (or their host) started dropping Cloudflare egress IPs, or
their endpoint is down/hanging. It cannot be fixed from this codebase; it
needs i-mve's side (see "What to ask i-mve" below).

## What the code now does about it

So that **no lead is lost** while the upstream issue is resolved:

- Every failed i-mve sync (from `/api/save-quote` and `/api/callbacks`)
  parks the fully mapped i-mve payload in KV (`RATE_LIMITER` namespace,
  `imve_dlq:` prefix, 30-day TTL). Repeated failures for the same quote
  overwrite a single entry; a later in-request retry that succeeds removes
  it.
- The admin notification email still flags `CRM SYNC FAILED` submissions.

## Ops endpoint: `/api/imve/recovery`

All calls require `Authorization: Bearer <HEALTH_CHECK_TOKEN>`.

### Status + live probe (run this to get untainted evidence)

```sh
# Queue + config status
curl -H "Authorization: Bearer $HEALTH_CHECK_TOKEN" \
  https://painlessremovals.com/api/imve/recovery

# Live reachability probe FROM the production Worker (GET — cannot create a lead)
curl -H "Authorization: Bearer $HEALTH_CHECK_TOKEN" \
  "https://painlessremovals.com/api/imve/recovery?probe=1"
```

Probe interpretation:

| Probe result | Meaning |
|---|---|
| `reachable: true`, any HTTP status, fast | Network path is fine — if syncs still fail, look at auth/payload, then replay the queue |
| `reachable: false`, timeout after 8s | i-mve (or their firewall) silently drops Cloudflare egress traffic |
| `reachable: false`, DNS/TLS/connection error | i-mve endpoint itself is down or its DNS changed |

### Replay parked leads (after i-mve confirms a fix)

```sh
curl -X POST -H "Authorization: Bearer $HEALTH_CHECK_TOKEN" \
  https://painlessremovals.com/api/imve/recovery
```

Replays up to 20 entries per call; repeat while the response has
`"hasMore": true`. Successfully delivered entries are deleted; failures stay
parked (with TTL) and are listed in the response.

## What to ask i-mve

- Check their firewall/access logs for requests to
  `/job/user/67afa16a88df164ff28c0780` from **Cloudflare egress IP ranges**
  (published at <https://www.cloudflare.com/ips/>) since 2026-06-11 — are
  they being dropped?
- Cloudflare Workers have **no fixed egress IP**, so a source-IP allowlist
  cannot work reliably. Ask them to either allowlist the Cloudflare egress
  ranges or rely on token auth — the integration already sends
  `Authorization: Bearer <IMVE_API_KEY>` when `IMVE_API_KEY` is set in the
  Worker (note: token auth only helps once their firewall stops dropping
  the connection before HTTP happens).
- After they change anything, verify with the `?probe=1` call above, then
  `POST /api/imve/recovery` until the queue is empty.
