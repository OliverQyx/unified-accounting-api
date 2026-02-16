# Testing the API with Bokio

## Step 1: Install dependencies

```bash
npm install
```

## Step 2: Configure environment variables

Make sure your `.env` file contains the Bokio credentials:

```
BOKIO_CLIENT_ID=your-client-id
BOKIO_CLIENT_SECRET=your-client-secret
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

## Step 5: Get an API token

Bokio uses **static Integration Tokens** for private integrations. There is no OAuth browser flow, no token exchange, and no token refresh — tokens do not expire.

### Generate an Integration Token

1. Log in to your Bokio account
2. Go to **Settings > API Tokens** (or Settings > Integrations)
3. Create a new Private Integration
4. Copy the **Integration Token**

This token is your `X-Provider-Token` for all API requests.

## Step 6: Find your Company ID

Bokio requires a **Company ID** passed as the `X-Company-Id` header on every data request. This is the identifier for your company in Bokio's system.

You can find the Company ID in your Bokio account URL or in the API settings.

## Step 7: Fetch data

All requests need these three headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer dev-api-key-1` (your API key) |
| `X-Provider-Token` | Your Integration Token from Step 5 |
| `X-Company-Id` | Your Bokio Company ID from Step 6 |

### Fetch company information

```bash
curl "http://localhost:3000/v1/bokio/companyinformation" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_INTEGRATION_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_ID"
```

### Fetch customers (paginated)

```bash
curl "http://localhost:3000/v1/bokio/customers?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_INTEGRATION_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_ID"
```

### Fetch a single customer by ID

```bash
curl "http://localhost:3000/v1/bokio/customers/abc-123" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_INTEGRATION_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_ID"
```

### Fetch sales invoices (paginated)

```bash
curl "http://localhost:3000/v1/bokio/salesinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_INTEGRATION_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_ID"
```

### Fetch accounting accounts (chart of accounts)

```bash
curl "http://localhost:3000/v1/bokio/accountingaccounts" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_INTEGRATION_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_ID"
```

### Fetch journal entries (paginated)

```bash
curl "http://localhost:3000/v1/bokio/journals?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_INTEGRATION_TOKEN" ^
  -H "X-Company-Id: YOUR_COMPANY_ID"
```

## Available resource types

| Endpoint | Description | Paginated |
|---|---|---|
| `companyinformation` | Company details | Singleton |
| `accountingaccounts` | Chart of accounts | No |
| `customers` | Customer list | Yes |
| `salesinvoices` | Outgoing invoices | Yes |
| `journals` | Journal entries | Yes |

> **Note:** Bokio does not support `suppliers` or `supplierinvoices` through this API. Requesting those will return a `400 UNSUPPORTED_RESOURCE` error.

## Token management

Bokio Integration Tokens **do not expire** and **cannot be refreshed** via the API. If you need a new token, generate one in the Bokio app.

The following endpoints are **not supported** for Bokio and will return errors:

- `POST /v1/oauth/bokio/exchange` — Not applicable (no code exchange)
- `POST /v1/oauth/bokio/refresh` — Tokens don't expire
- `POST /v1/oauth/bokio/revoke` — Delete the integration in the Bokio app instead

## Query parameters

| Parameter | Description | Example |
|---|---|---|
| `page` | Page number (default: 1) | `?page=2` |
| `pageSize` | Items per page (default: 100) | `?pageSize=50` |

## Troubleshooting

- **401 from the API** — Check your `Authorization: Bearer dev-api-key-1` header. The API key must match one of the values in `API_KEYS` in your `.env`.
- **401 from Bokio** — Your Integration Token may be invalid. Verify it in the Bokio app under Settings > API Tokens.
- **400 Missing X-Company-Id** — Bokio requires the `X-Company-Id` header on every data request. Make sure you're sending it.
- **400 UNSUPPORTED_RESOURCE** — Bokio only supports: `companyinformation`, `accountingaccounts`, `customers`, `salesinvoices`, and `journals`. Suppliers and supplier invoices are not available.
- **429 Rate limited** — The API enforces a limit of 5 requests per second to Bokio. Slow down your requests.
- **Token not working** — Make sure you're using the Integration Token (not the client ID or client secret) as the `X-Provider-Token`.
