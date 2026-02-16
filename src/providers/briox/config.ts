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

export const brioxConfigs: Partial<Record<ResourceType, ProviderResourceConfig>> = {
  [ResourceType.SalesInvoices]: {
    listEndpoint: '/customerinvoice',
    detailEndpoint: '/customerinvoice/{id}',
    listKey: 'invoices',
    idField: 'id',
    mapper: mapSalesInvoice,
  },

  [ResourceType.SupplierInvoices]: {
    listEndpoint: '/supplierinvoice',
    detailEndpoint: '/supplierinvoice/{id}',
    listKey: 'supplierinvoices',
    idField: 'id',
    mapper: mapSupplierInvoice,
  },

  [ResourceType.Customers]: {
    listEndpoint: '/customer',
    detailEndpoint: '/customer/{id}',
    listKey: 'customers',
    idField: 'id',
    mapper: mapCustomer,
  },

  [ResourceType.Suppliers]: {
    listEndpoint: '/supplier',
    detailEndpoint: '/supplier/{id}',
    listKey: 'suppliers',
    idField: 'id',
    mapper: mapSupplier,
  },

  [ResourceType.Journals]: {
    listEndpoint: '/journal',
    detailEndpoint: '/journal/{id}',
    listKey: 'journals',
    detailKey: 'journal',
    idField: 'id',
    mapper: mapJournal,
    yearScoped: true,
    needsEntryHydration: true,
  },

  [ResourceType.AccountingAccounts]: {
    listEndpoint: '/account',
    detailEndpoint: '/account/{id}',
    listKey: 'accounts',
    idField: 'id',
    mapper: mapAccount,
  },

  [ResourceType.CompanyInformation]: {
    listEndpoint: '/user/info',
    detailEndpoint: '/user/info',
    idField: 'id',
    mapper: mapCompanyInformation,
    singleton: true,
  },
};
