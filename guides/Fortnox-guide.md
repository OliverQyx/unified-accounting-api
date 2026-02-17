# Testing the API with Fortnox

## Step 1: Install dependencies

```bash
npm install
```

## Step 2: Configure environment variables

Make sure your `.env` file contains the Fortnox credentials:

```
FORTNOX_CLIENT_ID=your-client-id
FORTNOX_CLIENT_SECRET=your-client-secret
FORTNOX_REDIRECT_URI=http://localhost:3000/v1/oauth/fortnox/callback
API_KEYS=dev-api-key-1
```

The `FORTNOX_REDIRECT_URI` must match the redirect URI registered in your Fortnox app.

## Step 3: Start the dev server

```bash
npm run dev
```

The server starts on `http://localhost:3000`. You should see a log confirming it's running.

## Step 4: Verify the server is up

```bash
curl http://localhost:3000/health
```

You should get a `200 OK` response.

## Step 5: Get an access token via OAuth

Fortnox uses the **OAuth 2.0 Authorization Code** flow. You need to authorize through a browser.

> **Note:** Both options handle the token exchange automatically. The difference is how the auth URL is initiated and where the tokens are delivered.

### Option A: Browser-based connect flow (recommended)

This is the simplest approach. The API handles the entire OAuth exchange for you.

Open this URL in your browser. For quick testing, use the built-in debug endpoint to display the tokens:

```
http://localhost:3000/v1/oauth/fortnox/connect?redirect_uri=http://localhost:3000/debug/tokens
```

Or replace the `redirect_uri` with your own endpoint where you want the tokens sent.

**What happens:**

1. You're redirected to the Fortnox login page
2. After you authorize, Fortnox redirects back to the API's callback endpoint
3. The API **automatically exchanges the code for tokens**
4. The tokens are POSTed to your `redirect_uri` via a hidden HTML form

Your `redirect_uri` will receive a POST with these fields: `access_token`, `refresh_token`, `token_type`, `expires_in`, and `provider`.

### Option B: API-driven flow

Use this if you want to get the authorization URL from the API (e.g. to embed in your own UI).

**1. Get the authorization URL:**

```bash
curl "http://localhost:3000/v1/oauth/fortnox/url" ^
  -H "Authorization: Bearer dev-api-key-1"
```

Returns:

```json
{
  "url": "https://apps.fortnox.se/oauth-v1/auth?client_id=...&redirect_uri=...&scope=...&response_type=code&access_type=offline"
}
```

**2. Open the URL in a browser**, log in with your Fortnox account, and authorize the app.

After authorization, Fortnox redirects to the API's callback endpoint which automatically exchanges the code for tokens and displays them on the page. Copy the `access_token` and `refresh_token`.

> **Note:** The difference from Option A is that you control when and how the auth URL is presented to the user. The token exchange still happens automatically via the callback.

## Step 6: Fetch data

All requests need these two headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer dev-api-key-1` (your API key) |
| `X-Provider-Token` | The `access_token` from Step 5 |

### Fetch company information

```bash
curl "http://localhost:3000/v1/fortnox/companyinformation" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch customers (paginated)

```bash
curl "http://localhost:3000/v1/fortnox/customers?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch a single customer by ID

```bash
curl "http://localhost:3000/v1/fortnox/customers/1001" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch sales invoices (paginated)

```bash
curl "http://localhost:3000/v1/fortnox/salesinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch sales invoices modified after a date

```bash
curl "http://localhost:3000/v1/fortnox/salesinvoices?lastModified=2024-01-01" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch supplier invoices

```bash
curl "http://localhost:3000/v1/fortnox/supplierinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch suppliers

```bash
curl "http://localhost:3000/v1/fortnox/suppliers?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch accounting accounts

```bash
curl "http://localhost:3000/v1/fortnox/accountingaccounts?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch journal entries (vouchers)

```bash
curl "http://localhost:3000/v1/fortnox/journals?page=1&pageSize=50&financialYear=2024" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

Journal entries are automatically hydrated with line-item details by default. To skip hydration (faster):

```bash
curl "http://localhost:3000/v1/fortnox/journals?page=1&pageSize=50&includeEntries=false" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch a single voucher by ID

Fortnox vouchers use a composite ID format: `{series}-{number}`.

```bash
curl "http://localhost:3000/v1/fortnox/journals/A-1" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

## Available resource types

| Endpoint | Description | Paginated |
|---|---|---|
| `companyinformation` | Company details | Singleton |
| `accountingaccounts` | Chart of accounts | Yes |
| `customers` | Customer list | Yes |
| `suppliers` | Supplier list | Yes |
| `salesinvoices` | Outgoing invoices | Yes |
| `supplierinvoices` | Incoming invoices | Yes |
| `journals` | Vouchers / journal entries | Yes |

## Refreshing an expired token

Access tokens expire after about 1 hour. Use the refresh token to get a new one:

```bash
curl -X POST http://localhost:3000/v1/oauth/fortnox/refresh ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"refresh_token\": \"YOUR_REFRESH_TOKEN\"}"
```

This returns a new `access_token` and `refresh_token`. Save both — the old refresh token is invalidated.

## Revoking a token

```bash
curl -X POST http://localhost:3000/v1/oauth/fortnox/revoke ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"token\": \"YOUR_REFRESH_TOKEN\"}"
```

## Query parameters

| Parameter | Description | Example |
|---|---|---|
| `page` | Page number (default: 1) | `?page=2` |
| `pageSize` | Items per page (default: 100) | `?pageSize=50` |
| `lastModified` | Filter by modification date (ISO date) | `?lastModified=2024-01-01` |
| `financialYear` | Financial year for vouchers | `?financialYear=2024` |
| `includeEntries` | Hydrate journal entries (default: true) | `?includeEntries=false` |

## Troubleshooting

- **401 from the API** — Check your `Authorization: Bearer dev-api-key-1` header. The API key must match one of the values in `API_KEYS` in your `.env`.
- **401 from Fortnox** — Your access token has expired. Refresh it using the refresh endpoint.
- **403 Forbidden** — Your Fortnox app may not have the required scopes. The default scopes are: `companyinformation invoice supplierinvoice customer supplier bookkeeping`.
- **429 Rate limited** — The API enforces a limit of 4 requests per second to Fortnox (with automatic retry up to 6 times). If you still get 429 errors, slow down.
- **OAuth callback error** — Make sure `FORTNOX_REDIRECT_URI` in your `.env` matches the redirect URI registered in the Fortnox developer portal.
