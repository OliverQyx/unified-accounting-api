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
import { fetchAccountBalances } from './client.js';
import type { AccountingAccountDto } from '../../types/dto.js';

/**
 * After the normal account list is fetched and mapped, this enricher
 * calls /accountbalances/{today} and merges the Balance values into
 * each AccountingAccountDto as `balanceCarriedForward`.
 *
 * This is best-effort: if the balance fetch fails the accounts are
 * returned as-is.
 */
export async function enrichAccountsWithBalances(
  accounts: AccountingAccountDto[],
  token: string,
): Promise<AccountingAccountDto[]> {
  const balanceMap = await fetchAccountBalances(token);
  if (balanceMap.size === 0) return accounts;

  return accounts.map((acct) => {
    const num = Number(acct.accountNumber);
    const balance = balanceMap.get(num);
    if (balance !== undefined) {
      return { ...acct, balanceCarriedForward: balance };
    }
    return acct;
  });
}

export const vismaResourceConfigs: Partial<Record<ResourceType, ProviderResourceConfig>> = {
  [ResourceType.SalesInvoices]: {
    listEndpoint: '/customerinvoices',
    detailEndpoint: '/customerinvoices/{id}',
    idField: 'Id',
    mapper: mapSalesInvoice,
    modifiedFilterParam: 'ModifiedUtc',
  },

  [ResourceType.SupplierInvoices]: {
    listEndpoint: '/supplierinvoices',
    detailEndpoint: '/supplierinvoices/{id}',
    idField: 'Id',
    mapper: mapSupplierInvoice,
    modifiedFilterParam: 'ModifiedUtc',
  },

  [ResourceType.Customers]: {
    listEndpoint: '/customers',
    detailEndpoint: '/customers/{id}',
    idField: 'Id',
    mapper: mapCustomer,
    modifiedFilterParam: 'ChangedUtc',
  },

  [ResourceType.Suppliers]: {
    listEndpoint: '/suppliers',
    detailEndpoint: '/suppliers/{id}',
    idField: 'Id',
    mapper: mapSupplier,
    modifiedFilterParam: 'ModifiedUtc',
  },

  [ResourceType.Journals]: {
    listEndpoint: '/vouchers',
    detailEndpoint: '/vouchers/{id}',
    idField: 'Id',
    mapper: mapJournal,
  },

  [ResourceType.AccountingAccounts]: {
    listEndpoint: '/accounts',
    detailEndpoint: '/accounts/{id}',
    idField: 'Number',
    mapper: mapAccount,
  },

  [ResourceType.CompanyInformation]: {
    listEndpoint: '/companysettings',
    detailEndpoint: '/companysettings',
    idField: 'Id',
    mapper: mapCompanyInformation,
    singleton: true,
  },
};
