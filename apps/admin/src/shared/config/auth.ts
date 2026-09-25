export const AUTH_TOKEN_KEY = 'app_token'
export const AUTH_REFRESH_TOKEN_KEY = 'app_refresh_token'

export function readToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function readRefreshToken(): string | null {
  return localStorage.getItem(AUTH_REFRESH_TOKEN_KEY)
}

export function saveTokens(token: string, refreshToken: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken)
}

export function clearTokens(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY)
}
