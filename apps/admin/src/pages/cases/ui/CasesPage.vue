<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { LeadCaseSummary } from '@app/shared'
import { listCases } from '@/entities/leads/api'
import {
  caseListBadge,
  caseMatchesFilter,
  type CaseListFilter,
} from '@/entities/leads/model/case-filters'
import { useWorkspaceStore } from '@/entities/workspace'
import { SceneAlert } from '@/shared/ui/scene-alert'

const workspace = useWorkspaceStore()
const rows = ref<LeadCaseSummary[]>([])
const filter = ref<CaseListFilter>('all')
const error = ref('')
const loading = ref(false)

const filters: { value: CaseListFilter; title: string }[] = [
  { value: 'all', title: 'все' },
  { value: 'duplicate', title: 'дубли' },
  { value: 'injection', title: 'injection' },
  { value: 'blocked', title: 'blocked' },
  { value: 'qualify', title: 'чистый QUALIFY' },
]

const visible = computed(() => rows.value.filter((row) => caseMatchesFilter(row, filter.value)))

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const listed = await listCases()
    rows.value = listed.cases
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'cases failed'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch(
  () => workspace.tenantSlug,
  () => {
    void load()
  },
)

function statusColor(status: string): string {
  if (status === 'QUALIFY') return 'success'
  if (status === 'REJECT') return 'error'
  return 'warning'
}

function guardColor(guard: string): string {
  return guard === 'CLEAR' ? 'success' : 'error'
}
</script>

<template>
  <div>
    <SceneAlert
      title="Сцена: список карточек"
      text="Чипы status и deliveryGuard раздельно. Фильтры: дубль / injection / blocked / чистый QUALIFY."
    />

    <v-chip-group v-model="filter" class="mb-4" selected-class="text-primary" mandatory>
      <v-chip v-for="item in filters" :key="item.value" :value="item.value" filter>
        {{ item.title }}
      </v-chip>
    </v-chip-group>

    <v-alert v-if="error" class="mb-4" type="error">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-list lines="two">
      <v-list-item
        v-for="row in visible"
        :key="row.id"
        :title="`${row.person.displayName ?? '—'} · ${row.company.name}`"
        :subtitle="`${row.person.emailNormalized ?? 'no email'} · склеено по ${row.mergeBy} · raw ${row.rawCount}`"
        :to="`/leads/${row.id}`"
      >
        <template #prepend>
          <v-chip class="mr-2" size="small" label>{{ caseListBadge(row) }}</v-chip>
        </template>
        <template #append>
          <v-chip class="mr-2" size="small" :color="statusColor(row.status)" label>
            {{ row.status }}
          </v-chip>
          <v-chip size="small" :color="guardColor(row.deliveryGuard)" label>
            {{ row.deliveryGuard }}
          </v-chip>
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>
