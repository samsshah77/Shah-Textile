'use client'

import React, { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SidebarProvider } from '@/context/SidebarContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { AlertDialogProvider } from '@/context/AlertDialogContext'
import { Sidebar } from '@/components/shared/Sidebar'
import { Header } from '@/components/shared/Header'
import { ExcelSheetTabBar } from '@/components/payroll/ExcelSheetTabBar'
import { AdminLteAssets } from '@/components/shared/AdminLteAssets'
import { NavigationProgress } from '@/components/shared/NavigationProgress'

const BODY_ERP_CLASSES = ['layout-fixed', 'sidebar-expand-lg', 'bg-body-tertiary'] as const

function MainContent({ children }: { children: React.ReactNode }) {
  const { isQualityController } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (isQualityController) {
      if (pathname.startsWith('/payroll') || pathname.startsWith('/accounts')) {
        router.replace('/dashboard')
      }
    }
  }, [isQualityController, pathname, router])

  const isAdminRoute = pathname.startsWith('/admin')
  const isDashboardRoute = pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  const isPayrollRoute = pathname.startsWith('/payroll')
  const isAccountsRoute = pathname.startsWith('/accounts')
  // Dashboard: no Excel tab strip. QC: never show salary/accounts tabs (those bounce back).
  const showExcelTabBar =
    !isAdminRoute &&
    !isDashboardRoute &&
    !(isQualityController && (isPayrollRoute || isAccountsRoute))

  return (
    <main className="app-main bg-body-tertiary sara-app-main">
      <div className="sara-erp-topbar">
        <Header />
        {showExcelTabBar && <ExcelSheetTabBar />}
      </div>
      <div className="app-content sara-app-content">
        <div className="container-fluid">{children}</div>
      </div>
    </main>
  )
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isLoading, isLoggingOut } = useAuth()
  const router = useRouter()

  const isPublicLandingPage = pathname === '/'
  const isLoginPage = pathname === '/login'
  const isForbiddenPage = pathname === '/forbidden'
  const isAuthChrome = isLoginPage || isPublicLandingPage || isForbiddenPage
  const isErpShell = !isAuthChrome && !!user

  useEffect(() => {
    if (!isLoading && !user && !isAuthChrome) {
      router.replace('/login')
    }
  }, [user, isLoading, isAuthChrome, router])

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', 'light')
    document.documentElement.setAttribute('data-lte-color-mode', 'off')
    document.documentElement.removeAttribute('data-lte-primary')
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = 'light'

    if (isErpShell) {
      document.body.classList.remove('auth-route', 'login-page', 'bg-body-secondary')
      BODY_ERP_CLASSES.forEach((c) => document.body.classList.add(c))
      return () => {
        BODY_ERP_CLASSES.forEach((c) => document.body.classList.remove(c))
      }
    }

    BODY_ERP_CLASSES.forEach((c) => document.body.classList.remove(c))
    if (isLoginPage) {
      document.body.classList.add('auth-route', 'login-page', 'bg-body-secondary')
    } else if (isAuthChrome) {
      document.body.classList.remove('login-page', 'bg-body-secondary')
      document.body.classList.add('auth-route')
    } else {
      document.body.classList.remove('auth-route', 'login-page', 'bg-body-secondary')
    }
    return () => {
      document.body.classList.remove('auth-route', 'login-page', 'bg-body-secondary')
    }
  }, [isErpShell, isAuthChrome, isLoginPage])

  return (
    <>
      <NavigationProgress />
      {isLoggingOut && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center"
          style={{ zIndex: 99999, background: 'rgba(15,23,42,0.85)' }}
        >
          <div className="card shadow p-4 text-center" style={{ maxWidth: 280 }}>
            <div className="spinner-border text-primary mb-3" role="status" />
            <h3 className="fs-6 fw-bold mb-1">Signing Out...</h3>
            <p className="text-secondary small mb-0">Clearing secure ERP session</p>
          </div>
        </div>
      )}

      {isAuthChrome ? (
        <>
          {isLoginPage ? <AdminLteAssets /> : null}
          {children}
        </>
      ) : isLoading ? (
        <div className="d-flex min-vh-100 align-items-center justify-content-center bg-body-tertiary">
          <div className="text-center">
            <div className="spinner-border text-primary mb-2" role="status" />
            <div className="text-secondary text-uppercase small fw-semibold tracking-wide">
              Loading Sara Textile ERP...
            </div>
          </div>
        </div>
      ) : (
        <SidebarProvider>
          <AdminLteAssets />
          <div className="app-wrapper">
            <Sidebar />
            <MainContent>{children}</MainContent>
            <footer className="app-footer">
              <div className="float-end d-none d-sm-inline">Sara Textile ERP</div>
              <strong>
                Copyright &copy; {new Date().getFullYear()}{' '}
                <a href="/dashboard">Sara Textile</a>.
              </strong>{' '}
              All rights reserved.
            </footer>
          </div>
        </SidebarProvider>
      )}
    </>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AlertDialogProvider>
        <AppShell>{children}</AppShell>
      </AlertDialogProvider>
    </AuthProvider>
  )
}
