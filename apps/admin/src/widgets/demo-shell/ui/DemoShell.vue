<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DEMO_TENANTS } from '@/shared/config/tenant'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const workspace = useWorkspaceStore()

const nav = [
  { to: '/', title: 'Обзор', exact: true },
  { to: '/import', title: 'Импорт' },
  { to: '/leads', title: 'Кейсы' },
  { to: '/funnel', title: 'Метрики' },
]

const killLabel = computed(() => (workspace.killSwitchOn ? 'ON' : 'OFF'))
const killColor = computed(() => (workspace.killSwitchOn ? 'error' : 'success'))

onMounted(() => {
  void workspace.refresh().catch(() => undefined)
})

watch(
  () => workspace.tenantSlug,
  () => {
    void workspace.refresh().catch(() => undefined)
  },
)

async function onTenant(slug: unknown): Promise<void> {
  if (slug !== 'athenai_demo' && slug !== 'proshelf_demo') return
  workspace.setTenant(slug)
  if (route.path.startsWith('/leads/') && route.path !== '/leads') {
    await router.push('/leads')
  }
}

async function onKillSwitch(on: boolean): Promise<void> {
  try {
    await workspace.setKillSwitch(on)
  } catch {
    // текст ошибки уже в шапке / плашке
  }
}

async function logout(): Promise<void> {
  await session.logout()
  await router.push('/login')
}
</script>

<template>
  <div>
    <v-app-bar app flat class="demo-bar" height="72">
      <v-chip class="ml-2 mr-3" color="warning" variant="flat" label>
        SYNTHETIC DATA
      </v-chip>

      <v-select
        :model-value="workspace.tenantSlug"
        :items="DEMO_TENANTS"
        item-title="label"
        item-value="slug"
        label="Tenant"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 220px"
        @update:model-value="onTenant"
      />

      <v-btn
        class="mx-4"
        :color="killColor"
        variant="flat"
        :loading="workspace.loading"
        @click="onKillSwitch(!workspace.killSwitchOn)"
      >
        Kill-switch {{ killLabel }}
      </v-btn>
      <span v-if="workspace.killSwitchReason" class="text-caption mr-4">
        {{ workspace.killSwitchReason }}
      </span>

      <div class="demo-counts text-body-1 font-weight-medium">
        imported {{ workspace.imported }}
        <span class="mx-2">·</span>
        unique {{ workspace.unique }}
        <span class="mx-2">·</span>
        blocked {{ workspace.blocked }}
      </div>

      <v-spacer />
      <span class="text-caption mr-3">{{ session.user?.displayName }}</span>
      <v-btn variant="text" @click="logout">Выйти</v-btn>
    </v-app-bar>

    <v-navigation-drawer app permanent width="220">
      <v-list nav>
        <v-list-item
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          :exact="item.exact"
          :title="item.title"
        />
        <v-list-item href="/docs" target="_blank" title="OpenAPI /docs" />
      </v-list>
      <v-divider />
      <v-list nav>
        <v-list-subheader>Техническое</v-list-subheader>
        <v-list-item to="/tech" title="Сброс данных" />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <div class="demo-main pa-6">
        <v-alert
          v-if="workspace.error"
          class="mb-4"
          type="error"
          variant="tonal"
        >
          {{ workspace.error }}
        </v-alert>
        <router-view />
      </div>
    </v-main>
  </div>
</template>

<style scoped lang="scss">
.demo-bar {
  border-bottom: 1px solid $color-border;
}

.demo-counts {
  white-space: nowrap;
}

.demo-main {
  max-width: to-rem(1100);
}
</style>
