# Testing the API with Björn Lundén

## Step 1: Install dependencies

```bash
npm install
```

## Step 2: Configure environment variables

Make sure your `.env` file contains the Björn Lundén credentials:

```
BJORN_LUNDEN_CLIENT_ID=your-client-id
BJORN_LUNDEN_CLIENT_SECRET=your-client-secret
API_KEYS=dev-api-key-1
```

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

## Step 5: Get an access token

Björn Lundén uses **OAuth 2.0 Client Credentials** — there is no browser login. The API obtains a token directly using your client ID and secret configured in `.env`.

```bash
curl -X POST http://localhost:3000/v1/oauth/bjornlunden/refresh ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"refresh_token\": \"_\"}"
```

> **Why `/refresh`?** Björn Lundén doesn't have a separate token exchange — every token request uses the client credentials grant. The `refresh_token` body field is required by the endpoint but its value is ignored.

Returns:

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

Save the `access_token` value. It's valid for **1 hour**.

## Step 6: Find your Company GUID

Björn Lundén requires a **Company GUID** passed as the `X-Company-Id` header on every data request. This is the unique identifier for your company in Björn Lundén's system.

> **Important:** The Company GUID is **not** the same as your `BJORN_LUNDEN_CLIENT_ID` or `BJORN_LUNDEN_CLIENT_SECRET`. Using the client ID as the company GUID will result in a `500 Internal Server Error` from BL's API.

### How to discover your Company GUID

Use the access token from Step 5 to call BL's API directly and list connected companies.

**Option A — Get just the GUIDs:**

```bash
curl "https://apigateway.blinfo.se/bla-api/v1/sp/meta/allKeys" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Returns a JSON array of GUIDs, each representing a connected company you have access to.

**Option B — Get full company details (name, GUID, email, scopes):**

```bash
curl "https://apigateway.blinfo.se/bla-api/v1/sp/common/client" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Returns a JSON body with the name, GUID(s), email address, and scopes for each connected company.

If this is a new integration, the list will likely contain only one entry — the **sandbox company** that was created during onboarding. Use that GUID as your `X-Company-Id`.

You can also find the Company GUID in **Lundify > Integrationer > kugghjulet** (the gear icon).

## Step 7: Fetch data

Once you have the token and company GUID, you can hit any resource endpoint. All requests need these three headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer dev-api-key-1` (your API key) |
| `X-Provider-Token` | The `access_token` from Step 5 |
| `X-Company-Id` | Your company GUID from Step 6 |

### Fetch company information

```bash
curl "http://localhost:3000/v1/bjornlunden/companyinformation" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_GUID"
```

### Fetch customers

```bash
curl "http://localhost:3000/v1/bjornlunden/customers" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_GUID"
```

### Fetch sales invoices (paginated)

```bash
curl "http://localhost:3000/v1/bjornlunden/salesinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_GUID"
```

### Fetch a single sales invoice by ID

```bash
curl "http://localhost:3000/v1/bjornlunden/salesinvoices/12345" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_GUID"
```

### Fetch supplier invoices

```bash
curl "http://localhost:3000/v1/bjornlunden/supplierinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_GUID"
```

### Fetch accounting accounts

```bash
curl "http://localhost:3000/v1/bjornlunden/accountingaccounts" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_GUID"
```

### Fetch journal entries (paginated)

```bash
curl "http://localhost:3000/v1/bjornlunden/journals?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_GUID"
```

## Available resource types

| Endpoint | Description | Paginated |
|---|---|---|
| `companyinformation` | Company details | Singleton |
| `accountingaccounts` | Chart of accounts | No |
| `customers` | Customer list | No |
| `suppliers` | Supplier list | No |
| `salesinvoices` | Outgoing invoices | Yes |
| `supplierinvoices` | Incoming invoices | Yes |
| `journals` | Journal/ledger entries | Yes |

## Refreshing an expired token

Tokens expire after 1 hour. Simply repeat Step 5 to get a new one — no refresh token is needed.

## Troubleshooting

- **401 from the API** — Check your `Authorization: Bearer dev-api-key-1` header. The API key must match one of the values in `API_KEYS` in your `.env`.
- **401 from Björn Lundén** — Your access token has expired (re-run Step 5) or your client credentials are incorrect.
- **500 Internal Server Error / "credentials is null"** — You are passing an invalid Company GUID. Make sure `X-Company-Id` is the company GUID from Step 6 (not your client ID or client secret). Re-run Step 6 to discover the correct GUID.
- **400 Missing X-Company-Id** — Björn Lundén requires the `X-Company-Id` header on every data request. Make sure you're sending it.
- **429 Rate limited** — The API enforces a limit of 10 requests per second to Björn Lundén. Slow down your requests.
- **Token request failed** — Verify that `BJORN_LUNDEN_CLIENT_ID` and `BJORN_LUNDEN_CLIENT_SECRET` in your `.env` are correct.
