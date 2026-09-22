import { User, UserRole } from '@/types/auth'

export const DEMO_USERS: Record<string, User & { passwordHash: string }> = {
  'javed@saratextile.com': {
    id: 'usr_admin_javed',
    name: 'Javed Sir',
    email: 'javed@saratextile.com',
    role: 'admin',
    roleLabel: 'Main Admin',
    department: 'Executive Management',
    passwordHash: 'admin123',
  },
  'admin@saratextile.com': {
    id: 'usr_admin_javed',
    name: 'Javed Sir',
    email: 'admin@saratextile.com',
    role: 'admin',
    roleLabel: 'Main Admin',
    department: 'Executive Management',
    passwordHash: 'admin123',
  },
  'tufail@saratextile.com': {
    id: 'usr_acc_tufail',
    name: 'Tufail',
    email: 'tufail@saratextile.com',
    role: 'accountant',
    roleLabel: 'Accountant',
    department: 'Accounts & Payroll',
    passwordHash: 'rYVCEJjdXcvz88KyggaAQ0DLC4X2pCFx',
  },
  'accountant@saratextile.com': {
    id: 'usr_acc_tufail',
    name: 'Tufail',
    email: 'accountant@saratextile.com',
    role: 'accountant',
    roleLabel: 'Accountant',
    department: 'Accounts & Payroll',
    passwordHash: 'rYVCEJjdXcvz88KyggaAQ0DLC4X2pCFx',
  },
  'ahmer@saratextile.com': {
    id: 'usr_qc_ahmer',
    name: 'Ahmer',
    email: 'ahmer@saratextile.com',
    role: 'quality_controller',
    roleLabel: 'Quality Controller',
    department: 'Floor & Quality Control',
    passwordHash: 'ahmer123',
  },
  'qc@saratextile.com': {
    id: 'usr_qc_ahmer',
    name: 'Ahmer',
    email: 'qc@saratextile.com',
    role: 'quality_controller',
    roleLabel: 'Quality Controller',
    department: 'Floor & Quality Control',
    passwordHash: 'ahmer123',
  },
}

const STORAGE_KEY = 'sara_textile_auth_user'

export const authService = {
  getStoredUser(): User | null {
    if (typeof window === 'undefined') return null
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) return null
      return JSON.parse(data) as User
    } catch {
      return null
    }
  },

  setStoredUser(user: User | null) {
    if (typeof window === 'undefined') return
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  },

  async login(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (data.success && data.user) {
        this.setStoredUser(data.user)
        return { success: true, user: data.user }
      }

      // If server returned specific auth error
      if (!data.success && data.error) {
        return { success: false, error: data.error }
      }
    } catch (e) {
      console.warn('API login request error, checking local match:', e)
    }

    // Fallback if API route is not reachable
    const trimmedEmail = email.trim().toLowerCase()
    const matched = DEMO_USERS[trimmedEmail]

    if (!matched) {
      return { success: false, error: 'Invalid email address. Please use registered mill credentials.' }
    }

    if (matched.passwordHash !== password) {
      return { success: false, error: 'Incorrect password. Please try again.' }
    }

    const { passwordHash, ...user } = matched
    this.setStoredUser(user)
    return { success: true, user }
  },

  loginAsRole(role: UserRole): User {
    const found = Object.values(DEMO_USERS).find((u) => u.role === role)
    const target = found || DEMO_USERS['javed@saratextile.com']
    const { passwordHash, ...user } = target
    this.setStoredUser(user)
    return user
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    this.setStoredUser(null)
  },
}
