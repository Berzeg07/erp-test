<script setup lang="ts">
import { ref } from 'vue'
import { importCsvPipeline, importFixturePipeline } from '@/entities/leads/api'
import { useWorkspaceStore, type FunnelSnapshot } from '@/entities/workspace'
import { SceneAlert } from '@/shared/ui/scene-alert'

const workspace = useWorkspaceStore()
const loading = ref(false)
const error = ref('')
const before = ref<FunnelSnapshot | null>(null)
const after = ref<FunnelSnapshot | null>(null)
const accepted = ref<number | null>(null)
const cases = ref<number | null>(null)

async function runImport(fn: () => Promise<{ imported: { accepted: number }; resolved: { cases: number } }>): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await workspace.refresh()
    before.value = workspace.snapshot()
    const result = await fn()
    accepted.value = result.imported.accepted
    cases.value = result.resolved.cases
    await workspace.refresh()
    after.value = workspace.snapshot()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'import failed'
  } finally {
    loading.value = false
  }
}

function loadFixture(): void {
  void runImport(() => importFixturePipeline())
}

async function onCsv(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const csv = await file.text()
  await runImport(() => importCsvPipeline(csv))
  input.value = ''
}
</script>

<template>
  <div>
    <SceneAlert
      title="Сцена: импорт CSV → дедуп"
      text="Фикстура или CSV. После resolve: raw → unique, из них review и blocked. Импорт жив даже при kill-switch ON."
    />

    <div class="d-flex flex-wrap ga-3 mb-6">
      <v-btn color="primary" :loading="loading" @click="loadFixture">
        Загрузить фикстуру
      </v-btn>
      <v-btn color="secondary" variant="tonal" :disabled="loading">
        <label class="csv-label">
          Импорт CSV
          <input type="file" accept=".csv,text/csv" hidden @change="onCsv" />
        </label>
      </v-btn>
    </div>

    <v-alert v-if="error" class="mb-4" type="error" prominent>
      {{ error }}
    </v-alert>

    <v-card v-if="before && after" variant="outlined">
      <v-card-title>До → после</v-card-title>
      <v-card-text class="text-h6">
        <p>До: raw {{ before.imported }} → unique {{ before.unique }}, из них review {{ before.review }}, blocked {{ before.blocked }}</p>
        <p class="mt-3">
          После: raw {{ after.imported }} → unique {{ after.unique }}, из них review {{ after.review }}, blocked {{ after.blocked }}
        </p>
        <p v-if="accepted !== null" class="text-body-1 mt-3">
          Принято строк: {{ accepted }} · карточек после дедупа: {{ cases }}
        </p>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped lang="scss">
.csv-label {
  cursor: pointer;
}
</style>
