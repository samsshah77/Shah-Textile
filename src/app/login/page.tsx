'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  Briefcase,
  User as UserIcon,
  ShieldAlert,
  CheckCircle2,
  Building2,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { RoleOption } from '@/types/auth'
import { AlertModal, ModalType } from '@/components/ui/AlertModal'

function LoginForm() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Immediately redirect if already authenticated (prevents Back button returning to login)
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const redirectPath = searchParams.get('redirect') || '/floor/production'
      router.replace(redirectPath)
    }
  }, [isLoading, isAuthenticated, router, searchParams])

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  // Sign In Form State
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')
  const [showSignInPassword, setShowSignInPassword] = useState(false)

  // Sign Up Form State
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupRoleKey, setSignupRoleKey] = useState('')
  const [showSignupPassword, setShowSignupPassword] = useState(false)

  // Dynamic Roles
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)

  // Loading State
  const [loading, setLoading] = useState(false)

  // Custom Modal State for Error and Success handling
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    type: ModalType
    title: string
    message: string
    confirmText?: string
    onConfirm?: () => void
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  })

  const showAlert = (type: ModalType, title: string, message: string, onConfirm?: () => void) => {
    setModalState({
      isOpen: true,
      type,
      title,
      message,
      confirmText: 'Continue',
      onConfirm: onConfirm || (() => setModalState((prev) => ({ ...prev, isOpen: false }))),
    })
  }

  // Fetch signup roles dynamically from API
  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await fetch('/api/roles')
        const data = await res.json()
        if (data.success && Array.isArray(data.roles)) {
          const signupRoles = data.roles.filter((r: RoleOption) => r.canSignup)
          setAvailableRoles(signupRoles)
          if (signupRoles.length > 0) {
            setSignupRoleKey(signupRoles[0].key)
          }
        }
      } catch (err) {
        console.error('Failed to load roles:', err)
      } finally {
        setLoadingRoles(false)
      }
    }
    fetchRoles()
  }, [])

  // Handle Sign In Submit
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!signInEmail.trim() || !signInPassword.trim()) {
      showAlert('warning', 'Missing Credentials', 'Please enter both your registered email address and password.')
      return
    }

    setLoading(true)
    const res = await login(signInEmail, signInPassword)
    setLoading(false)

    if (!res.success) {
      const errorMsg = res.error || 'Authentication failed.'
      if (errorMsg.includes('pending approval')) {
        showAlert('warning', 'Account Pending Approval', errorMsg)
      } else {
        showAlert('error', 'Sign In Failed', errorMsg)
      }
    }
  }

  // Handle Sign Up Submit
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!signupName.trim()) {
      showAlert('warning', 'Full Name Required', 'Please enter your full official name.')
      return
    }

    if (!signupEmail.trim() || !signupEmail.includes('@')) {
      showAlert('warning', 'Valid Email Required', 'Please enter a valid company or personal email address.')
      return
    }

    if (!signupPassword || signupPassword.length < 6) {
      showAlert('warning', 'Password Too Short', 'Password must be at least 6 characters in length.')
      return
    }

    if (!signupRoleKey) {
      showAlert('warning', 'Role Required', 'Please select a designated mill department role for your account.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          password: signupPassword,
          roleKey: signupRoleKey,
        }),
      })

      const data = await res.json()
      setLoading(false)

      if (!res.ok || !data.success) {
        showAlert('error', 'Registration Error', data.error || 'Registration could not be completed.')
      } else {
        const registeredEmail = signupEmail
        setSignupName('')
        setSignupEmail('')
        setSignupPassword('')

        showAlert(
          'success',
          'Registration Submitted Successfully!',
          data.message || 'Your staff registration has been sent to the Main Admin for authorization. You will be able to log in once approved.',
          () => {
            setModalState((prev) => ({ ...prev, isOpen: false }))
            setMode('signin')
            setSignInEmail(registeredEmail)
          }
        )
      }
    } catch (err: any) {
      setLoading(false)
      showAlert('error', 'Connection Error', err.message || 'Failed to connect to authentication server.')
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-[#0066cc]/20 selection:text-[#0066cc]">
      {/* Background soft ambient accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 size-96 rounded-full bg-[#0066cc]/5 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 size-96 rounded-full bg-blue-500/5 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 size-96 rounded-full bg-[#0066cc]/5 blur-[120px]" />
      </div>

      {/* Top Navigation Bar with Official Mill Brand */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-3.5 sm:py-4 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-xs p-1">
            <img src="/saralogo.webp" alt="Sara Textile Logo" className="size-full object-contain" />
          </div>
          <div>
            <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900">SARA TEXTILE</span>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              Weaving Mill Enterprise System
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
          <span className="inline-flex size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[11px] sm:text-xs text-slate-700">34 Active Looms </span>
        </div>
      </header>

      {/* Main Centered Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-lg">

          {/* Main Authentication Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-9 shadow-xl shadow-slate-200/50 space-y-6">

            {/* Header: Centered Logo & Title */}
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-xs p-2">
                <img src="/saralogo.webp" alt="Sara Textile Logo" className="size-full object-contain" />
              </div>
              <div className="space-y-0.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  {mode === 'signin' ? 'Sign In to ERP Portal' : 'Register Staff Account'}
                </h1>
                <p className="text-xs text-slate-500">
                  {mode === 'signin'
                    ? 'Enter your verified mill credentials to access your designated workspace.'
                    : 'Submit your profile for administrative review and authorization.'}
                </p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-100 border border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === 'signin'
                  ? 'bg-[#0066cc] text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <LogIn className="size-4 shrink-0" />
                <span>Sign In</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${mode === 'signup'
                  ? 'bg-[#0066cc] text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <UserPlus className="size-4 shrink-0" />
                <span>Create Account</span>
              </button>
            </div>

            {/* SIGN IN FORM */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 size-4 text-slate-400" />
                    <input
                      type="email"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="name@saratextile.com"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0066cc] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/15 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 size-4 text-slate-400" />
                    <input
                      type={showSignInPassword ? 'text' : 'password'}
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0066cc] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/15 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignInPassword(!showSignInPassword)}
                      className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showSignInPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0066cc] hover:bg-[#0052a3] py-3 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 mt-2"
                >
                  <span>{loading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
                  <ArrowRight className="size-4" />
                </button>
              </form>
            )}

            {/* SIGN UP FORM */}
            {mode === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Full Name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 size-4 text-slate-400" />
                    <input
                      type="text"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="e.g. Asif Khan"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0066cc] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/15 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 size-4 text-slate-400" />
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="e.g. asif@saratextile.com"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0066cc] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/15 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Designated Mill Department / Role</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3.5 top-3 size-4 text-slate-400" />
                    <select
                      value={signupRoleKey}
                      onChange={(e) => setSignupRoleKey(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs text-slate-900 focus:bg-white focus:border-[#0066cc] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/15 transition-all cursor-pointer"
                      required
                    >
                      {availableRoles.map((r) => (
                        <option key={r.key} value={r.key} className="bg-white text-slate-900">
                          {r.label} ({r.department || 'Sara Textile'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Roles and access permissions are configured dynamically by the Administrator.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Create Password (Min 6 characters)</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 size-4 text-slate-400" />
                    <input
                      type={showSignupPassword ? 'text' : 'password'}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Create a secure password"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0066cc] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/15 transition-all"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showSignupPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0066cc] hover:bg-[#0052a3] py-3 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 mt-2"
                >
                  <span>{loading ? 'Submitting Registration...' : 'Register for Admin Approval'}</span>
                  <UserPlus className="size-4" />
                </button>
              </form>
            )}

            {/* Enterprise Security Notice */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 text-center">
              <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" />
              <span>Enterprise Grade Security • 256-Bit TLS Encrypted Portal</span>
            </div>

          </div>

          {/* Bottom Security Notice */}
          <div className="mt-4 text-center text-xs text-slate-500">
            <p>
              New accounts require authorization by Mill Administration before workspace access is unlocked.
            </p>
          </div>

        </div>
      </main>

      {/* Custom Alert Modal */}
      <AlertModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={modalState.onConfirm}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
      />

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 text-xs text-slate-500 border-t border-slate-200/80 bg-white/80">
        Sara Textile ERP &copy; {new Date().getFullYear()} • Proprietary Weaving Mill Management System
      </footer>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center text-xs text-slate-500">
          Loading Sara Textile Security Portal...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
