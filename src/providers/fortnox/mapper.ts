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
  PartyDto,
  AmountType,
  LegalMonetaryTotalDto,
  TaxTotalDto,
  PaymentStatusDto,
  PostalAddress,
  Contact,
  FinancialDimensionRef,
  CustomerType,
} from '../../types/dto.js';
import { deriveAccountType } from '../../types/dto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CURRENCY = 'SEK';

function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function amt(value: unknown, currency?: string): AmountType {
  return { value: num(value), currencyCode: currency || DEFAULT_CURRENCY };
}

function buildDimensions(raw: Record<string, unknown>): FinancialDimensionRef[] | undefined {
  const dims: FinancialDimensionRef[] = [];
  if (raw.CostCenter) {
    dims.push({ dimensionId: 'CostCenter', dimensionValueId: str(raw.CostCenter) });
  }
  if (raw.Project) {
    dims.push({ dimensionId: 'Project', dimensionValueId: str(raw.Project) });
  }
  return dims.length > 0 ? dims : undefined;
}

// ---------------------------------------------------------------------------
// Invoice status derivation
// ---------------------------------------------------------------------------

function deriveSalesInvoiceStatus(raw: Record<string, unknown>): InvoiceStatusCode {
  if (raw.Cancelled === true) return 'cancelled';
  if (raw.Credit === 'true' || raw.Credit === true || raw.CreditInvoiceReference) return 'credited';
  if (num(raw.Balance) === 0 && raw.FinalPayDate) return 'paid';
  if (num(raw.Balance) === 0 && raw.Booked === true) return 'paid';
  if (raw.Booked === true) return 'booked';
  if (raw.Sent === true) return 'sent';
  return 'draft';
}

function deriveSupplierInvoiceStatus(raw: Record<string, unknown>): InvoiceStatusCode {
  if (raw.Cancelled === true) return 'cancelled';
  if (raw.Credit === true) return 'credited';
  if (num(raw.Balance) === 0 && raw.FinalPayDate) return 'paid';
  if (num(raw.Balance) === 0 && raw.Booked === true) return 'paid';
  if (raw.Booked === true) return 'booked';
  return 'draft';
}

// ---------------------------------------------------------------------------
// Sales Invoice
// ---------------------------------------------------------------------------

function mapSalesInvoiceLine(row: Record<string, unknown>, currency: string): SalesInvoiceLineDto {
  return {
    id: str(row.RowId || ''),
    description: str(row.Description),
    quantity: num(row.DeliveredQuantity),
    unitCode: str(row.Unit) || undefined,
    unitPrice: amt(row.Price, currency),
    lineExtensionAmount: amt(row.TotalExcludingVAT ?? row.Total, currency),
    taxPercent: num(row.VAT),
    accountNumber: row.AccountNumber ? str(row.AccountNumber) : undefined,
    articleNumber: str(row.ArticleNumber) || undefined,
    itemName: str(row.Description) || undefined,
    financialDimensions: buildDimensions(row as Record<string, unknown>),
  };
}

