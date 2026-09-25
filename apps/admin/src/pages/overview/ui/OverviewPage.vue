<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/entities/workspace'
import { SceneAlert } from '@/shared/ui/scene-alert'

const workspace = useWorkspaceStore()
const { metrics, killSwitchOn, tenantSlug } = storeToRefs(workspace)
</script>

<template>
  <div>
    <SceneAlert
      title="Сцена: обзор SYNTHETIC · два tenant · рубильник"
      text="Липкая шапка всегда в кадре. Дальше: Импорт → Кейсы → Метрики. Соседний tenant — переключатель сверху."
    />

    <v-card class="mb-4" variant="outlined">
      <v-card-text class="text-body-1">
        Tenant: <strong>{{ tenantSlug }}</strong>
        · kill-switch <strong>{{ killSwitchOn ? 'ON' : 'OFF' }}</strong>
        · SYNTHETIC DATA
      </v-card-text>
    </v-card>

    <v-row dense>
      <v-col cols="12" md="4">
        <v-card variant="tonal">
          <v-card-title>imported</v-card-title>
          <v-card-text class="text-h4">{{ metrics?.imported ?? 0 }}</v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="tonal">
          <v-card-title>unique</v-card-title>
          <v-card-text class="text-h4">{{ metrics?.uniqueLeads ?? 0 }}</v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="tonal">
          <v-card-title>blocked</v-card-title>
          <v-card-text class="text-h4">{{ metrics?.blocked ?? 0 }}</v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <p class="text-body-1 mt-6">
      Скринкаст: импорт фикстуры → дубль → injection (Draft серый) → чистый QUALIFY → Send без approve →
      approve → правка v2 → send MOCK-SENT → повтор тот же id → reply → opt_out → CRM 500 → reprocess →
      метрики → kill-switch ON → tenant neighbour.
    </p>
  </div>
</template>
