'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { User, UserRole } from '@/types/auth'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  // Role helpers
  isAdmin: boolean
  isAccountant: boolean
  isQualityController: boolean
  // Edit Protection Mode
  isEditModeEnabled: boolean
  toggleEditMode: () => void
  setEditMode: (enabled: boolean) => void
  // RBAC Permission gates (strictly active only when editing is enabled)
  canViewAccounts: boolean
  canEditAccounts: boolean
  canViewProduction: boolean
  canEditProduction: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const DEFAULT_STAFF = [
  {
    id: 'usr_admin_javed',
    name: 'Javed Sir',
    email: 'javed@saratextile.com',
    passwordPlain: 'admin123',
    role: 'admin' as UserRole,
    roleLabel: 'Main Admin',
    department: 'Executive Management',
  },
  {
    id: 'usr_acc_tufail',
    name: 'Tufail',
    email: 'tufail@saratextile.com',
    passwordPlain: 'tufail123',
    role: 'accountant' as UserRole,
    roleLabel: 'Accountant',
    department: 'Accounts & Payroll',
  },
  {
    id: 'usr_qc_ahmer',
    name: 'Ahmer',
    email: 'ahmer@saratextile.com',
    passwordPlain: 'ahmer123',
    role: 'quality_controller' as UserRole,
    roleLabel: 'Quality Controller',
    department: 'Floor & Quality Control',
  },
]

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditModeEnabled, setIsEditModeEnabled] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const toggleEditMode = () => {
    setIsEditModeEnabled((prev) => !prev)
  }

  const setEditMode = (enabled: boolean) => {
    setIsEditModeEnabled(enabled)
  }

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated && data.user) {
          setUser(data.user)
        } else {
          // Check localStorage backup
          const saved = typeof window !== 'undefined' ? localStorage.getItem('sara_user_session') : null
          if (saved) {
            setUser(JSON.parse(saved))
          } else {
            setUser(null)
          }
        }
      } else {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('sara_user_session') : null
        if (saved) {
          setUser(JSON.parse(saved))
        } else {
          setUser(null)
        }
      }
    } catch {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('sara_user_session') : null
      if (saved) {
        setUser(JSON.parse(saved))
      } else {
        setUser(null)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshUser()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        // Fallback for instant authorization of default staff
        const normalized = email.trim().toLowerCase()
        const staff = DEFAULT_STAFF.find((s) => s.email === normalized)
        if (staff && staff.passwordPlain === password) {
          const u: User = {
            id: staff.id,
            name: staff.name,
            email: staff.email,
            role: staff.role,
            roleLabel: staff.roleLabel,
            department: staff.department,
          }
          setUser(u)
          if (typeof window !== 'undefined') {
            localStorage.setItem('sara_user_session', JSON.stringify(u))
          }
          setIsEditModeEnabled(false)
          router.push('/floor/production')
          return { success: true }
        }

        return { success: false, error: data.error || 'Authentication failed' }
      }

      setUser(data.user)
      if (typeof window !== 'undefined') {
        localStorage.setItem('sara_user_session', JSON.stringify(data.user))
      }
      setIsEditModeEnabled(false)

      // Default navigation upon login: Open Production Workspace first
      router.push('/floor/production')

      return { success: true }
    } catch (err: any) {
      // Fallback on connection error
      const normalized = email.trim().toLowerCase()
      const staff = DEFAULT_STAFF.find((s) => s.email === normalized)
      if (staff && staff.passwordPlain === password) {
        const u: User = {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          roleLabel: staff.roleLabel,
          department: staff.department,
        }
        setUser(u)
        if (typeof window !== 'undefined') {
          localStorage.setItem('sara_user_session', JSON.stringify(u))
        }
        setIsEditModeEnabled(false)
        router.push('/floor/production')
        return { success: true }
      }

      return { success: false, error: err.message || 'Connection to server failed' }
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setUser(null)
      if (typeof window !== 'undefined') {
        localStorage.removeItem('sara_user_session')
      }
      setIsEditModeEnabled(false)
      router.push('/login')
    }
  }

  const isAdmin = user?.role === 'admin'
  const isAccountant = user?.role === 'accountant'
  const isQualityController = user?.role === 'quality_controller'

  // Accounts Permission Gates:
  const canViewAccounts = isAdmin || isAccountant
  const canEditAccounts = (isAdmin || isAccountant) && isEditModeEnabled

  // Production Permission Gates:
  const canViewProduction = true
  const canEditProduction = (isAdmin || isQualityController) && isEditModeEnabled

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
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
