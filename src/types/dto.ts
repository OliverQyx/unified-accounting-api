export enum ResourceType {
  SalesInvoices = 'salesinvoices',
  SupplierInvoices = 'supplierinvoices',
  Customers = 'customers',
  Suppliers = 'suppliers',
  Journals = 'journals',
  AccountingAccounts = 'accountingaccounts',
  CompanyInformation = 'companyinformation',
  AccountingPeriods = 'accountingperiods',
  FinancialDimensions = 'financialdimensions',
  BalanceSheet = 'balancesheet',
  IncomeStatement = 'incomestatement',
  TrialBalances = 'trialbalances',
  Payments = 'payments',
  Attachments = 'attachments',
}

// Common types

export interface AmountType {
  value: number;
  currencyCode: string;
}

export interface PostalAddress {
  streetName?: string;
  additionalStreetName?: string;
  buildingNumber?: string;
  cityName?: string;
  postalZone?: string;
  countrySubentity?: string;
  countryCode?: string;
}

export interface Contact {
  name?: string;
  telephone?: string;
  email?: string;
  website?: string;
}

export interface PartyIdentification {
  id: string;
  schemeId?: string;
}

export interface PartyLegalEntity {
  registrationName: string;
  companyId?: string;
  companyIdSchemeId?: string;
}

export interface PartyDto {
  name: string;
  identifications: PartyIdentification[];
  postalAddress?: PostalAddress;
  legalEntity?: PartyLegalEntity;
  contact?: Contact;
}

export interface FinancialDimensionRef {
  dimensionId: string;
  dimensionValueId: string;
  name?: string;
}

export interface AllowanceChargeDto {
  chargeIndicator: boolean;
  reason?: string;
  amount: AmountType;
  taxPercent?: number;
}

export interface TaxSubtotalDto {
  taxableAmount: AmountType;
  taxAmount: AmountType;
  taxCategory?: string;
  percent?: number;
}

export interface TaxTotalDto {
  taxAmount: AmountType;
  taxSubtotals?: TaxSubtotalDto[];
}

export interface LegalMonetaryTotalDto {
  lineExtensionAmount: AmountType;
  taxExclusiveAmount?: AmountType;
  taxInclusiveAmount?: AmountType;
  allowanceTotalAmount?: AmountType;
  chargeTotalAmount?: AmountType;
  payableRoundingAmount?: AmountType;
  payableAmount: AmountType;
}

