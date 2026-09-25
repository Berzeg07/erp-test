import type { AuthRefreshResponse } from '@app/shared'
import { apiUrl } from '@/shared/config/env'
import {
  clearTokens,
  readRefreshToken,
  readToken,
  saveTokens,
} from '@/shared/config/auth'
import { readTenantSlug } from '@/shared/config/tenant'

let refreshRequest: Promise<boolean> | null = null

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(`${statusCode} ${code}`)
    this.name = 'ApiError'
  }
}

export function applyTenantHeader(headers: Headers): void {
  if (headers.has('X-Tenant-Id')) return
  headers.set('X-Tenant-Id', readTenantSlug())
}

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
  applyTenantHeader(headers)
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
    const code =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : `HTTP_${response.status}`
    throw new ApiError(code, response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
