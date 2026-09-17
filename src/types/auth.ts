export type UserRole = 'admin' | 'accountant' | 'quality_controller' | string

export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface RoleOption {
  id: string
  key: string
  label: string
  department?: string | null
  description?: string | null
  canSignup: boolean
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  roleLabel: string
  roleId?: string | null
  avatar?: string
  department: string
  status?: UserStatus
  isActive?: boolean
  createdAt?: string | Date
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}
