<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/entities/workspace'
import { SceneAlert } from '@/shared/ui/scene-alert'

const router = useRouter()
const workspace = useWorkspaceStore()
const confirm = ref(false)

async function reset(): Promise<void> {
  if (!confirm.value) {
    confirm.value = true
    return
  }
  try {
    await workspace.resetTenant()
    confirm.value = false
    await router.push('/')
  } catch {
    confirm.value = true
  }
}
</script>

<template>
  <div>
    <SceneAlert
      title="Сцена: сброс квартиры → нули"
      text="Только текущий tenant в шапке. Сосед, логин и suppression не трогаем. После сброса — Обзор с нулями, затем Импорт."
    />

    <v-card variant="outlined">
      <v-card-text class="text-body-1">
        <p>
          Очистить воронку <strong>{{ workspace.tenantSlug }}</strong>: raw, карточки, черновики, outbox,
          ответы, mock CRM, DLQ, рубильник, бюджет токенов.
        </p>
        <v-btn
          class="mt-4"
          :color="confirm ? 'error' : 'secondary'"
          :loading="workspace.loading"
          @click="reset"
        >
          {{ confirm ? `Подтвердить сброс ${workspace.tenantSlug}` : 'Очистить воронку этой квартиры' }}
        </v-btn>
      </v-card-text>
    </v-card>
  </div>
</template>
