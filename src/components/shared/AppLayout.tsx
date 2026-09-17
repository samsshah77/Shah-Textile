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
      if (pathname.startsWith('/payroll') || pathname.startsWith('/accounts') || pathname === '/') {
        router.replace('/floor/production')
      }
    }
  }, [isQualityController, pathname, router])

  const isAdminRoute = pathname.startsWith('/admin')
  const isPayrollRoute = pathname.startsWith('/payroll') || pathname === '/'
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
  const { user, isLoading } = useAuth()
  const router = useRouter()

  const isLoginPage = pathname === '/login'

  useEffect(() => {
    if (!isLoading && !user && !isLoginPage) {
      router.replace('/login')
    }
  }, [user, isLoading, isLoginPage, router])

  if (isLoginPage) {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Loading Sara Textile ERP...
          </span>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background font-sans text-foreground antialiased selection:bg-blue-500/20 selection:text-blue-700">
        <Sidebar />
        <MainContent>{children}</MainContent>
      </div>
    </SidebarProvider>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  )
}