export interface PaymentStatusDto {
  paid: boolean;
  balance: AmountType;
  lastPaymentDate?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

// Invoice status
export type InvoiceStatusCode =
  | 'draft'
  | 'sent'
  | 'booked'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'credited';

// Sales Invoice

export interface SalesInvoiceLineDto {
  id?: string;
  description?: string;
  quantity?: number;
  unitCode?: string;
  unitPrice?: AmountType;
  lineExtensionAmount?: AmountType;
  taxPercent?: number;
  taxAmount?: AmountType;
  accountNumber?: string;
  itemName?: string;
  articleNumber?: string;
  financialDimensions?: FinancialDimensionRef[];
}

export interface SalesInvoiceDto {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  deliveryDate?: string;
  invoiceTypeCode?: string;
  currencyCode: string;
  status: InvoiceStatusCode;
  supplier: PartyDto;
  customer: PartyDto;
  lines: SalesInvoiceLineDto[];
  allowanceCharges?: AllowanceChargeDto[];
  taxTotal?: TaxTotalDto;
  legalMonetaryTotal: LegalMonetaryTotalDto;
  paymentStatus: PaymentStatusDto;
  paymentTerms?: string;
  note?: string;
  buyerReference?: string;
  orderReference?: string;
  financialDimensions?: FinancialDimensionRef[];
  _raw?: unknown;
}

// Supplier Invoice

export interface SupplierInvoiceLineDto {
  id?: string;
  description?: string;
  quantity?: number;
  unitCode?: string;
  unitPrice?: AmountType;
  lineExtensionAmount?: AmountType;
  taxPercent?: number;
  taxAmount?: AmountType;
  accountNumber?: string;
  itemName?: string;
  articleNumber?: string;
  financialDimensions?: FinancialDimensionRef[];
}

export interface SupplierInvoiceDto {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  deliveryDate?: string;
  invoiceTypeCode?: string;
  currencyCode: string;
  status: InvoiceStatusCode;
  supplier: PartyDto;
  buyer: PartyDto;
  lines: SupplierInvoiceLineDto[];
  allowanceCharges?: AllowanceChargeDto[];
  taxTotal?: TaxTotalDto;
  legalMonetaryTotal: LegalMonetaryTotalDto;
  paymentStatus: PaymentStatusDto;
  paymentTerms?: string;
  note?: string;
  ocrNumber?: string;
  buyerReference?: string;
  orderReference?: string;
  financialDimensions?: FinancialDimensionRef[];
  _raw?: unknown;
}

// Customer

export type CustomerType = 'company' | 'private';

export interface CustomerDto {
  id: string;
  customerNumber: string;
  type?: CustomerType;
  party: PartyDto;
  deliveryAddresses?: PostalAddress[];
  financialDimensions?: FinancialDimensionRef[];
  active: boolean;
  vatNumber?: string;
  defaultPaymentTermsDays?: number;
  note?: string;
  _raw?: unknown;
}

// Supplier

export interface SupplierDto {
  id: string;
  supplierNumber: string;
  party: PartyDto;
  deliveryAddresses?: PostalAddress[];
  financialDimensions?: FinancialDimensionRef[];
  active: boolean;
  vatNumber?: string;
  bankAccount?: string;
  bankGiro?: string;
  plusGiro?: string;
  defaultPaymentTermsDays?: number;
  note?: string;
  _raw?: unknown;
}

// Journal

export interface AccountingSeriesDto {
  id: string;
  description?: string;
}

export interface AccountingEntryDto {
  accountNumber: string;
  accountName?: string;
  debit: number;
  credit: number;
  transactionDate?: string;
  description?: string;
  financialDimensions?: FinancialDimensionRef[];
}

export interface JournalDto {
  id: string;
  journalNumber: string;
  series?: AccountingSeriesDto;
  description?: string;
  registrationDate: string;
  fiscalYear?: number;
  entries: AccountingEntryDto[];
  totalDebit?: AmountType;
  totalCredit?: AmountType;
  _raw?: unknown;
}

// Accounting Account

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'other';

export interface AccountingAccountDto {
  accountNumber: string;
  name: string;
  description?: string;
  type?: AccountType;
  vatCode?: string;
  active: boolean;
  balanceBroughtForward?: number;
  balanceCarriedForward?: number;
  sruCode?: string;
  _raw?: unknown;
}

// Company Information

export interface CompanyInformationDto {
  companyName: string;
  organizationNumber?: string;
  legalEntity?: PartyLegalEntity;
  address?: PostalAddress;
  contact?: Contact;
  vatNumber?: string;
  fiscalYearStart?: string;
  baseCurrency?: string;
  _raw?: unknown;
}

/**
 * Derive account type from the Swedish BAS plan account number ranges.
 *
 * BAS plan ranges (used by Fortnox, Visma, Briox, Bokio, Björn Lundén):
 *   1000–1999  Tillgångar (Assets)
 *   2000–2099  Eget kapital (Equity)
 *   2100–2999  Skulder (Liabilities)
 *   3000–3999  Intäkter (Revenue)
 *   4000–8999  Kostnader (Expenses)
 */
export function deriveAccountType(accountNumber: string | number): AccountType {
  const num = typeof accountNumber === 'string' ? parseInt(accountNumber, 10) : accountNumber;
  if (num >= 1000 && num <= 1999) return 'asset';
  if (num >= 2000 && num <= 2099) return 'equity';
  if (num >= 2100 && num <= 2999) return 'liability';
  if (num >= 3000 && num <= 3999) return 'revenue';
  if (num >= 4000 && num <= 8999) return 'expense';
  return 'other';
}
