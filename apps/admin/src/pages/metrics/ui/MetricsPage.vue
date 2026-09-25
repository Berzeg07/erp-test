<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/entities/workspace'
import { SceneAlert } from '@/shared/ui/scene-alert'

const workspace = useWorkspaceStore()
const { metrics } = storeToRefs(workspace)

const rows = computed(() => {
  const data = metrics.value
  if (!data) return []
  return [
    ['imported', data.imported],
    ['uniqueLeads', data.uniqueLeads],
    ['qualified', data.qualified],
    ['manualReview', data.manualReview],
    ['blocked', data.blocked],
    ['drafts', data.drafts],
    ['approvals', data.approvals],
    ['mockSent', data.mockSent],
    ['replies', data.replies],
    ['meetings', data.meetings],
    ['payments', data.payments],
    ['expenses', data.expenses],
    ['humanMinutes', data.humanMinutes],
    ['costPerLead', data.costPerLead],
    ['costPerMeeting', data.costPerMeeting],
    ['cac', data.cac],
    ['killSwitchOn', data.killSwitchOn ? 'ON' : 'OFF'],
    ['killSwitchReason', data.killSwitchReason ?? '—'],
  ] as const
})
</script>

<template>
  <div>
    <SceneAlert
      title="Сцена: метрики воронки (SYNTHETIC)"
      text="Все подписи из ТЗ. Цифры синтетические, не выручка."
    />

    <v-chip class="mb-4" color="warning" variant="flat" label>SYNTHETIC</v-chip>

    <v-table v-if="metrics">
      <thead>
        <tr>
          <th>Поле</th>
          <th>Значение</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row[0]">
          <td>{{ row[0] }}</td>
          <td class="font-weight-medium">{{ row[1] }}</td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>
