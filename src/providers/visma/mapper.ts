import type {
  SalesInvoiceDto,
  SalesInvoiceLineDto,
  SupplierInvoiceDto,
  SupplierInvoiceLineDto,
  CustomerDto,
  SupplierDto,
  JournalDto,
  AccountingAccountDto,
  CompanyInformationDto,
  InvoiceStatusCode,
  AmountType,
  PartyDto,
} from '../../types/dto.js';
import { deriveAccountType } from '../../types/dto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function amt(value: number | null | undefined, currencyCode?: string): AmountType {
  return { value: value ?? 0, currencyCode: currencyCode ?? 'SEK' };
}

function deriveSalesInvoiceStatus(raw: any): InvoiceStatusCode {
  if (raw.IsCancelled) return 'cancelled';
  if (raw.RemainingAmount === 0 && (raw.TotalAmount ?? 0) > 0) return 'paid';
  if (raw.IsBooked) return 'booked';
  if (raw.IsSent || raw.SendType != null) return 'sent';
  return 'draft';
}

function deriveSupplierInvoiceStatus(raw: any): InvoiceStatusCode {
  if (raw.IsCancelled) return 'cancelled';
  if (raw.RemainingAmount === 0 && (raw.TotalAmount ?? 0) > 0) return 'paid';
  if (raw.IsBooked) return 'booked';
  if (raw.IsSent || raw.SendType != null) return 'sent';
  return 'draft';
}

