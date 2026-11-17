import type { ReactNode } from 'react'

/**
 * Confirmation for the row "remove" button on the salary sheets. Removing takes only this
 * one row off this table — the person's profile and every other month / fortnight stay
 * as they are.
 */
export function removeRowConfirm(name: string, table: string, opts: { comesBack?: boolean; staysOff?: boolean } = {}) {
  const message: ReactNode = (
    <div className="space-y-2 text-xs text-slate-600 text-left">
      <p>
        This row of <strong>{name}</strong> will be removed only from <strong>{table}</strong>.
      </p>
      <div className="rounded-md bg-sky-50 p-2.5 border border-sky-200 text-sky-900 text-[11px] leading-relaxed">
        The profile and the data of other months / fortnights stay the same. If this person has left, enter a{' '}
        <strong>Resign / Left date</strong> in the profile, so they do not come on next month’s sheet.
      </div>
      {opts.staysOff && (
        <div className="rounded-md bg-amber-50 p-2.5 border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
          After saving, this row will not come back on this month’s sheet. Next month it comes again from the profile.
          If you need it back, add a new row and type the same name.
        </div>
      )}
      {opts.comesBack && (
        <div className="rounded-md bg-amber-50 p-2.5 border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
          If this person has no other row this month and the profile is active, the row will come back from the
          profile when the page is opened again.
        </div>
      )}
    </div>
  )
  return {
    title: 'Remove row from table?',
    danger: true,
    confirmText: 'Yes, remove row',
    cancelText: 'Cancel',
    message,
  }
}

export const REMOVE_ROW_TITLE = 'Remove row from this table (the profile is not removed)'
