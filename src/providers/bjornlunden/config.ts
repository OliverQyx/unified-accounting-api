import { ResourceType } from '../../types/dto.js';
import type { ProviderResourceConfig } from '../types.js';
import {
  mapSalesInvoice,
  mapSupplierInvoice,
  mapCustomer,
  mapSupplier,
  mapJournal,
  mapAccount,
  mapCompanyInformation,
} from './mapper.js';

export const bjornLundenConfigs: Partial<Record<ResourceType, ProviderResourceConfig>> = {
  [ResourceType.SalesInvoices]: {
    listEndpoint: '/customerinvoice/batch',
    detailEndpoint: '/customerinvoice',
    idField: 'invoiceNumber',
    mapper: mapSalesInvoice,
    paginated: true,
  },

  [ResourceType.SupplierInvoices]: {
    listEndpoint: '/supplierinvoice/batch',
    detailEndpoint: '/supplierinvoice',
    idField: 'entityId',
    mapper: mapSupplierInvoice,
    paginated: true,
  },

  [ResourceType.Customers]: {
    listEndpoint: '/customer',
    detailEndpoint: '/customer',
    idField: 'id',
    mapper: mapCustomer,
    paginated: false,
  },

  [ResourceType.Suppliers]: {
    listEndpoint: '/supplier',
    detailEndpoint: '/supplier',
    idField: 'id',
    mapper: mapSupplier,
    paginated: false,
  },

  [ResourceType.Journals]: {
    listEndpoint: '/journal/entry/batch',
    detailEndpoint: '/journal/entry/{id}',
    idField: 'entityId',
    mapper: mapJournal,
    paginated: true,
    needsEntryHydration: true,
  },

  [ResourceType.AccountingAccounts]: {
    listEndpoint: '/account',
    detailEndpoint: '/account',
    idField: 'id',
    mapper: mapAccount,
    paginated: false,
  },

  [ResourceType.CompanyInformation]: {
    listEndpoint: '/details',
    detailEndpoint: '/details',
    idField: 'entityId',
    mapper: mapCompanyInformation,
    singleton: true,
  },
};
