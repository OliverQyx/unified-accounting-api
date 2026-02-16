# Testing the API with Visma eEkonomi

## Step 1: Install dependencies

```bash
npm install
```

## Step 2: Configure environment variables

Make sure your `.env` file contains the Visma credentials:

```
VISMA_CLIENT_ID=your-client-id
VISMA_CLIENT_SECRET=your-client-secret
VISMA_REDIRECT_URI=https://your-domain.com/v1/oauth/visma/callback
API_KEYS=dev-api-key-1
```

> **Note:** Visma requires an HTTPS redirect URI. For local development, use a tunnel like ngrok: `ngrok http 3000`, then set `VISMA_REDIRECT_URI` to your ngrok URL + `/v1/oauth/visma/callback`.

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

Visma uses the **OAuth 2.0 Authorization Code** flow. You need to authorize through a browser.

### Option A: Browser-based connect flow

Open this URL in your browser (replace `YOUR_REDIRECT` with where you want the tokens sent back):

```
http://localhost:3000/v1/oauth/visma/connect?redirect_uri=YOUR_REDIRECT
```

This redirects you to Visma's login page. After you authorize, the API exchanges the code for tokens and POSTs them to your `redirect_uri` as a hidden HTML form.

### Option B: Manual step-by-step

**1. Get the authorization URL:**

```bash
curl "http://localhost:3000/v1/oauth/visma/url" ^
  -H "Authorization: Bearer dev-api-key-1"
```

Returns:

```json
{
  "url": "https://identity.vismaonline.com/connect/authorize?client_id=...&redirect_uri=...&response_type=code&scope=..."
}
```

**2. Open the URL in a browser**, log in with your Visma account, and authorize the app. Visma redirects back to your `VISMA_REDIRECT_URI` with a `code` query parameter.

**3. Exchange the code for tokens:**

```bash
curl -X POST http://localhost:3000/v1/oauth/visma/exchange ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"code\": \"THE_CODE_FROM_REDIRECT\"}"
```

Returns:

```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "REFRESH_TOKEN_VALUE",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Save both `access_token` and `refresh_token`.

## Step 6: Fetch data

All requests need these two headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer dev-api-key-1` (your API key) |
| `X-Provider-Token` | The `access_token` from Step 5 |

### Fetch company information

```bash
curl "http://localhost:3000/v1/visma/companyinformation" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch customers

```bash
curl "http://localhost:3000/v1/visma/customers?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch customers modified after a date

```bash
curl "http://localhost:3000/v1/visma/customers?modifiedSince=2024-01-01T00:00:00Z" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch a single customer by ID

```bash
curl "http://localhost:3000/v1/visma/customers/abc-123-def" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch sales invoices

```bash
curl "http://localhost:3000/v1/visma/salesinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch supplier invoices

```bash
curl "http://localhost:3000/v1/visma/supplierinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch suppliers

```bash
curl "http://localhost:3000/v1/visma/suppliers?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch accounting accounts

```bash
curl "http://localhost:3000/v1/visma/accountingaccounts?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch accounting accounts with balances

```bash
curl "http://localhost:3000/v1/visma/accountingaccounts?includeBalances=true" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch journal entries (vouchers)

```bash
curl "http://localhost:3000/v1/visma/journals?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch a single voucher by ID

```bash
curl "http://localhost:3000/v1/visma/journals/abc-123-def" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

## Available resource types

| Endpoint | Description | Paginated |
|---|---|---|
| `companyinformation` | Company settings | Singleton |
| `accountingaccounts` | Chart of accounts | Yes |
| `customers` | Customer list | Yes |
| `suppliers` | Supplier list | Yes |
| `salesinvoices` | Outgoing invoices | Yes |
| `supplierinvoices` | Incoming invoices | Yes |
| `journals` | Vouchers / journal entries | Yes |

## Refreshing an expired token

Access tokens expire after about 1 hour. Use the refresh token to get a new one:

```bash
curl -X POST http://localhost:3000/v1/oauth/visma/refresh ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"refresh_token\": \"YOUR_REFRESH_TOKEN\"}"
```

This returns a new `access_token` and `refresh_token`. Save both — the old refresh token is invalidated.

## Revoking a token

```bash
curl -X POST http://localhost:3000/v1/oauth/visma/revoke ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"token\": \"YOUR_REFRESH_TOKEN\"}"
```

## Query parameters

| Parameter | Description | Example |
|---|---|---|
| `page` | Page number (default: 1) | `?page=2` |
| `pageSize` | Items per page (default: 100) | `?pageSize=50` |
| `modifiedSince` | Filter by modification datetime (ISO) | `?modifiedSince=2024-01-01T00:00:00Z` |
| `includeBalances` | Include account balances (default: false) | `?includeBalances=true` |

## Troubleshooting

- **401 from the API** — Check your `Authorization: Bearer dev-api-key-1` header. The API key must match one of the values in `API_KEYS` in your `.env`.
- **401 from Visma** — Your access token has expired. Refresh it using the refresh endpoint.
- **403 Forbidden** — Your Visma app may not have the required scopes. The default scopes are: `ea:api offline_access ea:sales_readonly ea:accounting_readonly ea:purchase_readonly`.
- **429 Rate limited** — The API enforces a limit of 10 requests per second to Visma. Slow down your requests.
- **OAuth callback error** — Visma requires HTTPS redirect URIs. Make sure you're using an ngrok tunnel or similar for local development.
- **Redirect URI mismatch** — Make sure `VISMA_REDIRECT_URI` in your `.env` exactly matches the redirect URI registered in Visma's developer portal.
