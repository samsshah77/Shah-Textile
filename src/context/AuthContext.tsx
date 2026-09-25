'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, UserRole } from '@/types/auth'
import { isAccountsController } from '@/lib/accountsAccess'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: string
  department: string | null
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  loading: boolean
  isLoggingOut: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: (redirectTo?: string) => Promise<void>
  refreshUser: () => Promise<void>
  refresh: () => Promise<AuthUser | null>
  isAdmin: boolean
  isAccountant: boolean
  isQualityController: boolean
  isEditModeEnabled: boolean
  toggleEditMode: () => void
  setEditMode: (enabled: boolean) => void
  canViewAccounts: boolean
  canEditAccounts: boolean
  canViewProduction: boolean
  canEditProduction: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ROLE_LABELS: Record<string, string> = {
  admin: 'Main Admin',
  accountant: 'Accountant',
  quality_controller: 'Quality Controller',
}

function toAppUser(raw: AuthUser & { roleLabel?: string; department?: string | null }): User {
  const role = (raw.role || '').toLowerCase() as UserRole
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    role,
    roleLabel: raw.roleLabel || ROLE_LABELS[role] || role.replaceAll('_', ' '),
    department: raw.department || 'Sara Textile',
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isEditModeEnabled, setIsEditModeEnabled] = useState(true)
  const router = useRouter()

  const toggleEditMode = () => setIsEditModeEnabled((prev) => !prev)
  const setEditMode = (enabled: boolean) => setIsEditModeEnabled(enabled)

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      if (typeof window !== 'undefined' && window.location.search.includes('logout=true')) {
        setUser(null)
        setIsLoading(false)
        return null
      }

      const res = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const data = (await res.json()) as {
        user?: AuthUser | null
        authenticated?: boolean
      }

      if (res.ok && data.user) {
        const next = toAppUser(data.user)
        setUser(next)
        const role = (data.user.role || '').toLowerCase()
        if (role === 'accountant' || role === 'admin') {
          setIsEditModeEnabled(true)
        }
        return {
          id: next.id,
          name: next.name,
          email: next.email,
          role: next.role,
          department: next.department,
        }
      }

      setUser(null)
      return null
    } catch {
      setUser(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    await refresh()
  }, [refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json()) as { user?: AuthUser; error?: string; success?: boolean }

      if (!res.ok || !data.user) {
        return { success: false, error: data.error || 'Authentication failed' }
      }

      const next = toAppUser(data.user)
      setUser(next)
      // Accountant needs Accounts/Payroll edit; production edit stays role-gated
      const role = (data.user.role || '').toLowerCase()
      setIsEditModeEnabled(role === 'accountant' || role === 'admin')
      router.replace('/dashboard')
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection to server failed'
      return { success: false, error: message }
    }
  }

  const logout = async (redirectTo: string = '/login') => {
    setIsLoggingOut(true)
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }).catch(() => undefined)
    } finally {
      setUser(null)
      setIsEditModeEnabled(false)
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.replace(`${redirectTo}?logout=true`)
        }
      }, 350)
    }
  }

  const isAdmin = user?.role === 'admin'
  const isAccountant = user?.role?.toLowerCase() === 'accountant'
  const isQualityController = user?.role?.toLowerCase() === 'quality_controller'
  const canViewAccounts = isAdmin || isAccountant
  const canEditAccounts = isAccountsController(user)
  const canViewProduction = true
  const canEditProduction = isAdmin || isQualityController

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        loading: isLoading,
        isLoggingOut,
        login,
        logout,
        refreshUser,
        refresh,
        isAdmin,
        isAccountant,
        isQualityController,
        isEditModeEnabled,
        toggleEditMode,
        setEditMode,
        canViewAccounts,
        canEditAccounts,
        canViewProduction,
        canEditProduction,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
