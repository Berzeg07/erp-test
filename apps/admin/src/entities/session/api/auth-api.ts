import type { AuthLogin, AuthSession, AuthUser } from '@app/shared'
import { apiFetch } from '@/shared/api/http'

export function loginRequest(credentials: AuthLogin): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function fetchMeRequest(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me')
}

export function logoutRequest(refreshToken: string | null): Promise<void> {
  return apiFetch<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  })
}
