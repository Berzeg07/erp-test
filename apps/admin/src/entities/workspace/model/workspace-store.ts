import type { Metrics, TenantSlug } from '@app/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchMetrics, resetDemo, setKillSwitch as postKillSwitch } from '@/entities/leads/api'
import { killSwitchMismatchMessage } from '@/entities/workspace/model/kill-switch-copy'
import { readTenantSlug, saveTenantSlug } from '@/shared/config/tenant'

export type FunnelSnapshot = {
  imported: number
  unique: number
  review: number
  blocked: number
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const tenantSlug = ref<TenantSlug>(readTenantSlug())
  const metrics = ref<Metrics | null>(null)
  const loading = ref(false)
  const error = ref('')

  const killSwitchOn = computed(() => metrics.value?.killSwitchOn ?? false)
  const killSwitchReason = computed(() => metrics.value?.killSwitchReason ?? null)
  const imported = computed(() => metrics.value?.imported ?? 0)
  const unique = computed(() => metrics.value?.uniqueLeads ?? 0)
  const blocked = computed(() => metrics.value?.blocked ?? 0)

  function snapshot(): FunnelSnapshot {
    return {
      imported: metrics.value?.imported ?? 0,
      unique: metrics.value?.uniqueLeads ?? 0,
      review: metrics.value?.manualReview ?? 0,
      blocked: metrics.value?.blocked ?? 0,
    }
  }

  function setTenant(slug: TenantSlug): void {
    tenantSlug.value = slug
    saveTenantSlug(slug)
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      metrics.value = await fetchMetrics()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'metrics failed'
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function resetTenant(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      metrics.value = await resetDemo()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'reset failed'
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function setKillSwitch(on: boolean): Promise<void> {
    loading.value = true
    try {
      await postKillSwitch(on, on ? 'manual' : undefined)
      metrics.value = await fetchMetrics()
      error.value = killSwitchMismatchMessage(
        on,
        metrics.value.killSwitchOn,
        metrics.value.killSwitchReason,
      )
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'kill-switch failed'
      throw cause
    } finally {
      loading.value = false
    }
  }

  return {
    tenantSlug,
    metrics,
    loading,
    error,
    killSwitchOn,
    killSwitchReason,
    imported,
    unique,
    blocked,
    snapshot,
    setTenant,
    refresh,
    resetTenant,
    setKillSwitch,
  }
})
