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
          setUser(null)
        }
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
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
        return { success: false, error: data.error || 'Authentication failed' }
      }

      setUser(data.user)
      setIsEditModeEnabled(false) // Default to view-safe mode upon login

      // Default navigation upon login: Open Production Workspace first
      router.push('/floor/production')

      return { success: true }
    } catch (err: any) {
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
      setIsEditModeEnabled(false)
      router.push('/login')
    }
  }

  const isAdmin = user?.role === 'admin'
  const isAccountant = user?.role === 'accountant'
  const isQualityController = user?.role === 'quality_controller'

  // Accounts Permission Gates:
  // - Admin: Full access (when editing enabled)
  // - Accountant: Full access (when editing enabled)
  // - Quality Controller: CANNOT view and CANNOT edit Accounts
  const canViewAccounts = isAdmin || isAccountant
  const canEditAccounts = (isAdmin || isAccountant) && isEditModeEnabled

  // Production Permission Gates:
  // - Admin: View & Edit (when editing enabled)
  // - Quality Controller: View & Edit (when editing enabled)
  // - Accountant: View-Only (CANNOT edit production/challan, even with editing enabled)
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
