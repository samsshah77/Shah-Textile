import { redirect } from 'next/navigation'

/**
 * Daily Inward and Inward Expenses have been unified into a single master sheet
 * per user specification. Redirect to `/accounts/inventory-inward`.
 */
export default function DailyExpensePage() {
  redirect('/accounts/inventory-inward')
}
