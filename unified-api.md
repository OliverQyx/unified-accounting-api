# Unified ERP API — Implementation Plan

A standalone Node.js + Express + TypeScript API that provides a unified interface to Swedish ERP/accounting systems: **Fortnox**, **Visma**, **Briox**, **Bokio**, and **Björn Lunden**.

The API is **stateless** — no database, no stored sessions, no consent model. It acts as a pure **proxy/translator layer**: consumers pass provider credentials (access tokens) with each request, the API calls the appropriate provider, maps the response to a canonical format, and returns unified data.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Step-by-Step Build Guide](#3-step-by-step-build-guide)
4. [Core Infrastructure](#4-core-infrastructure)
5. [Canonical Data Types (DTOs)](#5-canonical-data-types-dtos)
6. [Provider Implementations](#6-provider-implementations)
7. [API Endpoints](#7-api-endpoints)
8. [Authentication](#8-authentication)
9. [Error Handling](#9-error-handling)
10. [Environment Configuration](#10-environment-configuration)
11. [Provider Reference Tables](#11-provider-reference-tables)

---

## 1. Architecture Overview

### Design Principles

- **Stateless**: No database, no token storage, no sessions. All state is managed by the API consumer.
- **Provider-agnostic**: Consumers interact with one unified API surface regardless of which ERP provider is behind the request.
- **Canonical mapping**: Every provider's data is mapped to the same DTO (Data Transfer Object) schema. Consumers never see raw provider data.
- **Passthrough credentials**: Consumers pass provider access tokens (and provider-specific identifiers like `companyId` or `userKey`) with each request.
- **Rate-limited**: Per-provider token-bucket rate limiters protect against provider API throttling.
- **Retry-resilient**: Automatic exponential backoff retries for transient errors (429, 5xx).

### Request Flow

```
Consumer → [API Key Auth] → Express Router → Provider Client → Provider API
                                                    ↓
Consumer ← [Unified JSON]  ← Canonical Mapper ← Raw Response
```

1. Consumer sends request with API key + provider name + provider access token + resource type.
2. Express middleware validates the API key.
3. Router dispatches to the correct provider client based on provider name.
4. Provider client makes HTTP call(s) to the provider API (respecting rate limits, with retries).
5. Raw provider response is passed through the provider's mapper to produce canonical DTOs.
6. Unified JSON response is returned to the consumer.

### What the Consumer Manages

Since this API is stateless, the consumer is responsible for:

- **OAuth token lifecycle**: Obtaining access tokens via OAuth flows (the API provides helper endpoints to generate auth URLs, exchange codes, and refresh tokens — but the consumer stores the tokens).
- **Provider identification**: Knowing which provider (fortnox, visma, etc.) each company uses.
- **Provider-specific IDs**: Passing `companyId` for Bokio, `userKey` for Björn Lunden.
- **Token refresh scheduling**: Deciding when to refresh tokens (the API provides a refresh endpoint, but the consumer must call it and store the new tokens).

---

## 2. Project Structure

```
unified-erp-api/
├── src/
│   ├── index.ts                          # Express app entry point
│   ├── config/
│   │   └── env.ts                        # Environment variable loading and validation
│   ├── middleware/
│   │   ├── auth.ts                       # API key authentication middleware
│   │   ├── error-handler.ts              # Global error handling middleware
│   │   └── validate.ts                   # Zod request validation middleware
│   ├── routes/
│   │   ├── resources.ts                  # GET /:provider/:resourceType — list resources
│   │   │                                 # GET /:provider/:resourceType/:id — get single resource
│   │   └── oauth.ts                      # OAuth helper routes (auth URL, exchange, refresh, revoke)
│   ├── providers/
│   │   ├── types.ts                      # Shared provider types (ProviderName, ResourceConfig, RateLimitConfig, etc.)
│   │   ├── registry.ts                   # Provider registry — maps provider names to clients + configs
│   │   ├── rate-limiter.ts               # Token bucket rate limiter class
│   │   ├── fortnox/
│   │   │   ├── client.ts                 # Fortnox HTTP client
│   │   │   ├── config.ts                 # Fortnox resource configs (endpoints, keys, mappers)
│   │   │   ├── mapper.ts                 # Raw Fortnox → canonical DTO mappers
│   │   │   └── oauth.ts                  # Fortnox OAuth helpers (auth URL, exchange, refresh, revoke)
│   │   ├── visma/
│   │   │   ├── client.ts
│   │   │   ├── config.ts
│   │   │   ├── mapper.ts
│   │   │   └── oauth.ts
│   │   ├── briox/
│   │   │   ├── client.ts
│   │   │   ├── config.ts
│   │   │   ├── mapper.ts
│   │   │   └── oauth.ts
│   │   ├── bokio/
│   │   │   ├── client.ts
│   │   │   ├── config.ts
│   │   │   ├── mapper.ts
│   │   │   └── oauth.ts                  # Bokio token handling (static tokens, no OAuth flow)
│   │   └── bjornlunden/
│   │       ├── client.ts
│   │       ├── config.ts
│   │       ├── mapper.ts
│   │       └── oauth.ts                  # Björn Lunden client credentials flow
│   ├── types/
│   │   └── dto.ts                        # Canonical DTO interfaces and ResourceType enum
│   └── utils/
│       └── retry.ts                      # Exponential backoff retry utility
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 3. Step-by-Step Build Guide

### Phase 1: Project Scaffolding

1. **Initialize project**: `npm init`, install dependencies.
2. **Configure TypeScript**: `tsconfig.json` with strict mode, ES2022 target, path aliases.
3. **Install core dependencies**:
   - `express` — HTTP framework
   - `zod` — Request validation
   - `dotenv` — Environment variable loading
4. **Install dev dependencies**:
   - `typescript`, `@types/express`, `@types/node`
   - `tsx` — Development runtime (replaces ts-node)
   - `eslint`, `prettier` — Code quality
5. **Set up scripts**: `dev` (tsx watch), `build` (tsc), `start` (node dist).
6. **Create `.env.example`** with all required environment variables.
7. **Create `src/index.ts`**: Express app with JSON parsing, CORS, route mounting, error handler.

### Phase 2: Core Infrastructure

8. **Environment config** (`src/config/env.ts`): Load and validate env vars with Zod. Export typed config object.
9. **Retry utility** (`src/utils/retry.ts`): Exponential backoff with configurable attempts, delays, and retry conditions.
10. **Rate limiter** (`src/providers/rate-limiter.ts`): Token bucket algorithm with per-provider configuration.
11. **Provider types** (`src/providers/types.ts`): Define `ProviderName`, `ResourceConfig`, `RateLimitConfig`, `OAuthConfig`, `TokenResponse`.
12. **Canonical DTOs** (`src/types/dto.ts`): Define all 14 resource type interfaces and the `ResourceType` enum.

### Phase 3: Provider Clients

Build each provider client following the same pattern. **Recommended order: Fortnox first** (most complete, best documented), then Visma, Briox, Bokio, Björn Lunden.

For each provider:

13. **Create `client.ts`**: HTTP client class that:
    - Accepts an access token per request (not stored).
    - Uses the rate limiter before each API call.
    - Wraps calls in the retry utility.
    - Implements `get()`, `getPage()`, and (where applicable) `getAll()` methods.
    - Handles provider-specific pagination patterns.
    - Handles provider-specific authentication headers.

14. **Create `mapper.ts`**: Pure functions that transform raw provider API responses into canonical DTOs. One mapper function per resource type per provider. Include the `_raw` field with the original provider data for debugging.

15. **Create `config.ts`**: Resource configuration map — for each supported `ResourceType`, define:
    - List endpoint path
    - Detail endpoint path (with `{id}` placeholder)
    - ID field name in provider response
    - Reference to the mapper function
    - Provider-specific flags (pagination, filtering, entry hydration, etc.)

16. **Create `oauth.ts`**: Provider-specific OAuth helper functions:
    - `buildAuthUrl()` — Generate provider authorization URL (Fortnox, Visma only)
    - `exchangeCode()` — Exchange authorization code for tokens
    - `refreshToken()` — Refresh an expired access token
    - `revokeToken()` — Revoke a token (Fortnox, Visma only)

### Phase 4: Provider Registry

17. **Create `src/providers/registry.ts`**: Central registry that maps provider names to their client instances and resource configs. This is the lookup layer used by route handlers.

### Phase 5: API Routes

18. **Create resource routes** (`src/routes/resources.ts`):
    - `GET /:provider/:resourceType` — List resources (paginated)
    - `GET /:provider/:resourceType/:id` — Get single resource by ID
    - Extract provider name, access token, and provider-specific params from request.
    - Look up provider client and config from registry.
    - Call provider client, run mapper, return canonical response.

19. **Create OAuth helper routes** (`src/routes/oauth.ts`):
    - `GET /oauth/:provider/url` — Get authorization URL
    - `POST /oauth/:provider/exchange` — Exchange code for tokens
    - `POST /oauth/:provider/refresh` — Refresh access token
    - `POST /oauth/:provider/revoke` — Revoke token

### Phase 6: Middleware

20. **Create auth middleware** (`src/middleware/auth.ts`): Validate `Authorization: Bearer <api-key>` against list of valid API keys from environment variables.

21. **Create error handler** (`src/middleware/error-handler.ts`): Global Express error handler that catches all errors and returns standardized JSON error responses.

22. **Create validation middleware** (`src/middleware/validate.ts`): Zod-based request validation for route params, query strings, and request bodies.

### Phase 7: Integration & Polish

23. **Wire everything together in `src/index.ts`**: Mount middleware, routes, error handler.
24. **Add health check endpoint**: `GET /health` returning `{ status: 'ok' }`.
25. **Add request logging**: Log incoming requests with provider, resource type, and response time.
26. **Test each provider** manually with real tokens against real provider APIs.

---

## 4. Core Infrastructure

### 4.1 Retry Utility

A generic retry wrapper with exponential backoff.

**Interface:**
- `maxAttempts` — Maximum number of attempts (default: 3)
- `initialDelayMs` — First retry delay in ms (default: 1000)
- `maxDelayMs` — Cap on retry delay (default: 30000)
- `backoffMultiplier` — Multiplier per attempt (default: 2)
- `shouldRetry(error, attempt)` — Custom function to decide if an error is retryable
- `getDelayMs(error, attempt)` — Custom function to override delay (e.g., to respect `Retry-After` headers)

**Behavior:**
- Delay formula: `min(initialDelayMs * backoffMultiplier^(attempt-1), maxDelayMs)`
- All providers treat HTTP 401, 403, 404 as **non-retryable** (break immediately).
- All providers treat HTTP 429 and 5xx as **retryable**.
- Fortnox specifically respects the `Retry-After` header on 429 responses.

**Per-provider retry config:**

| Provider | Max Attempts | Initial Delay | Max Delay | Special |
|----------|-------------|---------------|-----------|---------|
| Fortnox | 6 | 2000ms | 60000ms | Respects `Retry-After` header |
| Visma | 3 | 1000ms | 30000ms | — |
| Briox | 3 | 1000ms | 30000ms | — |
| Bokio | 3 | 1000ms | 30000ms | — |
| Björn Lunden | 3 | 1000ms | 30000ms | — |

### 4.2 Rate Limiter

A token-bucket rate limiter, instantiated once per provider.

**Algorithm:**
- Bucket starts full with `maxTokens` = `maxRequests`.
- Each API call consumes one token via `acquire()`.
- Tokens refill at rate: `windowMs / maxRequests` ms per token.
- If no tokens available, `acquire()` blocks (awaits) until a token is refilled.

**Per-provider rate limits:**

| Provider | Max Requests | Window (ms) | Effective Rate |
|----------|-------------|-------------|----------------|
| Fortnox | 4 | 1000 | 4 req/sec |
| Visma | 10 | 1000 | 10 req/sec |
| Briox | 10 | 1000 | 10 req/sec |
| Bokio | 5 | 1000 | 5 req/sec |
| Björn Lunden | 10 | 1000 | 10 req/sec |

### 4.3 Provider Registry

A central lookup that maps `ProviderName` → `{ client, resourceConfigs, oauthHelpers }`.

This allows route handlers to be provider-agnostic: given a provider name string, they can look up the correct client and config without giant `if/else` chains.

**Structure:**
```
registry[providerName] = {
  client: ProviderClient instance,
  configs: Record<ResourceType, ProviderResourceConfig>,
  oauth: { buildAuthUrl?, exchangeCode, refreshToken, revokeToken? }
}
```

---

## 5. Canonical Data Types (DTOs)

All providers are mapped to these same canonical types. The `ResourceType` enum defines the valid resource identifiers used in API URLs.

### 5.1 ResourceType Enum

| Value | URL slug | Description |
|-------|----------|-------------|
| `SalesInvoices` | `salesinvoices` | Outgoing invoices issued by the company |
| `SupplierInvoices` | `supplierinvoices` | Incoming invoices from suppliers |
| `Customers` | `customers` | Customer master data |
| `Suppliers` | `suppliers` | Supplier master data |
| `Journals` | `journals` | Accounting journal entries / vouchers |
| `AccountingAccounts` | `accountingaccounts` | Chart of accounts |
| `CompanyInformation` | `companyinformation` | Company metadata (singleton) |
| `AccountingPeriods` | `accountingperiods` | Fiscal periods (future) |
| `FinancialDimensions` | `financialdimensions` | Cost centers, projects (future) |
| `BalanceSheet` | `balancesheet` | Balance sheet report (future) |
| `IncomeStatement` | `incomestatement` | Income statement report (future) |
| `TrialBalances` | `trialbalances` | Trial balance report (future) |
| `Payments` | `payments` | Payment records (future) |
| `Attachments` | `attachments` | Document attachments (future) |

**Note:** The 7 resources currently implemented across providers are: SalesInvoices, SupplierInvoices, Customers, Suppliers, Journals, AccountingAccounts, CompanyInformation. The rest are defined in the type system for future expansion.

### 5.2 Common Types

**AmountType**
- `value: number` — The monetary amount
- `currencyCode: string` — ISO 4217 currency code (typically "SEK")

**PostalAddress**
- `streetName?: string`
- `additionalStreetName?: string`
- `buildingNumber?: string`
- `cityName?: string`
- `postalZone?: string`
- `countrySubentity?: string`
- `countryCode?: string`

**Contact**
- `name?: string`
- `telephone?: string`
- `email?: string`
- `website?: string`

**PartyIdentification**
- `id: string` — Identifier value (e.g., organization number)
- `schemeId?: string` — Scheme (e.g., `"SE:ORGNR"`)

**PartyLegalEntity**
- `registrationName: string`
- `companyId?: string`
- `companyIdSchemeId?: string`

**PartyDto** — Represents a business entity (customer, supplier, buyer, seller)
- `name: string`
- `identifications: PartyIdentification[]`
- `postalAddress?: PostalAddress`
- `legalEntity?: PartyLegalEntity`
- `contact?: Contact`

**FinancialDimensionRef** — Reference to a cost center, project, etc.
- `dimensionId: string`
- `dimensionValueId: string`
- `name?: string`

**AllowanceChargeDto** — Discount or surcharge on an invoice
- `chargeIndicator: boolean` — `true` = charge, `false` = allowance
- `reason?: string`
- `amount: AmountType`
- `taxPercent?: number`

**TaxTotalDto / TaxSubtotalDto** — Tax breakdown
- `taxAmount: AmountType`
- `taxSubtotals?: TaxSubtotalDto[]`
  - `taxableAmount: AmountType`
  - `taxAmount: AmountType`
  - `taxCategory?: string`
  - `percent?: number`

**LegalMonetaryTotalDto** — Invoice total breakdown
- `lineExtensionAmount: AmountType` — Sum of line amounts before tax
- `taxExclusiveAmount?: AmountType`
- `taxInclusiveAmount?: AmountType`
- `allowanceTotalAmount?: AmountType`
- `chargeTotalAmount?: AmountType`
- `payableRoundingAmount?: AmountType`
- `payableAmount: AmountType` — Final amount to pay

**PaymentStatusDto**
- `paid: boolean`
- `balance: AmountType` — Remaining amount
- `lastPaymentDate?: string`

**PaginatedResponse\<T\>** — Standard paginated list response
- `data: T[]`
- `page: number`
- `pageSize: number`
- `totalCount: number`
- `totalPages: number`
- `hasMore: boolean`

### 5.3 Resource DTOs

#### SalesInvoiceDto
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Provider ID |
| `invoiceNumber` | `string` | Invoice number |
| `issueDate` | `string` | ISO date |
| `dueDate` | `string?` | ISO date |
| `deliveryDate` | `string?` | ISO date |
| `invoiceTypeCode` | `string?` | Invoice type |
| `currencyCode` | `string` | ISO 4217 |
| `status` | `InvoiceStatusCode` | `draft \| sent \| booked \| paid \| overdue \| cancelled \| credited` |
| `supplier` | `PartyDto` | The company issuing the invoice |
| `customer` | `PartyDto` | The recipient of the invoice |
| `lines` | `SalesInvoiceLineDto[]` | Line items |
| `allowanceCharges` | `AllowanceChargeDto[]?` | Discounts/surcharges |
| `taxTotal` | `TaxTotalDto?` | Tax breakdown |
| `legalMonetaryTotal` | `LegalMonetaryTotalDto` | Total amounts |
| `paymentStatus` | `PaymentStatusDto` | Payment info |
| `paymentTerms` | `string?` | Payment terms text |
| `note` | `string?` | Free text note |
| `buyerReference` | `string?` | Buyer's reference |
| `orderReference` | `string?` | Order reference |
| `financialDimensions` | `FinancialDimensionRef[]?` | Cost centers, projects |

**SalesInvoiceLineDto:**
- `id`, `description`, `quantity`, `unitCode`, `unitPrice` (AmountType)
- `lineExtensionAmount` (AmountType), `taxPercent`, `taxAmount` (AmountType)
- `accountNumber`, `itemName`, `articleNumber`, `financialDimensions`

#### SupplierInvoiceDto
Same structure as SalesInvoiceDto but with:
- `supplier: PartyDto` — The vendor
- `buyer: PartyDto` — The company receiving the invoice
- `ocrNumber?: string` — Swedish OCR payment reference
- Lines: `SupplierInvoiceLineDto[]` (same fields as SalesInvoiceLineDto)

**Note:** Bokio does NOT support supplier invoices or suppliers. Return HTTP 400 with a clear message when these resources are requested for Bokio.

#### CustomerDto
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Provider ID |
| `customerNumber` | `string` | Customer reference number |
| `type` | `CustomerType?` | `company \| private` |
| `party` | `PartyDto` | Name, address, contact, identifications |
| `deliveryAddresses` | `PostalAddress[]?` | Shipping addresses |
| `financialDimensions` | `FinancialDimensionRef[]?` | Dimensions |
| `active` | `boolean` | Whether the customer is active |
| `vatNumber` | `string?` | VAT registration number |
| `defaultPaymentTermsDays` | `number?` | Default payment terms |
| `note` | `string?` | Free text note |

#### SupplierDto
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Provider ID |
| `supplierNumber` | `string` | Supplier reference number |
| `party` | `PartyDto` | Name, address, contact, identifications |
| `deliveryAddresses` | `PostalAddress[]?` | Delivery addresses |
| `financialDimensions` | `FinancialDimensionRef[]?` | Dimensions |
| `active` | `boolean` | Whether the supplier is active |
| `vatNumber` | `string?` | VAT registration number |
| `bankAccount` | `string?` | Bank account / IBAN |
| `bankGiro` | `string?` | Swedish Bankgiro number |
| `plusGiro` | `string?` | Swedish PlusGiro number |
| `defaultPaymentTermsDays` | `number?` | Default payment terms |
| `note` | `string?` | Free text note |

**Note:** Bokio does NOT support suppliers.

#### JournalDto
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Provider ID |
| `journalNumber` | `string` | Journal/voucher number |
| `series` | `AccountingSeriesDto?` | `{ id, description }` — voucher series |
| `description` | `string?` | Journal description |
| `registrationDate` | `string` | ISO date |
| `fiscalYear` | `number?` | Fiscal year |
| `entries` | `AccountingEntryDto[]` | Line entries (debit/credit) |
| `totalDebit` | `AmountType?` | Sum of debits |
| `totalCredit` | `AmountType?` | Sum of credits |

**AccountingEntryDto:**
- `accountNumber: string`, `accountName?: string`
- `debit: number`, `credit: number` — One will be 0
- `transactionDate?: string`, `description?: string`
- `financialDimensions?: FinancialDimensionRef[]`

**Important:** Fortnox and Briox journals require "entry hydration" — the list endpoint returns journal headers without entries. A separate detail fetch per journal is needed to get the `entries` array. This should be opt-in via an `includeEntries` query param (default `true`) since it generates N+1 API calls. Briox hydration should be batched (5 concurrent) to respect rate limits.

#### AccountingAccountDto
| Field | Type | Description |
|-------|------|-------------|
| `accountNumber` | `string` | Account number (BAS plan) |
| `name` | `string` | Account name |
| `description` | `string?` | Account description |
| `type` | `AccountType?` | `asset \| liability \| equity \| revenue \| expense \| other` |
| `vatCode` | `string?` | VAT code |
| `active` | `boolean` | Whether the account is active |
| `balanceBroughtForward` | `number?` | Opening balance |
| `balanceCarriedForward` | `number?` | Closing balance |
| `sruCode` | `string?` | Swedish SRU tax reporting code |

**Account Type Derivation:** All providers derive account type from the Swedish BAS account plan number ranges — this is NOT taken from provider API fields:
- 1000–1999 → `asset`
- 2000–2999 → `liability`
- 3000–3999 → `revenue`
- 4000–8999 → `expense`
- Everything else → `other`

#### CompanyInformationDto (Singleton)
| Field | Type | Description |
|-------|------|-------------|
| `companyName` | `string` | Company legal name |
| `organizationNumber` | `string?` | Swedish org number |
| `legalEntity` | `PartyLegalEntity?` | Legal entity info |
| `address` | `PostalAddress?` | Primary address |
| `contact` | `Contact?` | Phone, email, website |
| `vatNumber` | `string?` | VAT number |
| `fiscalYearStart` | `string?` | Fiscal year start date |
| `baseCurrency` | `string?` | Default currency |

**Note:** This is a singleton resource — no pagination, no list. Returns a single object.

---

## 6. Provider Implementations

### 6.1 Fortnox

**Base URL:** `https://api.fortnox.se/3`

**Authentication Header:** `Authorization: Bearer <accessToken>`

**Rate Limit:** 4 req/sec (1000ms window)

**Retry Config:** 6 attempts, 2000ms initial delay, 60000ms max delay, respects `Retry-After` header on 429.

**OAuth Flow:** Standard Authorization Code Grant
- Auth URL: `https://apps.fortnox.se/oauth-v1/auth`
- Token URL: `https://apps.fortnox.se/oauth-v1/token`
- Uses HTTP Basic auth (`clientId:clientSecret` base64-encoded) for token requests
- Default scopes: `companyinformation`, `invoice`, `supplierinvoice`, `customer`, `supplier`, `bookkeeping`
- Supports token refresh and revocation

**Pagination:** Page-based
- Query params: `page`, `limit`
- Response: `{ "MetaInformation": { "@TotalPages", "@CurrentPage", "@TotalResources" }, "<ListKey>": [...] }`
- Each resource has a specific `listKey` (e.g., `"Invoices"`, `"Customers"`)

**Modified Filtering:** `lastmodified=YYYY-MM-DD` query parameter (supported on most resources)

**Resource Endpoints:**

| Resource | List Endpoint | List Key | Detail Endpoint | Detail Key | ID Field | Filtering |
|----------|--------------|----------|-----------------|------------|----------|-----------|
| SalesInvoices | `/invoices` | `Invoices` | `/invoices/{id}` | `Invoice` | `DocumentNumber` | lastModified |
| SupplierInvoices | `/supplierinvoices` | `SupplierInvoices` | `/supplierinvoices/{id}` | `SupplierInvoice` | `GivenNumber` | lastModified |
| Customers | `/customers` | `Customers` | `/customers/{id}` | `Customer` | `CustomerNumber` | lastModified |
| Suppliers | `/suppliers` | `Suppliers` | `/suppliers/{id}` | `Supplier` | `SupplierNumber` | lastModified |
| Journals | `/vouchers` | `Vouchers` | `/vouchers/{series}/{number}` | `Voucher` | `VoucherNumber` | — |
| AccountingAccounts | `/accounts` | `Accounts` | `/accounts/{id}` | `Account` | `Number` | — |
| CompanyInformation | `/companyinformation` | `CompanyInformation` | `/companyinformation` | `CompanyInformation` | `OrganizationNumber` | — |

**Mapper Quirks:**
- **Invoice status derivation order:** Check `Cancelled` → `Credit` → `FullyPaid` or `Balance === 0` → `Booked` → `Sent` → default: `draft`
- **Voucher composite IDs:** Journals use `{series}-{number}` format. Detail path requires: `/vouchers/{series}/{number}?financialyear={year}`
- **Entry hydration:** Voucher list endpoint returns headers only. Must fetch `/vouchers/{series}/{number}` per voucher to get `VoucherRows`. This is opt-in via `includeEntries` query param.
- **Supplier party in sales invoices:** Company's own info (CompanyName, OrganisationNumber) is used as the supplier party.

### 6.2 Visma

**Base URL:** `https://eaccountingapi.vismaonline.com/v2`

**Authentication Header:** `Authorization: Bearer <accessToken>`

**Rate Limit:** 10 req/sec

**Retry Config:** 3 attempts, 1000ms initial delay, standard backoff.

**OAuth Flow:** Authorization Code Grant
- Auth URL: `https://identity.vismaonline.com/connect/authorize`
- Token URL: `https://identity.vismaonline.com/connect/token`
- Revoke URL: `https://identity.vismaonline.com/connect/revocation`
- Uses HTTP Basic auth for token requests
- Special `acr_values`: `service:44643EB1-3F76-4C1C-A672-402AE8085934` (Visma eAccounting service ID) — **must be included in auth URL**
- Default scopes: `ea:api`, `offline_access`, `ea:sales_readonly`, `ea:accounting_readonly`, `ea:purchase_readonly`
- Supports token refresh and revocation

**Pagination:** OData-style
- Query params: `$skip`, `$top`
- Response: `{ "Data": [...], "Meta": { "TotalNumberOfPages", "TotalNumberOfResults" } }`
- Skip is calculated as: `(page - 1) * pageSize`

**Modified Filtering:** OData filter syntax: `$filter=<modifiedField> gt '<ISO datetime>'`

**Resource Endpoints:**

| Resource | List Endpoint | Detail Endpoint | ID Field | Modified Field | Filtering |
|----------|--------------|-----------------|----------|----------------|-----------|
| SalesInvoices | `/customerinvoices` | `/customerinvoices/{id}` | `Id` | `ModifiedUtc` | Yes |
| SupplierInvoices | `/supplierinvoices` | `/supplierinvoices/{id}` | `Id` | `ModifiedUtc` | Yes |
| Customers | `/customers` | `/customers/{id}` | `Id` | `ChangedUtc` | Yes |
| Suppliers | `/suppliers` | `/suppliers/{id}` | `Id` | `ModifiedUtc` | Yes |
| Journals | `/vouchers` | `/vouchers/{id}` | `Id` | — | No |
| AccountingAccounts | `/accounts` | `/accounts/{id}` | `Number` | — | No |
| CompanyInformation | `/companysettings` | `/companysettings` | `CorporateIdentityNumber` | — | Singleton |

**Mapper Quirks:**
- **Status derivation:** `IsCancelled` → `RemainingAmount === 0 && TotalAmount > 0` (paid) → `IsBooked` → `IsSent` or `SendType != null` → default: `draft`
- **Supplier invoice rows:** Use `DebetAmount` and `CreditAmount` fields (double-entry style)
- **Account balances enrichment:** After fetching accounts, make a separate call to `/accountbalances/{today}` to get balance data. Merge `Balance` values by `AccountNumber` into the account DTOs as `balanceCarriedForward`. This is a best-effort enrichment (failure is non-fatal).

### 6.3 Briox

**Base URL:** `https://api-se.briox.services/v2`

**Authentication Header:** `Authorization: <accessToken>` (NO "Bearer" prefix — just the raw token)

**Rate Limit:** 10 req/sec

**Retry Config:** 3 attempts, 1000ms initial delay, standard backoff.

**OAuth Flow:** Custom (non-standard)
- Token URL: `https://api-se.briox.services/v2/token`
- Refresh URL: `https://api-se.briox.services/v2/tokenrefresh`
- **No standard authorization URL** — Briox uses "application tokens"
- Token exchange: POST to token URL with `clientid` and `token` as query parameters
- Response: `{ "data": { "access_token", "refresh_token", "expire_timestamp", "expire_date" } }`
- Convert `expire_timestamp` (epoch seconds) to `expires_in`: `expire_timestamp - Math.floor(Date.now() / 1000)`
- Refresh: POST to refresh URL with `refreshtoken` and `token` as query parameters
- **No token revocation**

**Pagination:** Page-based
- Query params: `page`, `limit`
- Response: `{ "data": { "<listKey>": [...], "metainformation": { "total_pages", "current_page", "total_count" } } }`
- Each resource has a specific `listKey`

**Modified Filtering:** `frommodifieddate=YYYY-MM-DD` query parameter

**Resource Endpoints:**

| Resource | List Endpoint | List Key | Detail Endpoint | ID Field | Year-Scoped | Entry Hydration |
|----------|--------------|----------|-----------------|----------|-------------|-----------------|
| SalesInvoices | `/customerinvoice` | `invoices` | `/customerinvoice/{id}` | `id` | No | No |
| SupplierInvoices | `/supplierinvoice` | `supplierinvoices` | `/supplierinvoice/{id}` | `id` | No | No |
| Customers | `/customer` | `customers` | `/customer/{id}` | `id` | No | No |
| Suppliers | `/supplier` | `suppliers` | `/supplier/{id}` | `id` | No | No |
| Journals | `/journal` | `journals` | `/journal/{id}` | `id` | Yes | Yes (detail key: `journal`) |
| AccountingAccounts | `/account` | `accounts` | `/account/{id}` | `id` | No | No |
| CompanyInformation | `/user/info` | (empty) | `/user/info` | `id` | No | Singleton |

**Mapper Quirks:**
- **Uses snake_case** throughout: `invoice_date`, `customer_name`, `customer_org_number`
- **Status derivation:** Checks string `status` field: `cancelled`, `credited`, `paid`, `booked`, `sent`, `overdue` → default: `draft`. Also checks boolean fields: `fully_paid`, `booked`, `sent`.
- **Company info structure:** Response is `{ info: { company_name, accounts: [{ database_label, organization_number, address: { addressline1, zip, ... } }] } }`. Extract first account's data.
- **Year-scoped journals:** The journal list endpoint requires a financial year ID. The client should have a `getCurrentFinancialYear(accessToken)` method that calls a Briox endpoint to get the active year.
- **Journal entry hydration:** List returns headers only. Fetch `/journal/{year}/{series}/{id}` per journal to get `journal_rows`. Batch hydration at 5 concurrent requests.
- **Flexible field names:** Mappers must handle both `journal_rows` and `journalrows`, `transactiondate` and `transaction_date`.
- **Account active field:** Returns as string `'1'`/`'0'` — check for false, `'0'`, and `0`.

### 6.4 Bokio

**Base URL:** `https://api.bokio.se/v1`

**Authentication Header:** `Authorization: Bearer <accessToken>`

**Rate Limit:** 5 req/sec

**Retry Config:** 3 attempts, 1000ms initial delay, standard backoff.

**Token Management:** Static/private API tokens — NOT OAuth
- Bokio uses static API tokens that never expire.
- No authorization URL, no code exchange, no refresh, no revocation.
- The consumer provides the static API token directly.
- Consumer must also provide a `companyId` — all Bokio endpoints require it in the path.

**Pagination:** Page-based (on paginated endpoints)
- Query params: `page`, `pageSize`
- Response: `{ "items": [...], "totalItems", "totalPages", "currentPage" }`
- **All endpoints require `companyId` in path:** `/companies/{companyId}{relativePath}`

**Resource Endpoints:**

| Resource | List Endpoint | ID Field | Paginated | Supported |
|----------|--------------|----------|-----------|-----------|
| SalesInvoices | `/invoices` | `id` | Yes | Yes |
| SupplierInvoices | — | — | — | **NO** |
| Customers | `/customers` | `id` | Yes | Yes |
| Suppliers | — | — | — | **NO** |
| Journals | `/journal-entries` | `id` | Yes | Yes |
| AccountingAccounts | `/chart-of-accounts` | `number` | No (returns all) | Yes |
| CompanyInformation | (uses company metadata) | `id` | Singleton | Yes |

**Client Methods:**
- `getPage(token, companyId, path, { page, pageSize, query? })` — Paginated endpoints
- `getAll(token, companyId, path)` — Non-paginated endpoints (chart of accounts). Returns raw array or `{ items: [...] }`
- `getDetail(token, companyId, path)` — Single resource
- `getCompany(token, companyId)` — Fetch company metadata (returns null on 404)

**Mapper Quirks:**
- **Invoice status:** Maps status to uppercase then checks: `draft`, `published` → `sent`, `paid`, `overdue`, `cancelled`
- **Line items:** Compute line total = `unitPrice * quantity` if both present
- **Customer type:** `type === 'individual'` → `private`, otherwise `company`
- **Company info:** No dedicated endpoint — uses company metadata. Expects `line1`, `line2`, `city`, `postalCode`, `country` address structure.
- **Account balance:** Uses `accountBalance` field for carried-forward balance
- **Account balance enrichment (opt-in):** Optionally fetch detail per account (`/chart-of-accounts/{number}`) to get balance. Enabled via `includeBalances=true` query param. Batched at 5 concurrent.

### 6.5 Björn Lunden

**Base URL:** `https://apigateway.blinfo.se/bla-api/v1/sp`

**Authentication Headers (TWO required):**
- `Authorization: Bearer <accessToken>`
- `User-Key: <userKey>` — Company-specific key, must be passed by consumer

**Rate Limit:** 10 req/sec

**Retry Config:** 3 attempts, 1000ms initial delay, standard backoff.

**Token Management:** Client Credentials Grant (server-to-server)
- Token URL: `https://apigateway.blinfo.se/auth/oauth/v2/token`
- Flow: `grant_type=client_credentials` with `client_id` and `client_secret` in request body
- No user interaction — fully automated
- Tokens expire — consumer must track `expires_in` and refresh before expiry
- Refresh = request a new token via client credentials (same flow as initial token)
- **No revocation**

**Pagination:** Page-based (on paginated endpoints)
- Query params: `pageRequested`, `rowsRequested` (some endpoints use `rows` instead)
- Response: `{ "pageRequested", "totalPages", "totalRows", "data": [...] }`

**Resource Endpoints:**

| Resource | List Endpoint | ID Field | Paginated | Notes |
|----------|--------------|----------|-----------|-------|
| SalesInvoices | `/customerinvoice/batch` | `invoiceNumber` | Yes | No line items in list |
| SupplierInvoices | `/supplierinvoice/batch` | `entityId` | Yes | No line items in list |
| Customers | `/customer` | `id` | No | Address nested |
| Suppliers | `/supplier` | `id` | No | Address nested |
| Journals | `/journal/entry/batch` | `entityId` | Yes | Single amount field |
| AccountingAccounts | `/account` | `id` | No | VAT & SRU codes |
| CompanyInformation | `/details` | — | Singleton | Nested settings |

**Client Methods:**
- `getPage(token, userKey, path, { page, pageSize })` — Paginated
- `getAll(token, userKey, path)` — Non-paginated, returns array or `{ data: [...] }`
- `getDetail(token, userKey, path)` — Single resource

**Mapper Quirks:**
- **Status derivation:** `paid === true` → paid; `preliminary === true` → draft; checks string `status` for cancelled/credited/sent (case-insensitive); default: `booked`
- **Invoice amounts:** Uses `amountInLocalCurrency` and `amountPaidInLocalCurrency`. Balance = total - paid, or `amountRemainingInLocalCurrency`.
- **No line items in batch:** Batch list endpoints return invoices WITHOUT line items (empty array). To get lines, fetch detail per invoice.
- **Journal entries:** Uses single `amount` field instead of separate debit/credit. Positive = debit, negative = credit. Mapper must convert.
- **Company info:** Nested under `preferredSettings.currency`. Address uses `street`, `box`, `zip`, `city`, `country`.
- **Account balance:** Computed as `debit - credit` from opening balance fields.
- **Supplier field names:** Uses `organisationId` (not `organisationNumber`), `address1`/`address2`, `zipCode`, `bg` (bankgiro), `pg` (plusgiro), `iban`, `vatNr`.

---

## 7. API Endpoints

### 7.1 Resource Endpoints

#### List Resources
```
GET /v1/:provider/:resourceType
```

**Headers:**
- `Authorization: Bearer <api-key>` — Your API key (for authenticating with this API)
- `X-Provider-Token: <access-token>` — Provider access token (for authenticating with the ERP provider)
- `X-Company-Id: <id>` — Required for Bokio (company ID) and Björn Lunden (user key)

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `pageSize` | number | 100 | Items per page |
| `lastModified` | string | — | ISO date. Filter by last modified date (Fortnox: `lastmodified`, Briox: `frommodifieddate`) |
| `modifiedSince` | string | — | ISO datetime. For Visma OData filter |
| `includeEntries` | boolean | true | Whether to hydrate journal entries (Fortnox, Briox journals). Set to `false` to skip N+1 detail fetches. |
| `financialYear` | string | — | Fiscal year ID (required for Briox journals, optional for Fortnox vouchers) |
| `includeBalances` | boolean | false | Fetch balance per account (Bokio accounts only). Causes N+1 API calls. |
| `query` | string | — | Search query (Bokio only) |

**Success Response (200):**
```json
{
  "data": [ ...canonical DTOs... ],
  "page": 1,
  "pageSize": 100,
  "totalCount": 250,
  "totalPages": 3,
  "hasMore": true
}
```

**Singleton Resources** (CompanyInformation):
```json
{
  "data": { ...CompanyInformationDto... }
}
```

#### Get Single Resource
```
GET /v1/:provider/:resourceType/:id
```

**Headers:** Same as list endpoint.

**Success Response (200):**
```json
{
  "data": { ...canonical DTO... }
}
```

**Notes:**
- For Fortnox vouchers, the `id` is in `{series}-{number}` format. The route handler must parse this and construct the correct detail path: `/vouchers/{series}/{number}?financialyear={year}`.
- For Bokio, `X-Company-Id` is required (used in the URL path).
- For Björn Lunden, `X-Company-Id` carries the `userKey` (used in the `User-Key` header).

### 7.2 OAuth Helper Endpoints

These endpoints help consumers manage the OAuth lifecycle. The API does NOT store tokens — it just facilitates the OAuth flows and returns tokens to the consumer.

#### Get Authorization URL
```
GET /v1/oauth/:provider/url
```

**Query Parameters:**
- `scopes` — Comma-separated list of scopes (optional, uses provider defaults)
- `state` — OAuth state parameter (optional, for CSRF protection)

**Response:**
```json
{
  "url": "https://apps.fortnox.se/oauth-v1/auth?client_id=...&scope=...&state=..."
}
```

**Supported Providers:** Fortnox, Visma only. Briox/Bokio/Björn Lunden return descriptive error messages explaining their different auth models.

#### Exchange Authorization Code
```
POST /v1/oauth/:provider/exchange
```

**Headers:**
- `Authorization: Bearer <api-key>`

**Body:**
```json
{
  "code": "<authorization-code>"
}
```

**Response:**
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Supported Providers:** Fortnox, Visma, Briox. Bokio (static tokens) and Björn Lunden (client credentials) use different flows.

#### Refresh Token
```
POST /v1/oauth/:provider/refresh
```

**Headers:**
- `Authorization: Bearer <api-key>`

**Body:**
```json
{
  "refresh_token": "<refresh-token>"
}
```

**Response:**
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Supported Providers:**
- **Fortnox, Visma:** Standard refresh_token grant
- **Briox:** Custom refresh via `/tokenrefresh` endpoint with `refreshtoken` + `token` query params
- **Björn Lunden:** Client credentials re-grant (no refresh token needed — body should just be empty or include `client_id`/`client_secret`)
- **Bokio:** Returns error — tokens don't expire

#### Revoke Token
```
POST /v1/oauth/:provider/revoke
```

**Headers:**
- `Authorization: Bearer <api-key>`

**Body:**
```json
{
  "token": "<refresh-token>"
}
```

**Response:**
```json
{
  "success": true
}
```

**Supported Providers:** Fortnox, Visma only. Others return descriptive error messages.

### 7.3 Utility Endpoints

#### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 12345
}
```

---

## 8. Authentication

### API Key Authentication

Consumer authentication uses a simple API key model. Valid API keys are defined in environment variables.

**Mechanism:**
1. Consumer sends `Authorization: Bearer <api-key>` header.
2. Middleware extracts the key and compares against the list of valid keys (SHA-256 hashed comparison for security).
3. If valid, request proceeds. If invalid or missing, return 401.

**Environment Configuration:**
- `API_KEYS` — Comma-separated list of valid API keys, e.g. `key1,key2,key3`
- Keys are hashed at startup and compared by hash to avoid timing attacks.

**Middleware behavior:**
- Returns `401 Unauthorized` with `{ "error": "Invalid or missing API key" }` on failure.
- Attaches nothing to `req` (no tenant concept) — just validates the key.

### Provider Token Passing

Provider tokens are passed per-request via custom headers:
- `X-Provider-Token: <access-token>` — The provider's access token
- `X-Company-Id: <id>` — Provider-specific company identifier (required for Bokio and Björn Lunden)

The middleware should validate that `X-Provider-Token` is present for resource endpoints (not needed for OAuth helper endpoints).

---

## 9. Error Handling

### Error Response Format

All errors return a consistent JSON structure:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "provider": "fortnox",
  "statusCode": 400
}
```

### Error Categories

| Code | HTTP Status | Description |
|------|------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `MISSING_PROVIDER_TOKEN` | 401 | No `X-Provider-Token` header |
| `INVALID_PROVIDER` | 400 | Unknown provider name |
| `UNSUPPORTED_RESOURCE` | 400 | Resource type not supported by this provider |
| `MISSING_COMPANY_ID` | 400 | `X-Company-Id` required but not provided (Bokio, Björn Lunden) |
| `PROVIDER_AUTH_ERROR` | 401 | Provider returned 401 (token expired or invalid) |
| `PROVIDER_FORBIDDEN` | 403 | Provider returned 403 (insufficient scopes) |
| `PROVIDER_NOT_FOUND` | 404 | Provider returned 404 (resource not found) |
| `PROVIDER_RATE_LIMITED` | 429 | Provider rate limit exceeded (after retries exhausted) |
| `PROVIDER_ERROR` | 502 | Provider returned 5xx (after retries exhausted) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Provider Error Propagation

When a provider API returns an error:
1. If 401 → return `PROVIDER_AUTH_ERROR` to consumer (they need to refresh their token).
2. If 403 → return `PROVIDER_FORBIDDEN` (insufficient OAuth scopes).
3. If 404 → return `PROVIDER_NOT_FOUND`.
4. If 429 → retry with backoff. If all retries exhausted → return `PROVIDER_RATE_LIMITED`.
5. If 5xx → retry with backoff. If all retries exhausted → return `PROVIDER_ERROR`.

---

## 10. Environment Configuration

### `.env.example`

```bash
# ============================================
# API Configuration
# ============================================
PORT=3000
NODE_ENV=development

# Comma-separated list of valid API keys for consumers
API_KEYS=your-api-key-1,your-api-key-2

# ============================================
# Fortnox OAuth
# ============================================
FORTNOX_CLIENT_ID=
FORTNOX_CLIENT_SECRET=
FORTNOX_REDIRECT_URI=

# ============================================
# Visma OAuth
# ============================================
VISMA_CLIENT_ID=
VISMA_CLIENT_SECRET=
VISMA_REDIRECT_URI=

# ============================================
# Briox
# ============================================
BRIOX_CLIENT_ID=

# ============================================
# Björn Lunden (Client Credentials)
# ============================================
BJORN_LUNDEN_CLIENT_ID=
BJORN_LUNDEN_CLIENT_SECRET=
```

### Validation

Use Zod to validate environment variables at startup. The application should fail to start if required variables are missing. Provider-specific variables should be validated lazily (only when that provider is used) — not all providers need to be configured.

**Required at startup:**
- `PORT` (default: 3000)
- `API_KEYS` (at least one key)

**Required per provider (validated on first use):**
- Fortnox: `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET`, `FORTNOX_REDIRECT_URI`
- Visma: `VISMA_CLIENT_ID`, `VISMA_CLIENT_SECRET`, `VISMA_REDIRECT_URI`
- Briox: `BRIOX_CLIENT_ID`
- Bokio: (none — uses static tokens from consumer)
- Björn Lunden: `BJORN_LUNDEN_CLIENT_ID`, `BJORN_LUNDEN_CLIENT_SECRET`

---

## 11. Provider Reference Tables

### Resource Support Matrix

| Resource | Fortnox | Visma | Briox | Bokio | Björn Lunden |
|----------|---------|-------|-------|-------|--------------|
| SalesInvoices | Yes | Yes | Yes | Yes | Yes |
| SupplierInvoices | Yes | Yes | Yes | **No** | Yes |
| Customers | Yes | Yes | Yes | Yes | Yes |
| Suppliers | Yes | Yes | Yes | **No** | Yes |
| Journals | Yes | Yes | Yes | Yes | Yes |
| AccountingAccounts | Yes | Yes | Yes | Yes | Yes |
| CompanyInformation | Yes | Yes | Yes | Yes | Yes |

### Authentication Methods

| Provider | Auth Type | Auth Header | Extra Headers | Token Expiry |
|----------|-----------|-------------|---------------|-------------|
| Fortnox | OAuth 2.0 (Auth Code) | `Bearer <token>` | None | Yes (refresh token) |
| Visma | OAuth 2.0 (Auth Code) | `Bearer <token>` | None | Yes (refresh token) |
| Briox | Custom Token Exchange | `<token>` (no Bearer) | None | Yes (refresh token) |
| Bokio | Static API Token | `Bearer <token>` | None | Never expires |
| Björn Lunden | Client Credentials | `Bearer <token>` | `User-Key: <userKey>` | Yes (re-grant) |

### Pagination Strategies

| Provider | Style | Page Param | Size Param | Response Structure |
|----------|-------|-----------|------------|-------------------|
| Fortnox | Page-based | `page` | `limit` | `{ MetaInformation: { @TotalPages, @CurrentPage }, <ListKey>: [...] }` |
| Visma | OData skip/top | `$skip` | `$top` | `{ Data: [...], Meta: { TotalNumberOfPages, TotalNumberOfResults } }` |
| Briox | Page-based | `page` | `limit` | `{ data: { <listKey>: [...], metainformation: { total_pages, current_page, total_count } } }` |
| Bokio | Page-based | `page` | `pageSize` | `{ items: [...], totalItems, totalPages, currentPage }` |
| Björn Lunden | Page-based | `pageRequested` | `rowsRequested` | `{ pageRequested, totalPages, totalRows, data: [...] }` |

### Rate Limits

| Provider | Requests/Second | Notes |
|----------|----------------|-------|
| Fortnox | 4 | Strictest. Respects `Retry-After` header. |
| Visma | 10 | — |
| Briox | 10 | Batch journal hydration at 5 concurrent. |
| Bokio | 5 | All paths include `/companies/{companyId}`. |
| Björn Lunden | 10 | Requires `User-Key` header on all calls. |

### Provider-Specific Query Parameters

| Provider | Parameter | Resource | Description |
|----------|-----------|----------|-------------|
| Fortnox | `lastModified` | Invoices, Customers, Suppliers | YYYY-MM-DD filter |
| Fortnox | `financialyear` | Journals | Fiscal year filter |
| Visma | `modifiedSince` | Invoices, Customers, Suppliers | ISO datetime OData filter |
| Briox | `lastModified` | Invoices, Customers, Suppliers | YYYY-MM-DD filter |
| Briox | `fiscalYear` | Journals | Financial year ID (required) |
| Bokio | `query` | Customers, Invoices | Search query |
| Bokio | `includeBalances` | AccountingAccounts | Fetch balance per account (N+1) |

---

## Summary

This plan describes a **stateless, provider-agnostic REST API** that unifies access to 5 Swedish ERP systems. The core components are:

1. **Express server** with API key auth and standardized error handling
2. **5 provider clients** with rate limiting and retry logic
3. **5 sets of mappers** transforming provider data to canonical DTOs
4. **Resource routes** for listing and fetching unified accounting data
5. **OAuth helper routes** for managing provider token lifecycles

The consumer manages all state (tokens, provider selection, company IDs). The API is a pure translation and proxy layer.
