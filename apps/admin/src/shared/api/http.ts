import type { AuthRefreshResponse } from '@app/shared'
import { apiUrl } from '@/shared/config/env'
import {
  clearTokens,
  readRefreshToken,
  readToken,
  saveTokens,
} from '@/shared/config/auth'

let refreshRequest: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  const refreshToken = readRefreshToken()
  if (!refreshToken) return false

  const response = await fetch(`${apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) {
    clearTokens()
    return false
  }

  const session = (await response.json()) as AuthRefreshResponse
  saveTokens(session.token, session.refreshToken)
  return true
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  canRetry = true,
): Promise<T> {
  const headers = new Headers(init.headers)
  const token = readToken()

  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers })

  if (response.status === 401 && canRetry && readRefreshToken()) {
    refreshRequest ??= refreshSession().finally(() => {
      refreshRequest = null
    })
    if (await refreshRequest) return apiFetch<T>(path, init, false)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
