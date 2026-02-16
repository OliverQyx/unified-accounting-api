import type {
  SalesInvoiceDto,
  SupplierInvoiceDto,
  CustomerDto,
  SupplierDto,
  JournalDto,
  AccountingAccountDto,
  CompanyInformationDto,
  InvoiceStatusCode,
} from '../../types/dto.js';
import { deriveAccountType } from '../../types/dto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CURRENCY = 'SEK';

function str(val: unknown): string {
  if (val == null) return '';
  return String(val);
}

function num(val: unknown): number {
  if (val == null) return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

function dateStr(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  // Strip time portion if present (e.g. "2021-06-10T00:00:00")
  return s.slice(0, 10);
}

/**
 * Derive a canonical invoice status from Bjorn Lunden's boolean/string fields.
 *
 * Priority:
 *   1. paid === true -> 'paid'
 *   2. preliminary === true -> 'draft'
 *   3. Check `status` array or string for known keywords (cancelled, credited, sent)
 *   4. Default -> 'booked'
 */
function deriveInvoiceStatus(raw: any): InvoiceStatusCode {
  if (raw.paid === true) return 'paid';
  if (raw.preliminary === true) return 'draft';

  // `status` may be an array of numeric codes or a string
  const statusField = raw.status;
  if (statusField != null) {
    const statusText = Array.isArray(statusField)
      ? statusField.join(' ')
      : String(statusField);

    const lower = statusText.toLowerCase();
    if (lower.includes('cancel') || lower.includes('delet')) return 'cancelled';
    if (lower.includes('credit') || lower.includes('customerloss')) return 'credited';
    if (lower.includes('sent') || lower.includes('e-invoice')) return 'sent';
    if (lower.includes('overdue')) return 'overdue';

    // Numeric status codes for customer invoices
    if (Array.isArray(statusField)) {
      if (statusField.includes(5) || statusField.includes(43)) return 'cancelled';
      if (statusField.includes(6)) return 'credited';
      if (statusField.includes(1)) return 'overdue';
    }
  }

  return 'booked';
}

// ---------------------------------------------------------------------------
// Sales Invoice (Customer Invoice)
// ---------------------------------------------------------------------------

export function mapSalesInvoice(raw: any): SalesInvoiceDto {
  const totalAmount = num(raw.amountInLocalCurrency ?? raw.amount);
  const paidAmount = num(raw.amountPaidInLocalCurrency);
  const balance = raw.amountRemainingInLocalCurrency != null
    ? num(raw.amountRemainingInLocalCurrency)
    : totalAmount - paidAmount;
  const currency = raw.currency || DEFAULT_CURRENCY;

  return {
    id: str(raw.entityId ?? raw.invoiceNumber),
    invoiceNumber: str(raw.invoiceNumber),
    issueDate: dateStr(raw.invoiceDate),
    dueDate: dateStr(raw.dueDate) || undefined,
    deliveryDate: undefined,
    invoiceTypeCode: raw.type ?? undefined,
    currencyCode: currency,
    status: deriveInvoiceStatus(raw),
    supplier: {
      name: '',
      identifications: [],
    },
    customer: {
      name: raw.customerName ?? '',
      identifications: raw.customerId
        ? [{ id: str(raw.customerId), schemeId: 'BL_CUSTOMER_ID' }]
        : [],
    },
    lines: [],
    legalMonetaryTotal: {
      lineExtensionAmount: { value: totalAmount, currencyCode: currency },
      payableAmount: { value: totalAmount, currencyCode: currency },
    },
    paymentStatus: {
      paid: raw.paid === true,
      balance: { value: balance, currencyCode: currency },
      lastPaymentDate: dateStr(raw.dateOfLatestPayment) || undefined,
    },
    note: raw.comment ?? undefined,
    orderReference: raw.orderNumber ? str(raw.orderNumber) : undefined,
    buyerReference: raw.ocrRef ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Supplier Invoice
// ---------------------------------------------------------------------------

export function mapSupplierInvoice(raw: any): SupplierInvoiceDto {
  const totalAmount = num(raw.amountInLocalCurrency ?? raw.amount);
  const paidAmount = num(raw.amountPaidInLocalCurrency);
  const balance = raw.amountRemainingInLocalCurrency != null
    ? num(raw.amountRemainingInLocalCurrency)
    : totalAmount - paidAmount;
  const currency = raw.currency || DEFAULT_CURRENCY;

  return {
    id: str(raw.entityId),
    invoiceNumber: str(raw.invoiceNumber ?? raw.consecutiveNumber),
    issueDate: dateStr(raw.invoiceDate),
    dueDate: dateStr(raw.dueDate) || undefined,
    deliveryDate: undefined,
    invoiceTypeCode: undefined,
    currencyCode: currency,
    status: deriveInvoiceStatus(raw),
    supplier: {
      name: raw.supplierName ?? '',
      identifications: raw.supplierId
        ? [{ id: str(raw.supplierId), schemeId: 'BL_SUPPLIER_ID' }]
        : [],
    },
    buyer: {
      name: '',
      identifications: [],
    },
    lines: [],
    legalMonetaryTotal: {
      lineExtensionAmount: { value: totalAmount, currencyCode: currency },
      payableAmount: { value: totalAmount, currencyCode: currency },
    },
    paymentStatus: {
      paid: raw.paid === true,
      balance: { value: balance, currencyCode: currency },
      lastPaymentDate: dateStr(raw.dateOfLatestPayment) || undefined,
    },
    note: raw.comment ?? undefined,
    ocrNumber: raw.ocr ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export function mapCustomer(raw: any): CustomerDto {
  return {
    id: str(raw.id ?? raw.entityId),
    customerNumber: str(raw.id),
    type: raw.organisationNumber ? 'company' : 'private',
    party: {
      name: raw.name ?? '',
      identifications: [
        { id: str(raw.id), schemeId: 'BL_CUSTOMER_ID' },
        ...(raw.organisationNumber
          ? [{ id: str(raw.organisationNumber), schemeId: 'SE:ORGNR' }]
          : []),
      ],
      postalAddress: {
        streetName: raw.street ?? undefined,
        additionalStreetName: raw.box ?? undefined,
        postalZone: raw.zip ?? undefined,
        cityName: raw.city ?? undefined,
        countryCode: raw.countryCode ?? undefined,
      },
      legalEntity: raw.organisationNumber
        ? {
            registrationName: raw.name ?? '',
            companyId: raw.organisationNumber,
            companyIdSchemeId: 'SE:ORGNR',
          }
        : undefined,
      contact: {
        email: raw.email ?? undefined,
        telephone: raw.phone ?? raw.mobile ?? undefined,
        website: raw.web ?? undefined,
      },
    },
    active: raw.closed !== true,
    vatNumber: raw.vatNumber ?? raw.companyId ?? undefined,
    defaultPaymentTermsDays: raw.paymentTerms ? parseInt(raw.paymentTerms, 10) || undefined : undefined,
    note: raw.comment ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export function mapSupplier(raw: any): SupplierDto {
  return {
    id: str(raw.id ?? raw.entityId),
    supplierNumber: str(raw.id),
    party: {
      name: raw.name ?? '',
      identifications: [
        { id: str(raw.id), schemeId: 'BL_SUPPLIER_ID' },
        ...(raw.organisationId
          ? [{ id: str(raw.organisationId), schemeId: 'SE:ORGNR' }]
          : []),
      ],
      postalAddress: {
        streetName: raw.address1 ?? undefined,
        additionalStreetName: raw.address2 ?? undefined,
        postalZone: raw.zipCode ?? undefined,
        cityName: raw.city ?? undefined,
        countryCode: raw.countryCode ?? undefined,
      },
      legalEntity: raw.organisationId
        ? {
            registrationName: raw.name ?? '',
            companyId: raw.organisationId,
            companyIdSchemeId: 'SE:ORGNR',
          }
        : undefined,
      contact: {
        email: raw.email ?? undefined,
        telephone: raw.phone ?? undefined,
        website: raw.web ?? undefined,
      },
    },
    active: raw.closed !== true,
    vatNumber: raw.vatNr ?? undefined,
    bankAccount: raw.bankAccount ?? undefined,
    bankGiro: raw.bg ?? undefined,
    plusGiro: raw.pg ?? undefined,
    defaultPaymentTermsDays: raw.paymentTerms ? parseInt(raw.paymentTerms, 10) || undefined : undefined,
    note: raw.comment ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export function mapJournal(raw: any): JournalDto {
  const entries = (raw.ledgerEntries ?? []).map((le: any) => {
    const amount = num(le.amount);
    return {
      accountNumber: str(le.accountId),
      accountName: le.accountName ?? undefined,
      debit: amount >= 0 ? amount : 0,
      credit: amount < 0 ? Math.abs(amount) : 0,
      transactionDate: dateStr(le.date) || undefined,
      description: le.text ?? undefined,
      financialDimensions: [
        ...(le.costCenterId ? [{ dimensionId: 'CostCenter', dimensionValueId: str(le.costCenterId) }] : []),
        ...(le.costBearerId ? [{ dimensionId: 'CostBearer', dimensionValueId: str(le.costBearerId) }] : []),
        ...(le.projectId ? [{ dimensionId: 'Project', dimensionValueId: str(le.projectId) }] : []),
      ],
    };
  });

  const totalDebit = entries.reduce((sum: number, e: any) => sum + e.debit, 0);
  const totalCredit = entries.reduce((sum: number, e: any) => sum + e.credit, 0);

  return {
    id: str(raw.entityId),
    journalNumber: str(raw.journalEntryId ?? raw.entityId),
    series: raw.journalId
      ? { id: str(raw.journalId), description: raw.journalName ?? undefined }
      : undefined,
    description: raw.journalEntryText ?? undefined,
    registrationDate: dateStr(raw.journalEntryDate ?? raw.entryInfoDate),
    fiscalYear: raw.financialYearId
      ? parseInt(str(raw.financialYearId).slice(0, 4), 10) || undefined
      : undefined,
    entries,
    totalDebit: { value: totalDebit, currencyCode: DEFAULT_CURRENCY },
    totalCredit: { value: totalCredit, currencyCode: DEFAULT_CURRENCY },
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Accounting Account
// ---------------------------------------------------------------------------

export function mapAccount(raw: any): AccountingAccountDto {
  const debitBalance = num(raw.debit);
  const creditBalance = num(raw.credit);
  const balance = debitBalance - creditBalance;

  return {
    accountNumber: str(raw.id),
    name: raw.name ?? '',
    description: raw.comment ?? undefined,
    type: deriveAccountType(str(raw.id)),
    vatCode: raw.vatCode != null ? str(raw.vatCode) : undefined,
    active: raw.closed !== true,
    balanceBroughtForward: balance,
    sruCode: raw.sruCode ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Company Information
// ---------------------------------------------------------------------------

export function mapCompanyInformation(raw: any): CompanyInformationDto {
  const currency = raw.preferredSettings?.currency ?? DEFAULT_CURRENCY;

  return {
    companyName: raw.name ?? '',
    organizationNumber: raw.orgNumber ?? undefined,
    legalEntity: raw.orgNumber
      ? {
          registrationName: raw.name ?? '',
          companyId: raw.orgNumber,
          companyIdSchemeId: 'SE:ORGNR',
        }
      : undefined,
    address: {
      streetName: raw.street ?? undefined,
      additionalStreetName: raw.box ?? undefined,
      postalZone: raw.zip ?? undefined,
      cityName: raw.city ?? undefined,
      countryCode: raw.country ?? undefined,
    },
    contact: {
      email: raw.email ?? undefined,
      telephone: raw.phone ?? raw.mobile ?? undefined,
      website: raw.web ?? undefined,
    },
    vatNumber: raw.vatNumber ?? undefined,
    baseCurrency: currency,
    _raw: raw,
  };
}
