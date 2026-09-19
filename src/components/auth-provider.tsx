'use client'

/**
 * Compatibility shim for ccc admin/login components.
 * The real session + edit-mode gates live in AuthContext.
 */
export { AuthProvider, useAuth } from '@/context/AuthContext'
export type { AuthUser } from '@/context/AuthContext'
