'use client'

import React, { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SidebarProvider, useSidebar } from '@/context/SidebarContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/components/shared/Sidebar'
import { Header } from '@/components/shared/Header'
import { ExcelSheetTabBar } from '@/components/payroll/ExcelSheetTabBar'
import { cn } from '@/lib/utils'

function MainContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar()
  const { user, isQualityController } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    // Quality Controller cannot access accounts or payroll routes
    if (isQualityController) {
      if (pathname.startsWith('/payroll') || pathname.startsWith('/accounts')) {
        router.replace('/floor/production')
      }
    }
  }, [isQualityController, pathname, router])

  const isAdminRoute = pathname.startsWith('/admin')
  const isPayrollRoute = pathname.startsWith('/payroll')
  const showExcelTabBar = !isAdminRoute && (!isQualityController || !isPayrollRoute)

  return (
    <div
      className={cn(
        'flex flex-1 flex-col min-w-0 transition-all duration-300 ease-in-out',
        isAdminRoute ? 'lg:pl-0' : isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      )}
    >
      <Header />
      {showExcelTabBar && <ExcelSheetTabBar />}
      <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isLoading, isLoggingOut } = useAuth()
  const router = useRouter()

  const isPublicLandingPage = pathname === '/'
  const isLoginPage = pathname === '/login'

  useEffect(() => {
    if (!isLoading && !user && !isLoginPage && !isPublicLandingPage) {
      router.replace('/login')
    }
  }, [user, isLoading, isLoginPage, isPublicLandingPage, router])

  return (
    <>
      {/* Global Smooth Logout Loader */}
      {isLoggingOut && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 text-center max-w-xs mx-4">
            <div className="size-10 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">Signing Out...</h3>
              <p className="text-xs text-slate-400 mt-1">Clearing secure ERP session</p>
            </div>
          </div>
        </div>
      )}

      {isLoginPage || isPublicLandingPage ? (
        children
      ) : isLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Loading Sara Textile ERP...
            </span>
          </div>
        </div>
      ) : (
        <SidebarProvider>
          <div className="flex min-h-screen bg-background font-sans text-foreground antialiased selection:bg-blue-500/20 selection:text-blue-700">
            <Sidebar />
            <MainContent>{children}</MainContent>
          </div>
        </SidebarProvider>
      )}
    </>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  )
}
