/** Keys persisted in `accounts_store`. Month and trader keys use a fixed prefix. */

export const ACCOUNTS_KEYS = {
  PETTY_CASH: 'sara_textile_petty_cash_v4',
  INVENTORY_PURCHASE: 'sara_textile_inventory_purchase_v4',
  INVENTORY_CONTROL: 'sara_textile_inventory_control_v2',
  DAILY_INWARD: 'sara_textile_daily_inward_v2',
  DAILY_INWARD_MONTHS: 'sara_textile_daily_inward_months_v1',
  TRADERS_STORE: 'sara_textile_traders_v2',
  WORKSHOPS_STORE: 'sara_textile_workshops_v2',
  COST_STATEMENT_PREFIX: 'sara_textile_cost_statement_v5_',
  COST_OVERRIDES_PREFIX: 'sara_textile_cost_statement_overrides_v1_',
  TRADER_PREFIX: 'sara_textile_trader_custom_v1_',
  WORKSHOP_PREFIX: 'sara_textile_workshop_custom_v1_',
  DELETED_TRADERS: 'sara_textile_deleted_traders_v1',
  DELETED_WORKSHOPS: 'sara_textile_deleted_workshops_v1',
} as const

const EXACT = new Set<string>([
  ACCOUNTS_KEYS.PETTY_CASH,
  ACCOUNTS_KEYS.INVENTORY_PURCHASE,
  ACCOUNTS_KEYS.INVENTORY_CONTROL,
  ACCOUNTS_KEYS.DAILY_INWARD,
  ACCOUNTS_KEYS.DAILY_INWARD_MONTHS,
  ACCOUNTS_KEYS.TRADERS_STORE,
  ACCOUNTS_KEYS.WORKSHOPS_STORE,
  ACCOUNTS_KEYS.DELETED_TRADERS,
  ACCOUNTS_KEYS.DELETED_WORKSHOPS,
  'sara_textile_cost_statement_editable_v1',
])

const PREFIXES = [
  ACCOUNTS_KEYS.COST_STATEMENT_PREFIX,
  ACCOUNTS_KEYS.COST_OVERRIDES_PREFIX,
  ACCOUNTS_KEYS.TRADER_PREFIX,
  ACCOUNTS_KEYS.WORKSHOP_PREFIX,
]

export function isAccountsStoreKey(key: string): boolean {
  if (!key || key.length > 160) return false
  if (!/^sara_textile_[a-z0-9_-]+$/i.test(key)) return false
  if (EXACT.has(key)) return true
  return PREFIXES.some((prefix) => key.startsWith(prefix) && key.length > prefix.length)
}
