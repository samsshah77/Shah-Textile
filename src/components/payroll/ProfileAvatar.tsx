'use client'

import { cn } from '@/lib/utils'

const CAT_COLORS: Record<string, string> = {
  Admin: 'bg-violet-600',
  Staff: 'bg-indigo-600',
  Contract: 'bg-amber-600',
  Weaver: 'bg-emerald-600',
  Helper: 'bg-cyan-700',
  Contractor: 'bg-rose-600',
}

function initialsFromName(name?: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

type Props = {
  name?: string
  /** Future photo URL — when set, shows image instead of initials. */
  photoUrl?: string | null
  category?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-32 w-32 text-3xl sm:h-36 sm:w-36 sm:text-4xl',
}

export function ProfileAvatar({ name, photoUrl, category, size = 'md', className }: Props) {
  const initials = initialsFromName(name)
  const bg = CAT_COLORS[category || ''] || 'bg-slate-600'

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || 'Profile'}
        className={cn(
          'rounded-full object-cover border border-slate-200 shrink-0',
          SIZE[size],
          className
        )}
      />
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 select-none',
        bg,
        SIZE[size],
        className
      )}
      title={name || 'Avatar'}
      aria-hidden
    >
      {initials}
    </span>
  )
}
