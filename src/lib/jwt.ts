import { SignJWT, jwtVerify } from 'jose'
import { UserRole } from '@/types/auth'

const JWT_SECRET = process.env.JWT_SECRET || 'sara_textile_super_secure_jwt_secret_key_2026'
const secretKey = new TextEncoder().encode(JWT_SECRET)

export interface JWTPayload {
  userId: string
  email: string
  name: string
  role: UserRole
  roleLabel: string
  department?: string
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}
