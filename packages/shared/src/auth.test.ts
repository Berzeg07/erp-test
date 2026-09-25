import { describe, expect, it } from 'vitest'
import { AuthLoginSchema, AuthUserSchema, UserRoleSchema } from './auth.js'

describe('auth schemas', () => {
  it('accepts valid login', () => {
    const parsed = AuthLoginSchema.parse({
      email: 'admin@app.local',
      password: 'admin12345',
    })
    expect(parsed.email).toBe('admin@app.local')
  })

  it('rejects short password', () => {
    expect(() =>
      AuthLoginSchema.parse({
        email: 'admin@app.local',
        password: 'short',
      }),
    ).toThrow()
  })

  it('accepts roles', () => {
    expect(UserRoleSchema.parse('admin')).toBe('admin')
    expect(UserRoleSchema.parse('user')).toBe('user')
  })

  it('accepts auth user', () => {
    const user = AuthUserSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@app.local',
      displayName: 'Admin',
      role: 'admin',
    })
    expect(user.role).toBe('admin')
  })
})
