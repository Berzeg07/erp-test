import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/http'
import { crmSyncUrl, isSimulatedCrmFault } from './api'

describe('leads CRM client helpers', () => {
  it('puts simulated fault on the query string so Vite proxy cannot drop the header', () => {
    expect(crmSyncUrl()).toBe('/crm/sync')
    expect(crmSyncUrl('500')).toBe('/crm/sync?fault=500')
    expect(crmSyncUrl('429')).toBe('/crm/sync?fault=429')
  })

  it('treats CRM_5XX / CRM_429 as the mock fault, not a broken button', () => {
    expect(isSimulatedCrmFault(new ApiError('CRM_5XX', 502))).toBe(true)
    expect(isSimulatedCrmFault(new ApiError('CRM_429', 429))).toBe(true)
    expect(isSimulatedCrmFault(new ApiError('APPROVAL_REQUIRED', 409))).toBe(false)
    expect(isSimulatedCrmFault(new Error('502 CRM_5XX'))).toBe(false)
  })
})
