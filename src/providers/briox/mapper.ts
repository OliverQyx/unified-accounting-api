import type {
  SalesInvoiceDto,
  SalesInvoiceLineDto,
  SupplierInvoiceDto,
  SupplierInvoiceLineDto,
  CustomerDto,
  SupplierDto,
  JournalDto,
  AccountingEntryDto,
  AccountingAccountDto,
  CompanyInformationDto,
  InvoiceStatusCode,
  PostalAddress,
} from '../../types/dto.js';
import { deriveAccountType } from '../../types/dto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function str(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function deriveSalesInvoiceStatus(raw: any): InvoiceStatusCode {
  const status = str(raw.status).toLowerCase();
  if (status === 'cancelled') return 'cancelled';
  if (status === 'credited') return 'credited';
  if (status === 'paid') return 'paid';
  if (status === 'booked') return 'booked';
  if (status === 'sent') return 'sent';
  if (status === 'overdue') return 'overdue';

  // Boolean field checks
  if (raw.full_paid === true || raw.full_paid === 'true' || raw.fully_paid === true || raw.fully_paid === 'true') return 'paid';
  if (raw.booked === true || raw.booked === 'true' || raw.post === true || raw.post === 'true') return 'booked';
  if (raw.sent === true || raw.sent === 'true') return 'sent';

  return 'draft';
}

function deriveSupplierInvoiceStatus(raw: any): InvoiceStatusCode {
  const status = str(raw.status ?? raw.paymentstatus).toLowerCase();
  if (status === 'cancelled' || status === 'voided') return 'cancelled';
  if (status === 'credited') return 'credited';
  if (status === 'paid') return 'paid';
  if (status === 'booked') return 'booked';
  if (status === 'sent') return 'sent';
  if (status === 'overdue') return 'overdue';

  // Boolean field checks
  if (raw.fully_paid === true || raw.fully_paid === 'true') return 'paid';
  if (raw.booked === true || raw.booked === 'true' || raw.post === true || raw.post === 'true') return 'booked';
  if (raw.sent === true || raw.sent === 'true') return 'sent';

  return 'draft';
}

function parseAddress(raw: any): PostalAddress | undefined {
  if (!raw) return undefined;

  // raw may be an array (Briox address array) or a single object
  const addr = Array.isArray(raw) ? raw[0] : raw;
  if (!addr) return undefined;

  return {
    streetName: addr.addressline1 || addr.address || undefined,
    additionalStreetName: addr.addressline2 || undefined,
    cityName: addr.city || undefined,
    postalZone: addr.zip || undefined,
    countryCode: addr.countrycode || addr.country_code || undefined,
  };
}

