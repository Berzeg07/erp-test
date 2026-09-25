import type { AuthLogin, AuthUser } from '@app/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  fetchMeRequest,
  loginRequest,
  logoutRequest,
} from '@/entities/session/api/auth-api'
import {
  clearTokens,
  readRefreshToken,
  readToken,
  saveTokens,
} from '@/shared/config/auth'

export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const user = ref<AuthUser | null>(null)
  const isAuthenticated = computed(() => Boolean(token.value))

  function hydrate(): void {
    token.value = readToken()
    refreshToken.value = readRefreshToken()
  }

  async function login(credentials: AuthLogin): Promise<void> {
    const session = await loginRequest(credentials)
    token.value = session.token
    refreshToken.value = session.refreshToken
    user.value = session.user
    saveTokens(session.token, session.refreshToken)
  }

  async function fetchMe(): Promise<void> {
    if (!token.value) return
    try {
      user.value = await fetchMeRequest()
      token.value = readToken()
      refreshToken.value = readRefreshToken()
    } catch (error) {
      clearSession()
      throw error
    }
  }

  async function logout(): Promise<void> {
    try {
      if (token.value) await logoutRequest(refreshToken.value)
    } finally {
      clearSession()
    }
  }

  function clearSession(): void {
    token.value = null
    refreshToken.value = null
    user.value = null
    clearTokens()
  }

  return {
    token,
    refreshToken,
    user,
    isAuthenticated,
    hydrate,
    login,
    logout,
    fetchMe,
  }
})
