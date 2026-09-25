import { z } from 'zod'

export const UserRoleSchema = z.enum(['user', 'moderator', 'admin'])
export type UserRole = z.infer<typeof UserRoleSchema>

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  role: UserRoleSchema,
})
export type AuthUser = z.infer<typeof AuthUserSchema>

export const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})
export type AuthLogin = z.infer<typeof AuthLoginSchema>

export const AuthRefreshSchema = z.object({
  refreshToken: z.string().min(1),
})
export type AuthRefresh = z.infer<typeof AuthRefreshSchema>

export const AuthSessionSchema = z.object({
  token: z.string().min(1),
  refreshToken: z.string().min(1),
  user: AuthUserSchema,
})
export type AuthSession = z.infer<typeof AuthSessionSchema>

export const AuthRefreshResponseSchema = z.object({
  token: z.string().min(1),
  refreshToken: z.string().min(1),
  user: AuthUserSchema,
})
export type AuthRefreshResponse = z.infer<typeof AuthRefreshResponseSchema>

export const HealthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
})
export type Health = z.infer<typeof HealthSchema>
