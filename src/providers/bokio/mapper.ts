import type {
  SalesInvoiceDto,
  SalesInvoiceLineDto,
  CustomerDto,
  CustomerType,
  JournalDto,
  AccountingEntryDto,
  AccountingAccountDto,
  CompanyInformationDto,
  InvoiceStatusCode,
} from '../../types/dto.js';
import { deriveAccountType } from '../../types/dto.js';

const DEFAULT_CURRENCY = 'SEK';

// ---------------------------------------------------------------------------
// Invoice status mapping
// ---------------------------------------------------------------------------

function mapInvoiceStatus(raw: string | undefined): InvoiceStatusCode {
  if (!raw) return 'draft';
  const lower = raw.toLowerCase();
  if (lower === 'draft') return 'draft';
  if (lower === 'published') return 'sent';
  if (lower === 'paid') return 'paid';
  if (lower === 'overdue') return 'overdue';
  if (lower === 'cancelled') return 'cancelled';
  // Fallback — treat unknown statuses as draft
  return 'draft';
}

// ---------------------------------------------------------------------------
// Sales Invoice
// ---------------------------------------------------------------------------

function mapInvoiceLine(raw: any, currency: string): SalesInvoiceLineDto {
  const quantity = raw.quantity ?? undefined;
  const unitPrice = raw.unitPrice ?? undefined;
  const lineTotal =
    quantity != null && unitPrice != null ? unitPrice * quantity : undefined;

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    description: raw.description ?? undefined,
    quantity,
    unitCode: raw.unitType ?? undefined,
    unitPrice:
      unitPrice != null ? { value: unitPrice, currencyCode: currency } : undefined,
    lineExtensionAmount:
      lineTotal != null ? { value: lineTotal, currencyCode: currency } : undefined,
    taxPercent: raw.taxRate ?? undefined,
    accountNumber: raw.bookkeepingAccountNumber != null
      ? String(raw.bookkeepingAccountNumber)
      : undefined,
    itemName: raw.description ?? undefined,
  };
}

export function mapSalesInvoice(raw: any): SalesInvoiceDto {
  const currency = raw.currency ?? DEFAULT_CURRENCY;
  const status = mapInvoiceStatus(raw.status);
  const totalAmount = raw.totalAmount ?? 0;
  const totalTax = raw.totalTax ?? 0;
  const paidAmount = raw.paidAmount ?? 0;
  const balance = totalAmount - paidAmount;

  const lines: SalesInvoiceLineDto[] = Array.isArray(raw.lineItems)
    ? raw.lineItems.map((li: any) => mapInvoiceLine(li, currency))
    : [];

  return {
    id: String(raw.id),
    invoiceNumber: raw.invoiceNumber != null ? String(raw.invoiceNumber) : String(raw.id),
    issueDate: raw.invoiceDate ?? '',
    dueDate: raw.dueDate ?? undefined,
    currencyCode: currency,
    status,
    supplier: {
      name: '',
      identifications: [],
    },
    customer: {
      name: raw.customerRef?.name ?? '',
      identifications: raw.customerRef?.id
        ? [{ id: String(raw.customerRef.id) }]
        : [],
    },
    lines,
    legalMonetaryTotal: {
      lineExtensionAmount: {
        value: totalAmount - totalTax,
        currencyCode: currency,
      },
      payableAmount: {
        value: totalAmount,
        currencyCode: currency,
      },
    },
    taxTotal: {
      taxAmount: { value: totalTax, currencyCode: currency },
    },
    paymentStatus: {
      paid: status === 'paid',
      balance: { value: balance, currencyCode: currency },
    },
    note: raw.note ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

function mapCustomerType(raw: string | undefined): CustomerType | undefined {
  if (!raw) return undefined;
  return raw.toLowerCase() === 'individual' ? 'private' : 'company';
}

export function mapCustomer(raw: any): CustomerDto {
  const address = raw.address ?? {};

  return {
    id: String(raw.id),
    customerNumber: raw.customerNumber != null ? String(raw.customerNumber) : String(raw.id),
    type: mapCustomerType(raw.type),
    party: {
      name: raw.name ?? '',
      identifications: raw.orgNumber ? [{ id: raw.orgNumber }] : [],
      postalAddress: {
        streetName: address.line1 ?? undefined,
        additionalStreetName: address.line2 ?? undefined,
        cityName: address.city ?? undefined,
        postalZone: address.postalCode ?? undefined,
        countryCode: address.country ?? undefined,
      },
      contact: {
        email: raw.email ?? raw.contactsDetails?.[0]?.email ?? undefined,
        telephone: raw.phone ?? raw.contactsDetails?.[0]?.phone ?? undefined,
      },
    },
    active: raw.active !== false,
    vatNumber: raw.vatNumber ?? undefined,
    defaultPaymentTermsDays: raw.paymentTerms != null ? Number(raw.paymentTerms) : undefined,
    note: raw.note ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

function mapJournalEntry(raw: any): AccountingEntryDto {
  return {
    accountNumber: raw.account != null ? String(raw.account) : '',
    debit: raw.debit ?? 0,
    credit: raw.credit ?? 0,
    description: raw.description ?? undefined,
  };
}

export function mapJournal(raw: any): JournalDto {
  const entries: AccountingEntryDto[] = Array.isArray(raw.items)
    ? raw.items.map(mapJournalEntry)
    : [];

  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

  return {
    id: String(raw.id),
    journalNumber: raw.journalEntryNumber ?? String(raw.id),
    description: raw.title ?? undefined,
    registrationDate: raw.date ?? '',
    entries,
    totalDebit: { value: totalDebit, currencyCode: DEFAULT_CURRENCY },
    totalCredit: { value: totalCredit, currencyCode: DEFAULT_CURRENCY },
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Accounting Account (Chart of Accounts)
// ---------------------------------------------------------------------------

export function mapAccount(raw: any): AccountingAccountDto {
  const accountNumber = raw.number != null ? String(raw.number) : String(raw.accountNumber ?? '');

  return {
    accountNumber,
    name: raw.name ?? '',
    description: raw.description ?? undefined,
    type: deriveAccountType(accountNumber),
    vatCode: raw.vatCode != null ? String(raw.vatCode) : undefined,
    active: raw.active !== false,
    balanceCarriedForward: raw.accountBalance ?? undefined,
    sruCode: raw.sruCode != null ? String(raw.sruCode) : undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Company Information
// ---------------------------------------------------------------------------

export function mapCompanyInformation(raw: any): CompanyInformationDto {
  const address = raw.address ?? {};

  return {
    companyName: raw.name ?? raw.companyName ?? '',
    organizationNumber: raw.orgNumber ?? raw.organizationNumber ?? undefined,
    legalEntity: raw.orgNumber
      ? {
          registrationName: raw.name ?? raw.companyName ?? '',
          companyId: raw.orgNumber,
        }
      : undefined,
    address: {
      streetName: address.line1 ?? undefined,
      additionalStreetName: address.line2 ?? undefined,
      cityName: address.city ?? undefined,
      postalZone: address.postalCode ?? undefined,
      countryCode: address.country ?? undefined,
    },
    contact: {
      email: raw.email ?? undefined,
      telephone: raw.phone ?? undefined,
      website: raw.website ?? undefined,
    },
    vatNumber: raw.vatNumber ?? undefined,
    baseCurrency: raw.currency ?? DEFAULT_CURRENCY,
    _raw: raw,
  };
}
