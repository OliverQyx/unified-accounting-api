import { ResourceType } from '../../types/dto.js';
import type { ProviderResourceConfig } from '../types.js';
import {
  mapSalesInvoice,
  mapCustomer,
  mapJournal,
  mapAccount,
  mapCompanyInformation,
} from './mapper.js';

export const bokioConfigs: Partial<Record<ResourceType, ProviderResourceConfig>> = {
  [ResourceType.SalesInvoices]: {
    listEndpoint: '/invoices',
    detailEndpoint: '/invoices',
    idField: 'id',
    mapper: mapSalesInvoice,
    paginated: true,
  },

  [ResourceType.Customers]: {
    listEndpoint: '/customers',
    detailEndpoint: '/customers',
    idField: 'id',
    mapper: mapCustomer,
    paginated: true,
  },

  [ResourceType.Journals]: {
    listEndpoint: '/journal-entries',
    detailEndpoint: '/journal-entries',
    idField: 'id',
    mapper: mapJournal,
    paginated: true,
  },

  [ResourceType.AccountingAccounts]: {
    listEndpoint: '/chart-of-accounts',
    detailEndpoint: '/chart-of-accounts',
    idField: 'number',
    mapper: mapAccount,
    paginated: false,
  },

  [ResourceType.CompanyInformation]: {
    listEndpoint: '',
    detailEndpoint: '',
    idField: '',
    mapper: mapCompanyInformation,
    singleton: true,
  },
};
