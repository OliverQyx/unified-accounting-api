# Unified ERP API

A stateless API gateway that provides a unified interface to multiple Swedish ERP systems. All providers are normalized to canonical data models, so consumers get a consistent API regardless of the underlying ERP.

## Supported Providers

| Provider | Auth Method | Supported Resources |
|----------|-------------|---------------------|
| Fortnox | OAuth 2.0 | SalesInvoices, SupplierInvoices, Customers, Suppliers, Journals, AccountingAccounts, CompanyInformation |
| Visma | OAuth 2.0 | SalesInvoices, SupplierInvoices, Customers, Suppliers, Journals, AccountingAccounts, CompanyInformation |
| Briox | Token Exchange | SalesInvoices, SupplierInvoices, Customers, Suppliers, Journals, AccountingAccounts, CompanyInformation |
| Bokio | Static Token | SalesInvoices, Customers, Journals, AccountingAccounts, CompanyInformation |
| Bjorn Lunden | Client Credentials | SalesInvoices, SupplierInvoices, Customers, Suppliers, Journals, AccountingAccounts, CompanyInformation |

## Setup

### Prerequisites

- Node.js 16+

### Install

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
NODE_ENV=development
API_KEYS=your-api-key

# Fortnox
FORTNOX_CLIENT_ID=
FORTNOX_CLIENT_SECRET=
FORTNOX_REDIRECT_URI=

# Visma
VISMA_CLIENT_ID=
VISMA_CLIENT_SECRET=
VISMA_REDIRECT_URI=

# Briox
BRIOX_CLIENT_ID=
BRIOX_CLIENT_SECRET=

# Bokio
BOKIO_CLIENT_ID=

# Bjorn Lunden
BJORN_LUNDEN_CLIENT_ID=
BJORN_LUNDEN_CLIENT_SECRET=
```

Provider-specific variables are validated lazily on first use — you only need to configure the providers you plan to use.

### Run

```bash
# Development (hot-reload)
npm run dev

# Production
npm run build
npm start
```

## API Reference

### Authentication

All API endpoints (except `/health`) require an API key via the `Authorization` header:

```
Authorization: Bearer <your-api-key>
```

Resource endpoints additionally require a provider access token:

```
X-Provider-Token: <provider-access-token>
```

Some providers (Bokio, Bjorn Lunden) also require:

```
X-Company-Id: <company-id>
```

### Endpoints

#### Health Check

```
GET /health
```

#### List Resources

```
GET /v1/:provider/:resourceType
```

Query parameters:

| Param | Default | Description |
|-------|---------|-------------|
| `page` | 1 | Page number |
| `pageSize` | 100 | Items per page |
| `lastModified` | — | ISO date filter (Fortnox, Briox) |
| `modifiedSince` | — | ISO datetime filter (Visma) |
| `financialYear` | — | Financial year (Journals) |
| `includeEntries` | true | Hydrate journal entries |
| `includeBalances` | false | Include account balances (Bokio) |

#### Get Single Resource

```
GET /v1/:provider/:resourceType/:id
```

#### OAuth Endpoints

```
GET  /v1/oauth/:provider/connect        # Browser redirect to provider login
GET  /v1/oauth/:provider/callback        # OAuth callback handler
GET  /v1/oauth/:provider/url             # Get authorization URL (JSON)
POST /v1/oauth/:provider/exchange        # Exchange code for tokens
POST /v1/oauth/:provider/refresh         # Refresh access token
POST /v1/oauth/:provider/revoke          # Revoke token
```

### Example: Fetch Invoices from Fortnox

```bash
# 1. Get the OAuth authorization URL
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/v1/oauth/fortnox/url?state=random123"

# 2. Open the returned URL in a browser, authorize, and copy the code from the callback URL

# 3. Exchange the code for tokens
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code": "AUTH_CODE"}' \
  http://localhost:3000/v1/oauth/fortnox/exchange

# 4. Fetch invoices using the access token
curl -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Provider-Token: ACCESS_TOKEN" \
  "http://localhost:3000/v1/fortnox/SalesInvoices"
```

## Architecture

- **Stateless** — no database, no token storage. Consumers manage all state.
- **Canonical DTOs** — all providers map to the same data structures.
- **Rate limiting** — token bucket per provider (Fortnox 4 req/s, others 5-10 req/s).
- **Retry with backoff** — automatic retries on 429/5xx with exponential backoff.
- **Journal hydration** — opt-in N+1 fetches for journal entries in batches of 5.

## Tech Stack

- TypeScript
- Express 5
- Zod (validation)
- dotenv (configuration)
