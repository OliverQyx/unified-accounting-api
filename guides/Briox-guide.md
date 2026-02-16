# Testing the API with Briox

## Step 1: Install dependencies

```bash
npm install
```

## Step 2: Configure environment variables

Make sure your `.env` file contains the Briox credentials:

```
BRIOX_CLIENT_ID=your-client-id
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

Briox uses a **non-standard OAuth flow**. There is no browser-based login. Instead, you generate an **Application Token** from the Briox admin panel and exchange it for an access token.

### Generate an Application Token

1. Log in to your Briox account
2. Go to **Admin > Users > Application Token**
3. Generate a new Application Token
4. Copy the token value

### Exchange the Application Token

```bash
curl -X POST http://localhost:3000/v1/oauth/briox/exchange ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"code\": \"YOUR_APPLICATION_TOKEN\"}"
```

Returns:

```json
{
  "access_token": "abc123...",
  "refresh_token": "def456...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

Save both `access_token` and `refresh_token`. You will need both to refresh the token later.

## Step 6: Fetch data

All requests need these two headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer dev-api-key-1` (your API key) |
| `X-Provider-Token` | The `access_token` from Step 5 |

### Fetch company information

```bash
curl "http://localhost:3000/v1/briox/companyinformation" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch customers

```bash
curl "http://localhost:3000/v1/briox/customers?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch a single customer by ID

```bash
curl "http://localhost:3000/v1/briox/customers/123" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch sales invoices

```bash
curl "http://localhost:3000/v1/briox/salesinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch sales invoices modified after a date

```bash
curl "http://localhost:3000/v1/briox/salesinvoices?lastModified=2024-01-01" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch supplier invoices

```bash
curl "http://localhost:3000/v1/briox/supplierinvoices?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch suppliers

```bash
curl "http://localhost:3000/v1/briox/suppliers?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch accounting accounts

```bash
curl "http://localhost:3000/v1/briox/accountingaccounts?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

### Fetch journal entries

Briox journals are **year-scoped**. If you don't provide a `financialYear`, the API automatically detects the current financial year.

```bash
curl "http://localhost:3000/v1/briox/journals?page=1&pageSize=50" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

To fetch journals for a specific financial year:

```bash
curl "http://localhost:3000/v1/briox/journals?page=1&pageSize=50&financialYear=10" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

Journal entries are automatically hydrated with line-item details by default. To skip hydration (faster):

```bash
curl "http://localhost:3000/v1/briox/journals?page=1&pageSize=50&includeEntries=false" ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "X-Provider-Token: YOUR_ACCESS_TOKEN"
```

## Available resource types

| Endpoint | Description | Paginated |
|---|---|---|
| `companyinformation` | Company/user info | Singleton |
| `accountingaccounts` | Chart of accounts | Yes |
| `customers` | Customer list | Yes |
| `suppliers` | Supplier list | Yes |
| `salesinvoices` | Outgoing invoices | Yes |
| `supplierinvoices` | Incoming invoices | Yes |
| `journals` | Journal entries (year-scoped) | Yes |

## Refreshing an expired token

When refreshing, Briox requires both the refresh token and the current access token. Pass them separated by a pipe character (`|`):

```bash
curl -X POST http://localhost:3000/v1/oauth/briox/refresh ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"refresh_token\": \"YOUR_REFRESH_TOKEN|YOUR_ACCESS_TOKEN\"}"
```

If you only have the refresh token, you can pass it alone (it will be used for both parameters):

```bash
curl -X POST http://localhost:3000/v1/oauth/briox/refresh ^
  -H "Authorization: Bearer dev-api-key-1" ^
  -H "Content-Type: application/json" ^
  -d "{\"refresh_token\": \"YOUR_REFRESH_TOKEN\"}"
```

## Query parameters

| Parameter | Description | Example |
|---|---|---|
| `page` | Page number (default: 1) | `?page=2` |
| `pageSize` | Items per page (default: 100) | `?pageSize=50` |
| `lastModified` | Filter by modification date (ISO date) | `?lastModified=2024-01-01` |
| `financialYear` | Financial year ID for journals | `?financialYear=10` |
| `includeEntries` | Hydrate journal entries (default: true) | `?includeEntries=false` |

## Troubleshooting

- **401 from the API** — Check your `Authorization: Bearer dev-api-key-1` header. The API key must match one of the values in `API_KEYS` in your `.env`.
- **401 from Briox** — Your access token has expired. Refresh it using the refresh endpoint.
- **Token exchange failed** — Make sure the Application Token you generated in Briox is correct and hasn't been revoked.
- **No financial years found** — Your Briox account may not have any financial years configured. Set them up in the Briox admin panel.
- **429 Rate limited** — The API enforces a limit of 10 requests per second to Briox. Slow down your requests.
- **Token revocation not supported** — Briox does not support token revocation via API. Revoke tokens through the Briox admin panel.
