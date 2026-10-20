import type { ReactNode } from 'react'

/**
 * Confirmation for the row "remove" button on the salary sheets. Removing takes only this
 * one row off this table — the person's profile and every other month / fortnight stay
 * as they are.
 */
export function removeRowConfirm(name: string, table: string, opts: { comesBack?: boolean } = {}) {
  const message: ReactNode = (
    <div className="space-y-2 text-xs text-slate-600 text-left">
      <p>
        <strong>{name}</strong> ki ye row sirf <strong>{table}</strong> se hat jayegi.
      </p>
      <div className="rounded-md bg-sky-50 p-2.5 border border-sky-200 text-sky-900 text-[11px] leading-relaxed">
        Profile aur doosre mahinon / fortnights ka data waisa hi rahega. Agar is shakhs ka kaam khatam ho
        gaya hai to profile mein <strong>Resign / Left date</strong> daalein, taake agle mahine ki sheet mein na aaye.
      </div>
      {opts.comesBack && (
        <div className="rounded-md bg-amber-50 p-2.5 border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
          Agar is mahine is shakhs ki koi aur row nahi bachti aur profile active hai, to page dobara kholne par
          row profile se wapas aa jayegi.
        </div>
      )}
    </div>
  )
  return {
    title: 'Table se row hatayen?',
    danger: true,
    confirmText: 'Haan, row hatao',
    cancelText: 'Cancel',
    message,
  }
}

export const REMOVE_ROW_TITLE = 'Is table se row hatayen (profile nahi hatega)'
