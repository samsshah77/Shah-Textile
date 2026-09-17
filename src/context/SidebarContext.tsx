'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface SidebarContextType {
  isOpen: boolean
  isCollapsed: boolean
  isMobileOpen: boolean
  toggleOpen: () => void
  toggleCollapse: () => void
  toggleMobileSidebar: () => void
  openMobileSidebar: () => void
  closeMobileSidebar: () => void
  setIsOpen: (val: boolean) => void
  setIsCollapsed: (val: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sara_sidebar_collapsed')
      if (saved !== null) {
        setIsCollapsed(saved === 'true')
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('sara_sidebar_collapsed', String(next))
      } catch (e) {}
      return next
    })
  }

  const toggleOpen = () => setIsOpen((prev) => !prev)
  const toggleMobileSidebar = () => setIsMobileOpen((prev) => !prev)
  const openMobileSidebar = () => setIsMobileOpen(true)
  const closeMobileSidebar = () => setIsMobileOpen(false)

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        isCollapsed,
        isMobileOpen,
        toggleOpen,
        toggleCollapse,
        toggleMobileSidebar,
        openMobileSidebar,
        closeMobileSidebar,
        setIsOpen,
        setIsCollapsed,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
