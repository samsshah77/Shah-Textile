import type { PermissionAction } from '@prisma/client'

/**
 * Ready-made access for a new role, so nobody has to tick permission boxes.
 * None of them can change production numbers, salary or accounts — that stays with the
 * three built-in roles (Main Admin, Quality Controller, Accountant).
 */
export const ROLE_ACCESS: Record<string, { label: string; grants: Record<string, PermissionAction[]> }> = {
  fault: {
    label: 'Production dekhna + Kamran Fault bhejna',
    grants: { floor: ['VIEW', 'CREATE'], quality: ['VIEW', 'CREATE'] },
  },
  view: {
    label: 'Production sirf dekhna',
    grants: { floor: ['VIEW'], quality: ['VIEW'] },
  },
}