export function mapSalesInvoice(raw: Record<string, unknown>): SalesInvoiceDto {
  const currency = str(raw.Currency) || DEFAULT_CURRENCY;
  const documentNumber = str(raw.DocumentNumber);

  const customerParty: PartyDto = {
    name: str(raw.CustomerName),
    identifications: [
      { id: str(raw.CustomerNumber), schemeId: 'fortnox:CustomerNumber' },
    ],
    postalAddress: {
      streetName: str(raw.Address1) || undefined,
      additionalStreetName: str(raw.Address2) || undefined,
      cityName: str(raw.City) || undefined,
      postalZone: str(raw.ZipCode) || undefined,
      countryCode: str(raw.Country) || undefined,
    },
  };

  // Supplier party represents the company issuing the invoice (own company info from invoice data)
  const supplierParty: PartyDto = {
    name: str(raw.CompanyName) || '',
    identifications: raw.OrganisationNumber
      ? [{ id: str(raw.OrganisationNumber), schemeId: 'SE:ORGNR' }]
      : [],
    legalEntity: raw.OrganisationNumber
      ? {
          registrationName: str(raw.CompanyName) || '',
          companyId: str(raw.OrganisationNumber),
          companyIdSchemeId: 'SE:ORGNR',
        }
      : undefined,
  };

  const rows = (raw.InvoiceRows as Record<string, unknown>[] | undefined) || [];
  const lines = rows.map((r) => mapSalesInvoiceLine(r, currency));

  const netAmount = num(raw.Net);
  const totalVat = num(raw.TotalVAT);
  const total = num(raw.Total);
  const roundOff = num(raw.RoundOff);

  const taxTotal: TaxTotalDto = {
    taxAmount: amt(totalVat, currency),
  };

  const legalMonetaryTotal: LegalMonetaryTotalDto = {
    lineExtensionAmount: amt(netAmount, currency),
    taxExclusiveAmount: amt(netAmount, currency),
    taxInclusiveAmount: amt(total, currency),
    payableRoundingAmount: roundOff ? amt(roundOff, currency) : undefined,
    payableAmount: amt(total, currency),
  };

  const paymentStatus: PaymentStatusDto = {
    paid: num(raw.Balance) === 0 && raw.FinalPayDate != null,
    balance: amt(raw.Balance, currency),
    lastPaymentDate: str(raw.FinalPayDate) || undefined,
  };

  return {
    id: documentNumber,
    invoiceNumber: documentNumber,
    issueDate: str(raw.InvoiceDate),
    dueDate: str(raw.DueDate) || undefined,
    deliveryDate: str(raw.DeliveryDate) || undefined,
    invoiceTypeCode: str(raw.InvoiceType) || undefined,
    currencyCode: currency,
    status: deriveSalesInvoiceStatus(raw),
    supplier: supplierParty,
    customer: customerParty,
    lines,
    taxTotal,
    legalMonetaryTotal,
    paymentStatus,
    paymentTerms: str(raw.TermsOfPayment) || undefined,
    note: str(raw.Remarks) || str(raw.Comments) || undefined,
    buyerReference: str(raw.YourReference) || undefined,
    orderReference: str(raw.OrderReference) || undefined,
    financialDimensions: buildDimensions(raw),
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Supplier Invoice
// ---------------------------------------------------------------------------

function mapSupplierInvoiceLine(
  row: Record<string, unknown>,
  currency: string,
): SupplierInvoiceLineDto {
  return {
    id: undefined,
    description: str(row.ItemDescription) || str(row.AccountDescription) || undefined,
    quantity: num(row.Quantity) || undefined,
    unitCode: str(row.Unit) || undefined,
    unitPrice: row.Price != null ? amt(row.Price, currency) : undefined,
    lineExtensionAmount: amt(row.Total, currency),
    accountNumber: row.Account ? str(row.Account) : undefined,
    articleNumber: str(row.ArticleNumber) || undefined,
    itemName: str(row.ItemDescription) || undefined,
    financialDimensions: buildDimensions(row as Record<string, unknown>),
  };
}

export function mapSupplierInvoice(raw: Record<string, unknown>): SupplierInvoiceDto {
  const currency = str(raw.Currency) || DEFAULT_CURRENCY;
  const givenNumber = str(raw.GivenNumber);

  const supplierParty: PartyDto = {
    name: str(raw.SupplierName),
    identifications: [
      { id: str(raw.SupplierNumber), schemeId: 'fortnox:SupplierNumber' },
    ],
  };

  // Buyer is the company that received the invoice (own company)
  const buyerParty: PartyDto = {
    name: '',
    identifications: [],
  };

  const rows = (raw.SupplierInvoiceRows as Record<string, unknown>[] | undefined) || [];
  const lines = rows.map((r) => mapSupplierInvoiceLine(r, currency));

  const total = num(raw.Total);
  const totalVat = num(raw.VAT);
  const net = total - totalVat;

  const taxTotal: TaxTotalDto = {
    taxAmount: amt(totalVat, currency),
  };

  const legalMonetaryTotal: LegalMonetaryTotalDto = {
    lineExtensionAmount: amt(net, currency),
    taxExclusiveAmount: amt(net, currency),
    taxInclusiveAmount: amt(total, currency),
    payableRoundingAmount: raw.RoundOffValue ? amt(raw.RoundOffValue, currency) : undefined,
    payableAmount: amt(total, currency),
  };

  const paymentStatus: PaymentStatusDto = {
    paid: num(raw.Balance) === 0 && raw.FinalPayDate != null,
    balance: amt(raw.Balance, currency),
    lastPaymentDate: str(raw.FinalPayDate) || undefined,
  };

  return {
    id: givenNumber,
    invoiceNumber: str(raw.InvoiceNumber) || givenNumber,
    issueDate: str(raw.InvoiceDate),
    dueDate: str(raw.DueDate) || undefined,
    invoiceTypeCode: undefined,
    currencyCode: currency,
    status: deriveSupplierInvoiceStatus(raw),
    supplier: supplierParty,
    buyer: buyerParty,
    lines,
    taxTotal,
    legalMonetaryTotal,
    paymentStatus,
    paymentTerms: undefined,
    note: str(raw.Comments) || undefined,
    ocrNumber: str(raw.OCR) || undefined,
    buyerReference: str(raw.OurReference) || undefined,
    orderReference: undefined,
    financialDimensions: buildDimensions(raw),
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export function mapCustomer(raw: Record<string, unknown>): CustomerDto {
  const address: PostalAddress = {
    streetName: str(raw.Address1) || undefined,
    additionalStreetName: str(raw.Address2) || undefined,
    cityName: str(raw.City) || undefined,
    postalZone: str(raw.ZipCode) || undefined,
    countryCode: str(raw.CountryCode) || undefined,
  };

  const contact: Contact = {
    name: str(raw.Name) || undefined,
    telephone: str(raw.Phone1) || undefined,
    email: str(raw.Email) || undefined,
    website: str(raw.WWW) || undefined,
  };

  const party: PartyDto = {
    name: str(raw.Name),
    identifications: [
      { id: str(raw.CustomerNumber), schemeId: 'fortnox:CustomerNumber' },
    ],
    postalAddress: address,
    legalEntity: raw.OrganisationNumber
      ? {
          registrationName: str(raw.Name),
          companyId: str(raw.OrganisationNumber),
          companyIdSchemeId: 'SE:ORGNR',
        }
      : undefined,
    contact,
  };

  const deliveryAddress: PostalAddress = {
    streetName: str(raw.DeliveryAddress1) || undefined,
    additionalStreetName: str(raw.DeliveryAddress2) || undefined,
    cityName: str(raw.DeliveryCity) || undefined,
    postalZone: str(raw.DeliveryZipCode) || undefined,
    countryCode: str(raw.DeliveryCountryCode) || undefined,
  };

  const hasDeliveryAddress = deliveryAddress.streetName || deliveryAddress.cityName;

  const typeRaw = str(raw.Type).toUpperCase();
  const type: CustomerType | undefined =
    typeRaw === 'PRIVATE' ? 'private' : typeRaw === 'COMPANY' ? 'company' : undefined;

  return {
    id: str(raw.CustomerNumber),
    customerNumber: str(raw.CustomerNumber),
    type,
    party,
    deliveryAddresses: hasDeliveryAddress ? [deliveryAddress] : undefined,
    financialDimensions: buildDimensions(raw),
    active: raw.Active !== false,
    vatNumber: str(raw.VATNumber) || undefined,
    defaultPaymentTermsDays: undefined,
    note: str(raw.Comments) || undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export function mapSupplier(raw: Record<string, unknown>): SupplierDto {
  const address: PostalAddress = {
    streetName: str(raw.Address1) || undefined,
    additionalStreetName: str(raw.Address2) || undefined,
    cityName: str(raw.City) || undefined,
    postalZone: str(raw.ZipCode) || undefined,
    countryCode: str(raw.CountryCode) || undefined,
  };

  const contact: Contact = {
    name: str(raw.Name) || undefined,
    telephone: str(raw.Phone1) || undefined,
    email: str(raw.Email) || undefined,
    website: str(raw.WWW) || undefined,
  };

  const party: PartyDto = {
    name: str(raw.Name),
    identifications: [
      { id: str(raw.SupplierNumber), schemeId: 'fortnox:SupplierNumber' },
    ],
    postalAddress: address,
    legalEntity: raw.OrganisationNumber
      ? {
          registrationName: str(raw.Name),
          companyId: str(raw.OrganisationNumber),
          companyIdSchemeId: 'SE:ORGNR',
        }
      : undefined,
    contact,
  };

  return {
    id: str(raw.SupplierNumber),
    supplierNumber: str(raw.SupplierNumber),
    party,
    financialDimensions: buildDimensions(raw),
    active: raw.Active !== false,
    vatNumber: str(raw.VATNumber) || undefined,
    bankAccount: str(raw.BankAccountNumber) || undefined,
    bankGiro: str(raw.BG) || undefined,
    plusGiro: str(raw.PG) || undefined,
    defaultPaymentTermsDays: undefined,
    note: str(raw.Comments) || undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Journal (Voucher)
// ---------------------------------------------------------------------------

function mapVoucherRow(row: Record<string, unknown>): AccountingEntryDto {
  return {
    accountNumber: str(row.Account),
    accountName: str(row.Description) || undefined,
    debit: num(row.Debit),
    credit: num(row.Credit),
    transactionDate: str(row.TransactionDate) || undefined,
    description: str(row.TransactionInformation) || str(row.Description) || undefined,
    financialDimensions: buildDimensions(row as Record<string, unknown>),
  };
}

export function mapJournal(raw: Record<string, unknown>): JournalDto {
  const voucherSeries = str(raw.VoucherSeries);
  const voucherNumber = str(raw.VoucherNumber);
  const compositeId = `${voucherSeries}-${voucherNumber}`;

  const rows = (raw.VoucherRows as Record<string, unknown>[] | undefined) || [];
  const entries = rows.map(mapVoucherRow);

  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

  return {
    id: compositeId,
    journalNumber: voucherNumber,
    series: voucherSeries
      ? { id: voucherSeries, description: undefined }
      : undefined,
    description: str(raw.Description) || undefined,
    registrationDate: str(raw.TransactionDate),
    fiscalYear: raw.Year ? num(raw.Year) : undefined,
    entries,
    totalDebit: amt(totalDebit, DEFAULT_CURRENCY),
    totalCredit: amt(totalCredit, DEFAULT_CURRENCY),
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Accounting Account
// ---------------------------------------------------------------------------

export function mapAccount(raw: Record<string, unknown>): AccountingAccountDto {
  const accountNumber = str(raw.Number);

  return {
    accountNumber,
    name: str(raw.Description),
    description: str(raw.Description) || undefined,
    type: deriveAccountType(accountNumber),
    vatCode: str(raw.VATCode) || undefined,
    active: raw.Active !== false,
    balanceBroughtForward: raw.BalanceBroughtForward != null ? num(raw.BalanceBroughtForward) : undefined,
    balanceCarriedForward: undefined,
    sruCode: raw.SRU != null ? str(raw.SRU) : undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Company Information
// ---------------------------------------------------------------------------

export function mapCompanyInformation(raw: Record<string, unknown>): CompanyInformationDto {
  const address: PostalAddress = {
    streetName: str(raw.Address) || undefined,
    cityName: str(raw.City) || undefined,
    postalZone: str(raw.ZipCode) || undefined,
    countryCode: str(raw.CountryCode) || undefined,
  };

  const contact: Contact = {
    name: [str(raw.ContactFirstName), str(raw.ContactLastName)].filter(Boolean).join(' ') || undefined,
    telephone: str(raw.Phone1) || undefined,
    email: str(raw.Email) || undefined,
    website: str(raw.WWW) || undefined,
  };

  return {
    companyName: str(raw.CompanyName) || str(raw.Name) || '',
    organizationNumber: str(raw.OrganizationNumber) || undefined,
    legalEntity: raw.OrganizationNumber
      ? {
          registrationName: str(raw.CompanyName) || str(raw.Name) || '',
          companyId: str(raw.OrganizationNumber),
          companyIdSchemeId: 'SE:ORGNR',
        }
      : undefined,
    address,
    contact: (contact.name || contact.telephone || contact.email) ? contact : undefined,
    vatNumber: str(raw.VATNumber) || undefined,
    baseCurrency: DEFAULT_CURRENCY,
    _raw: raw,
  };
}