function isActive(value: unknown): boolean {
  if (value === false || value === '0' || value === 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Sales Invoice
// ---------------------------------------------------------------------------

export function mapSalesInvoice(raw: any): SalesInvoiceDto {
  const currency = raw.currency || 'SEK';
  const total = num(raw.total);
  const totalExclVat = num(raw.total_excl_vat);
  const saldo = num(raw.saldo);
  const vatAmount = total - totalExclVat;
  const isPaid = saldo === 0 && total > 0;

  const lines: SalesInvoiceLineDto[] = (raw.invoice_rows ?? []).map((row: any) => ({
    id: str(row.itemno || ''),
    description: row.description || undefined,
    quantity: num(row.amount),
    unitCode: row.unit || undefined,
    unitPrice: { value: num(row.price), currencyCode: currency },
    lineExtensionAmount: { value: num(row.rowtotal), currencyCode: currency },
    taxPercent: num(row.vatrate) || undefined,
    accountNumber: row.account || undefined,
    articleNumber: row.itemno || undefined,
  }));

  return {
    id: str(raw.id),
    invoiceNumber: str(raw.id),
    issueDate: raw.invoicedate ?? raw.invoice_date ?? '',
    dueDate: raw.duedate ?? raw.paymentdate ?? raw.payment_date ?? undefined,
    deliveryDate: raw.deliverydate ?? raw.delivery_date ?? undefined,
    currencyCode: currency,
    status: isPaid ? 'paid' : deriveSalesInvoiceStatus(raw),
    supplier: {
      name: '',
      identifications: [],
    },
    customer: {
      name: raw.customer_name ?? '',
      identifications: [
        { id: str(raw.customerid ?? raw.customer_id ?? ''), schemeId: 'briox_customer_id' },
      ],
      legalEntity: raw.customer_org_number
        ? { registrationName: raw.customer_name ?? '', companyId: raw.customer_org_number }
        : undefined,
    },
    lines,
    taxTotal: vatAmount
      ? {
          taxAmount: { value: vatAmount, currencyCode: currency },
        }
      : undefined,
    legalMonetaryTotal: {
      lineExtensionAmount: { value: totalExclVat, currencyCode: currency },
      taxExclusiveAmount: { value: totalExclVat, currencyCode: currency },
      taxInclusiveAmount: { value: total, currencyCode: currency },
      payableAmount: { value: total, currencyCode: currency },
    },
    paymentStatus: {
      paid: isPaid || deriveSalesInvoiceStatus(raw) === 'paid',
      balance: { value: saldo, currencyCode: currency },
    },
    paymentTerms: raw.paymentterm ?? raw.payment_term ?? undefined,
    note: raw.notes ?? raw.invoicetext ?? undefined,
    buyerReference: raw.yourreference ?? raw.your_reference ?? undefined,
    orderReference: raw.orderno ? str(raw.orderno) : undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Supplier Invoice
// ---------------------------------------------------------------------------

export function mapSupplierInvoice(raw: any): SupplierInvoiceDto {
  const currency = raw.currency || 'SEK';
  const total = num(raw.total);
  const vatAmount = num(raw.vat);
  const totalExclVat = total - vatAmount;

  const lines: SupplierInvoiceLineDto[] = (raw.supplier_invoice_rows ?? []).map((row: any) => ({
    id: row.account || undefined,
    description: row.description ?? row.transactioninformation ?? undefined,
    accountNumber: row.account || undefined,
    lineExtensionAmount: row.debit
      ? { value: num(row.debit), currencyCode: currency }
      : row.credit
        ? { value: num(row.credit), currencyCode: currency }
        : undefined,
  }));

  const status = deriveSupplierInvoiceStatus(raw);

  return {
    id: str(raw.id),
    invoiceNumber: str(raw.invoicenumber ?? raw.invoice_number ?? raw.id),
    issueDate: raw.invoicedate ?? raw.invoice_date ?? '',
    dueDate: raw.paymentdate ?? raw.payment_date ?? undefined,
    currencyCode: currency,
    status,
    supplier: {
      name: raw.suppliername ?? raw.supplier_name ?? '',
      identifications: [
        { id: str(raw.supplierid ?? raw.supplier_id ?? ''), schemeId: 'briox_supplier_id' },
      ],
    },
    buyer: {
      name: '',
      identifications: [],
    },
    lines,
    taxTotal: vatAmount
      ? {
          taxAmount: { value: vatAmount, currencyCode: currency },
          taxSubtotals: raw.vatrate
            ? [
                {
                  taxableAmount: { value: totalExclVat, currencyCode: currency },
                  taxAmount: { value: vatAmount, currencyCode: currency },
                  percent: num(raw.vatrate),
                },
              ]
            : undefined,
        }
      : undefined,
    legalMonetaryTotal: {
      lineExtensionAmount: { value: totalExclVat, currencyCode: currency },
      taxExclusiveAmount: { value: totalExclVat, currencyCode: currency },
      taxInclusiveAmount: { value: total, currencyCode: currency },
      payableAmount: { value: total, currencyCode: currency },
    },
    paymentStatus: {
      paid: status === 'paid',
      balance: { value: total, currencyCode: currency },
      lastPaymentDate: raw.paidat ?? raw.paid_at ?? undefined,
    },
    ocrNumber: raw.referencenumber ? str(raw.referencenumber) : undefined,
    buyerReference: raw.ourreference ?? raw.our_reference ?? undefined,
    note: raw.description ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export function mapCustomer(raw: any): CustomerDto {
  const invoiceAddr = Array.isArray(raw.address)
    ? raw.address.find((a: any) => a.type === 'invoice') ?? raw.address[0]
    : raw.address;

  const deliveryAddr = Array.isArray(raw.address)
    ? raw.address.find((a: any) => a.type === 'delivery')
    : undefined;

  return {
    id: str(raw.custno ?? raw.id ?? ''),
    customerNumber: str(raw.custno ?? raw.customer_number ?? ''),
    type: raw.customerbusinesstype === '1' || raw.customerbusinesstype === 1 || raw.customerbusinesstype === true
      ? 'company'
      : 'private',
    party: {
      name: raw.name ?? '',
      identifications: [
        { id: str(raw.custno ?? ''), schemeId: 'briox_customer_number' },
      ],
      postalAddress: parseAddress(invoiceAddr),
      legalEntity: raw.companynumber
        ? { registrationName: raw.name ?? '', companyId: raw.companynumber }
        : { registrationName: raw.name ?? '' },
      contact: {
        telephone: raw.phone || undefined,
        email: raw.email || undefined,
      },
    },
    deliveryAddresses: deliveryAddr ? [parseAddress(deliveryAddr)!].filter(Boolean) : undefined,
    active: isActive(raw.active),
    vatNumber: raw.vatnumber || undefined,
    defaultPaymentTermsDays: raw.paymentterms ? num(raw.paymentterms) || undefined : undefined,
    note: raw.description || undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export function mapSupplier(raw: any): SupplierDto {
  return {
    id: str(raw.supplierno ?? raw.id ?? ''),
    supplierNumber: str(raw.supplierno ?? raw.supplier_number ?? ''),
    party: {
      name: raw.name ?? '',
      identifications: [
        { id: str(raw.supplierno ?? ''), schemeId: 'briox_supplier_number' },
      ],
      postalAddress: {
        streetName: raw.addressline1 || undefined,
        additionalStreetName: raw.addressline2 || undefined,
        cityName: raw.city || undefined,
        postalZone: raw.zip || undefined,
        countryCode: raw.countrycode || undefined,
      },
      legalEntity: raw.companynumber
        ? { registrationName: raw.name ?? '', companyId: raw.companynumber }
        : { registrationName: raw.name ?? '' },
      contact: {
        telephone: raw.phone || undefined,
        email: raw.email || undefined,
      },
    },
    active: isActive(raw.active),
    vatNumber: raw.vatnumber || undefined,
    defaultPaymentTermsDays: raw.paymentterms ? num(raw.paymentterms) || undefined : undefined,
    note: raw.description || undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export function mapJournal(raw: any): JournalDto {
  // Handle both "journalrows" and "journal_rows"
  const rows: any[] = raw.journalrows ?? raw.journal_rows ?? [];

  const entries: AccountingEntryDto[] = rows.map((row: any) => ({
    accountNumber: str(row.account ?? ''),
    debit: num(row.debit),
    credit: num(row.credit),
    transactionDate: raw.transactiondate ?? raw.transaction_date ?? undefined,
    description: row.transactioninfo ?? row.description ?? undefined,
  }));

  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

  return {
    id: str(raw.id ?? ''),
    journalNumber: str(raw.id ?? ''),
    series: raw.series
      ? { id: str(raw.series), description: raw.series }
      : undefined,
    description: raw.descr ?? raw.description ?? undefined,
    registrationDate: raw.transactiondate ?? raw.transaction_date ?? '',
    fiscalYear: raw.year ? num(raw.year) : undefined,
    entries,
    totalDebit: { value: totalDebit, currencyCode: 'SEK' },
    totalCredit: { value: totalCredit, currencyCode: 'SEK' },
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Accounting Account
// ---------------------------------------------------------------------------

export function mapAccount(raw: any): AccountingAccountDto {
  return {
    accountNumber: str(raw.id ?? ''),
    name: raw.description ?? '',
    type: deriveAccountType(str(raw.id ?? '')),
    vatCode: raw.vat_code || undefined,
    active: isActive(raw.active),
    balanceBroughtForward: raw.incoming_balance != null ? num(raw.incoming_balance) : undefined,
    sruCode: raw.sru_code || undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Company Information
// ---------------------------------------------------------------------------

export function mapCompanyInformation(raw: any): CompanyInformationDto {
  // Response shape: { info: { company_name, accounts: [{ database_label, organization_number, address, ... }] } }
  const info = raw.info ?? raw;
  const account = info.accounts?.[0];

  const addr = account?.address;
  const parsedAddr = parseAddress(addr);

  return {
    companyName: info.company_name ?? account?.database_label ?? '',
    organizationNumber: account?.organization_number ?? undefined,
    legalEntity: account?.organization_number
      ? {
          registrationName: info.company_name ?? account?.database_label ?? '',
          companyId: account.organization_number,
        }
      : undefined,
    address: parsedAddr,
    contact: {
      telephone: account?.phone ?? info.phone ?? undefined,
      email: account?.email ?? info.email ?? undefined,
      website: account?.website ?? undefined,
    },
    vatNumber: account?.vat_number ?? undefined,
    _raw: raw,
  };
}
