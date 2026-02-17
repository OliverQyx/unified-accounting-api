# Integration Suggestions

Practical advice for integrating the Unified Accounting API into your application.

---

## The API is Stateless

This API is a **stateless gateway** — it does not store tokens, cache data, or maintain sessions. Every request passes through to the underlying provider in real time. This means **you** are responsible for storing tokens, caching data, and controlling sync frequency.

---

## OAuth Token Management

- Store access tokens, refresh tokens, and expiry timestamps in an **encrypted database column** or a secret manager.
- Refresh tokens proactively **before** they expire — don't wait for a `401`.

| Provider       | Access Token | Refresh Token          |
|----------------|--------------|------------------------|
| Fortnox        | 1 hour       | 45 days                |
| Visma          | ~1 hour      | Long-lived (offline)   |
| Briox          | Varies       | Varies                 |
| Bokio          | Static       | N/A                    |
| Bjorn Lunden   | 1 hour       | N/A (use client credentials each cycle) |

---

## Recommended Architecture

**For prototyping:** Call the API directly — no caching needed.

**For production:** Use a cache + background sync pattern:

```
Your App  -->  Your API  -->  Redis Cache
                                  |
                            Sync Worker(s)  -->  Unified Accounting API  -->  Provider
                                  |
                             Job Queue (Bull/BullMQ, etc.)
```

1. **Redis** — Serve reads from cache (< 5ms) instead of hitting providers on every request.
2. **Job Queue** — Schedule sync jobs per connected company with concurrency limits.
3. **Sync Workers** — Pull data from the API on a schedule, store in your DB/cache.
4. **Webhook Receiver** — Accept the initial data dump when a company connects via OAuth.

**Suggested cache TTLs:**

| Resource                          | TTL        |
|-----------------------------------|------------|
| Company Info / Chart of Accounts  | 12-24 hrs  |
| Customers / Suppliers             | 1-4 hrs    |
| Invoices                          | 15-30 min  |
| Journals                          | 1-4 hrs    |

---

## Data Syncing

**Best approach: Webhook on connect + scheduled polling.**

1. Provide a `webhook_url` during OAuth connect to receive a full initial data dump.
2. After the initial dump, poll every 15-30 min using `lastModified` (Fortnox, Briox) or `modifiedSince` (Visma) to fetch only changed records.

Your webhook endpoint should respond `2xx` quickly and process data asynchronously (push to a job queue). The API retries up to 3 times with exponential backoff.

---

## Pagination

All list endpoints return paginated responses (`page`, `pageSize=100`). Loop until `hasMore == false`:

```
page = 1
do:
  response = GET /v1/{provider}/salesinvoices?page={page}&pageSize=100
  process(response.data)
  page++
while response.hasMore == true
```

Fetch pages **sequentially** to respect rate limits.

---

## Rate Limits and Error Handling

The API handles rate limiting and retries internally, but you should still be careful:

| Provider     | Requests/Second |
|--------------|-----------------|
| Fortnox      | 4               |
| Visma        | 10              |
| Bokio        | 5               |
| Briox/BL     | ~5-10           |

- Serialize sync requests per provider/company — don't fire in parallel.
- Spread sync jobs across time windows — don't sync all companies at once.
- On `429`/`502` responses, back off and retry with exponential delay.
- On `401` with `PROVIDER_AUTH_ERROR`, refresh the token and retry.
- On `404`, remove the resource from your cache.

---

## Provider-Specific Gotchas

**Fortnox** — Strictest rate limit (4 req/s). Refresh tokens expire after 45 days — users must re-auth if inactive. Journal detail fetches multiply API calls (`includeEntries=true`).

**Visma** — Uses `modifiedSince` (not `lastModified`) for incremental syncs. Higher rate limit (10 req/s).

**Briox** — Non-standard OAuth (custom token exchange). Journals are scoped by financial year — always pass `financialYear`.

**Bokio** — No OAuth flow (static tokens from Bokio UI). **No supplier support.** Requires `X-Company-Id` header.

**Bjorn Lunden** — Client credentials grant only (no user-facing OAuth). Requires `X-Company-Id` header. Request a new token each sync cycle.

---

## Security

- Never expose your API key in client-side code — route all calls through your backend.
- Encrypt stored tokens at rest.
- Use HTTPS everywhere.
- Validate webhook payloads before writing to your database.
- Rotate API keys periodically (the API supports multiple simultaneous keys for zero-downtime rotation).

---

## Quick Start Checklist

1. Get your API key and store it securely.
2. Register OAuth credentials with each provider you need.
3. Build the OAuth connect flow — redirect users to `GET /v1/oauth/{provider}/connect`.
4. Set up a webhook endpoint for the initial data dump.
5. Set up Redis and a sync worker for background polling (every 15-30 min).
6. Implement proactive token refresh before expiry.
7. Handle errors — auto-refresh on `401`, backoff on `429`/`502`.
8. Test with each provider — they all have quirks.