function buildParty(name?: string, fields?: {
  Address1?: string;
  Address2?: string;
  City?: string;
  PostalCode?: string;
  Country?: string;
  CountryCode?: string;
  Email?: string;
  Phone?: string;
  Website?: string;
  OrgNumber?: string;
  CustomerNumber?: string;
  SupplierNumber?: string;
  Id?: string;
}): PartyDto {
  return {
    name: name ?? '',
    identifications: fields?.Id ? [{ id: fields.Id }] : [],
    postalAddress: {
      streetName: fields?.Address1,
      additionalStreetName: fields?.Address2,
      cityName: fields?.City,
      postalZone: fields?.PostalCode,
      countryCode: fields?.CountryCode ?? fields?.Country,
    },
    contact: {
      email: fields?.Email,
      telephone: fields?.Phone,
      website: fields?.Website,
    },
    legalEntity: fields?.OrgNumber
      ? { registrationName: name ?? '', companyId: fields.OrgNumber }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Sales Invoice
// ---------------------------------------------------------------------------

export function mapSalesInvoice(raw: any): SalesInvoiceDto {
  const currency = raw.CurrencyCode ?? 'SEK';
  const status = deriveSalesInvoiceStatus(raw);
  const totalAmount = raw.TotalAmount ?? 0;
  const totalVat = raw.TotalVatAmount ?? raw.VatAmount ?? 0;
  const remaining = raw.RemainingAmount ?? 0;

  const lines: SalesInvoiceLineDto[] = (raw.Rows ?? raw.InvoiceRows ?? []).map(
    (row: any, idx: number): SalesInvoiceLineDto => ({
      id: row.Id ?? String(idx),
      description: row.Text ?? row.Description ?? '',
      quantity: row.Quantity ?? 1,
      unitCode: row.UnitAbbreviation ?? row.Unit ?? undefined,
      unitPrice: amt(row.UnitPrice, currency),
      lineExtensionAmount: amt(row.LineTotal ?? (row.Quantity ?? 1) * (row.UnitPrice ?? 0), currency),
      taxPercent: row.VatRate ?? row.VatPercent ?? undefined,
      taxAmount: row.VatAmount != null ? amt(row.VatAmount, currency) : undefined,
      accountNumber: row.AccountNumber != null ? String(row.AccountNumber) : undefined,
      itemName: row.ArticleName ?? row.Text ?? undefined,
      articleNumber: row.ArticleNumber ?? undefined,
    }),
  );

  return {
    id: String(raw.Id),
    invoiceNumber: String(raw.InvoiceNumber ?? raw.Id ?? ''),
    issueDate: raw.InvoiceDate ?? raw.CreatedUtc ?? '',
    dueDate: raw.DueDate ?? undefined,
    deliveryDate: raw.DeliveryDate ?? undefined,
    currencyCode: currency,
    status,
    supplier: buildParty(raw.CompanyName, {
      Address1: raw.CompanyAddress1,
      Address2: raw.CompanyAddress2,
      City: raw.CompanyCity,
      PostalCode: raw.CompanyPostalCode,
      Country: raw.CompanyCountry,
    }),
    customer: buildParty(raw.CustomerName, {
      Id: raw.CustomerId,
      Address1: raw.Address1 ?? raw.CustomerAddress1,
      Address2: raw.Address2 ?? raw.CustomerAddress2,
      City: raw.City ?? raw.CustomerCity,
      PostalCode: raw.PostalCode ?? raw.CustomerPostalCode,
      CountryCode: raw.CountryCode ?? raw.CustomerCountry,
      Email: raw.CustomerEmail,
      CustomerNumber: raw.CustomerNumber != null ? String(raw.CustomerNumber) : undefined,
    }),
    lines,
    taxTotal: {
      taxAmount: amt(totalVat, currency),
    },
    legalMonetaryTotal: {
      lineExtensionAmount: amt(totalAmount - totalVat, currency),
      taxExclusiveAmount: amt(totalAmount - totalVat, currency),
      taxInclusiveAmount: amt(totalAmount, currency),
      payableAmount: amt(totalAmount, currency),
    },
    paymentStatus: {
      paid: status === 'paid',
      balance: amt(remaining, currency),
      lastPaymentDate: raw.PaymentDate ?? undefined,
    },
    paymentTerms: raw.TermsOfPaymentId ?? raw.TermsOfPayment ?? undefined,
    note: raw.Note ?? raw.Message ?? undefined,
    buyerReference: raw.BuyerReference ?? raw.YourReference ?? undefined,
    orderReference: raw.OrderReference ?? raw.OurReference ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Supplier Invoice
// ---------------------------------------------------------------------------

export function mapSupplierInvoice(raw: any): SupplierInvoiceDto {
  const currency = raw.CurrencyCode ?? 'SEK';
  const status = deriveSupplierInvoiceStatus(raw);
  const totalAmount = raw.TotalAmount ?? raw.InvoiceTotal ?? 0;
  const totalVat = raw.TotalVatAmount ?? raw.VatAmount ?? 0;
  const remaining = raw.RemainingAmount ?? raw.Balance ?? 0;

  const lines: SupplierInvoiceLineDto[] = (raw.Rows ?? raw.InvoiceRows ?? []).map(
    (row: any, idx: number): SupplierInvoiceLineDto => {
      // Supplier invoice rows in Visma use DebetAmount / CreditAmount (double-entry)
      const debit = row.DebetAmount ?? row.DebitAmount ?? 0;
      const credit = row.CreditAmount ?? 0;
      const lineAmount = debit - credit;

      return {
        id: row.Id ?? String(idx),
        description: row.Text ?? row.Description ?? '',
        quantity: row.Quantity ?? 1,
        unitCode: row.UnitAbbreviation ?? row.Unit ?? undefined,
        unitPrice: amt(row.UnitPrice ?? lineAmount, currency),
        lineExtensionAmount: amt(row.LineTotal ?? lineAmount, currency),
        taxPercent: row.VatRate ?? row.VatPercent ?? undefined,
        taxAmount: row.VatAmount != null ? amt(row.VatAmount, currency) : undefined,
        accountNumber: row.AccountNumber != null ? String(row.AccountNumber) : undefined,
        itemName: row.ArticleName ?? row.Text ?? undefined,
        articleNumber: row.ArticleNumber ?? undefined,
      };
    },
  );

  return {
    id: String(raw.Id),
    invoiceNumber: String(raw.InvoiceNumber ?? raw.Id ?? ''),
    issueDate: raw.InvoiceDate ?? raw.CreatedUtc ?? '',
    dueDate: raw.DueDate ?? undefined,
    deliveryDate: raw.DeliveryDate ?? undefined,
    currencyCode: currency,
    status,
    supplier: buildParty(raw.SupplierName, {
      Id: raw.SupplierId,
      Address1: raw.SupplierAddress1,
      Address2: raw.SupplierAddress2,
      City: raw.SupplierCity,
      PostalCode: raw.SupplierPostalCode,
      CountryCode: raw.SupplierCountryCode,
      SupplierNumber: raw.SupplierNumber != null ? String(raw.SupplierNumber) : undefined,
    }),
    buyer: buildParty(raw.CompanyName, {
      Address1: raw.CompanyAddress1,
      Address2: raw.CompanyAddress2,
      City: raw.CompanyCity,
      PostalCode: raw.CompanyPostalCode,
      Country: raw.CompanyCountry,
    }),
    lines,
    taxTotal: {
      taxAmount: amt(totalVat, currency),
    },
    legalMonetaryTotal: {
      lineExtensionAmount: amt(totalAmount - totalVat, currency),
      taxExclusiveAmount: amt(totalAmount - totalVat, currency),
      taxInclusiveAmount: amt(totalAmount, currency),
      payableAmount: amt(totalAmount, currency),
    },
    paymentStatus: {
      paid: status === 'paid',
      balance: amt(remaining, currency),
      lastPaymentDate: raw.PaymentDate ?? undefined,
    },
    paymentTerms: raw.TermsOfPaymentId ?? raw.TermsOfPayment ?? undefined,
    note: raw.Note ?? raw.Message ?? undefined,
    ocrNumber: raw.OcrNumber ?? raw.OCR ?? undefined,
    buyerReference: raw.BuyerReference ?? raw.YourReference ?? undefined,
    orderReference: raw.OrderReference ?? raw.OurReference ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export function mapCustomer(raw: any): CustomerDto {
  const party = buildParty(raw.Name, {
    Id: raw.Id,
    Address1: raw.Address1 ?? raw.InvoiceAddress1,
    Address2: raw.Address2 ?? raw.InvoiceAddress2,
    City: raw.City ?? raw.InvoiceCity,
    PostalCode: raw.PostalCode ?? raw.InvoicePostalCode,
    CountryCode: raw.CountryCode,
    Email: raw.EmailAddress ?? raw.Email,
    Phone: raw.Phone ?? raw.MobilePhone,
    Website: raw.Www ?? raw.Website,
    OrgNumber: raw.OrganisationNumber ?? raw.OrgNumber,
  });

  return {
    id: String(raw.Id),
    customerNumber: String(raw.CustomerNumber ?? ''),
    type: raw.IsPrivatePerson ? 'private' : 'company',
    party,
    deliveryAddresses: raw.DeliveryAddress1
      ? [
          {
            streetName: raw.DeliveryAddress1,
            additionalStreetName: raw.DeliveryAddress2,
            cityName: raw.DeliveryCity,
            postalZone: raw.DeliveryPostalCode,
            countryCode: raw.DeliveryCountryCode,
          },
        ]
      : undefined,
    active: raw.IsActive !== false,
    vatNumber: raw.VatNumber ?? undefined,
    defaultPaymentTermsDays: raw.TermsOfPaymentId != null
      ? raw.TermsOfPayment?.NumberOfDays ?? undefined
      : undefined,
    note: raw.Note ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export function mapSupplier(raw: any): SupplierDto {
  const party = buildParty(raw.Name, {
    Id: raw.Id,
    Address1: raw.Address1,
    Address2: raw.Address2,
    City: raw.City,
    PostalCode: raw.PostalCode,
    CountryCode: raw.CountryCode,
    Email: raw.EmailAddress ?? raw.Email,
    Phone: raw.Phone ?? raw.MobilePhone,
    Website: raw.Www ?? raw.Website,
    OrgNumber: raw.OrganisationNumber ?? raw.OrgNumber,
  });

  return {
    id: String(raw.Id),
    supplierNumber: String(raw.SupplierNumber ?? ''),
    party,
    deliveryAddresses: raw.DeliveryAddress1
      ? [
          {
            streetName: raw.DeliveryAddress1,
            additionalStreetName: raw.DeliveryAddress2,
            cityName: raw.DeliveryCity,
            postalZone: raw.DeliveryPostalCode,
            countryCode: raw.DeliveryCountryCode,
          },
        ]
      : undefined,
    active: raw.IsActive !== false,
    vatNumber: raw.VatNumber ?? undefined,
    bankAccount: raw.BankAccountNumber ?? raw.BankAccount ?? undefined,
    bankGiro: raw.BankGiro ?? raw.Bankgiro ?? undefined,
    plusGiro: raw.PlusGiro ?? raw.Plusgiro ?? undefined,
    defaultPaymentTermsDays: raw.TermsOfPaymentId != null
      ? raw.TermsOfPayment?.NumberOfDays ?? undefined
      : undefined,
    note: raw.Note ?? undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Journal (Voucher)
// ---------------------------------------------------------------------------

export function mapJournal(raw: any): JournalDto {
  const currency = 'SEK';

  const entries = (raw.Rows ?? raw.VoucherRows ?? []).map((row: any) => ({
    accountNumber: String(row.AccountNumber ?? ''),
    accountName: row.AccountName ?? row.AccountDescription ?? undefined,
    debit: row.DebitAmount ?? row.DebetAmount ?? 0,
    credit: row.CreditAmount ?? 0,
    transactionDate: row.TransactionDate ?? raw.VoucherDate ?? undefined,
    description: row.TransactionText ?? row.Text ?? undefined,
  }));

  const totalDebit = entries.reduce((sum: number, e: any) => sum + e.debit, 0);
  const totalCredit = entries.reduce((sum: number, e: any) => sum + e.credit, 0);

  return {
    id: String(raw.Id),
    journalNumber: String(raw.VoucherNumber ?? raw.Number ?? raw.Id ?? ''),
    series: raw.VoucherType != null
      ? { id: String(raw.VoucherType), description: raw.VoucherTypeName ?? undefined }
      : undefined,
    description: raw.Description ?? raw.Text ?? undefined,
    registrationDate: raw.VoucherDate ?? raw.CreatedUtc ?? '',
    fiscalYear: raw.FiscalYear ?? raw.FiscalYearId ?? undefined,
    entries,
    totalDebit: amt(totalDebit, currency),
    totalCredit: amt(totalCredit, currency),
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export function mapAccount(raw: any): AccountingAccountDto {
  const accountNumber = String(raw.Number ?? raw.AccountNumber ?? '');

  return {
    accountNumber,
    name: raw.Name ?? '',
    description: raw.Description ?? undefined,
    type: deriveAccountType(accountNumber),
    vatCode: raw.VatCodeId ?? raw.VatCode ?? undefined,
    active: raw.IsActive !== false,
    balanceBroughtForward: raw.OpeningBalance ?? raw.BalanceBroughtForward ?? undefined,
    balanceCarriedForward: raw.BalanceCarriedForward ?? undefined,
    sruCode: raw.SruCode != null ? String(raw.SruCode) : undefined,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Company Information
// ---------------------------------------------------------------------------

export function mapCompanyInformation(raw: any): CompanyInformationDto {
  return {
    companyName: raw.Name ?? raw.CompanyName ?? '',
    organizationNumber: raw.OrganisationNumber ?? raw.OrgNumber ?? undefined,
    legalEntity: raw.OrganisationNumber
      ? {
          registrationName: raw.Name ?? raw.CompanyName ?? '',
          companyId: raw.OrganisationNumber,
        }
      : undefined,
    address: {
      streetName: raw.Address1 ?? raw.Address,
      additionalStreetName: raw.Address2,
      cityName: raw.City,
      postalZone: raw.PostalCode ?? raw.ZipCode,
      countryCode: raw.CountryCode,
    },
    contact: {
      email: raw.Email ?? raw.EmailAddress,
      telephone: raw.Phone ?? raw.Telephone,
      website: raw.Www ?? raw.Website,
    },
    vatNumber: raw.VatNumber ?? undefined,
    fiscalYearStart: raw.CurrentFiscalYear?.StartDate ?? undefined,
    baseCurrency: raw.CurrencyCode ?? raw.DefaultCurrency ?? 'SEK',
    _raw: raw,
  };
}
