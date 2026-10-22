import { redirect } from 'next/navigation'

/** Monthly Purchases was removed from Accounts — bills are seen in Daily Inward and party ledgers. */
export default function MonthlyPurchasesPage() {
  redirect('/accounts/inventory-inward')
}
