import { redirect } from 'next/navigation'

/** Petty cash is kept in Accounts only; old links to the salary page go there. */
export default function PayrollPettyCashMoved() {
  redirect('/accounts/petty-cash')
}
