<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type {
  CrmSnapshot,
  DlqItemPublic,
  DraftVersionPublic,
  InboundReplyPublic,
  LeadCaseDetail,
  ManagerTaskPublic,
  OutboxSendResult,
  PlannedReply,
} from '@app/shared'
import {
  approveDraft,
  createDraft,
  getCase,
  listDlq,
  listDrafts,
  listPayments,
  listTasks,
  patchDraft,
  postReply,
  isSimulatedCrmFault,
  qualifyCase,
  reprocessDlq,
  sendDraft,
  syncCrm,
  syncCrmFault,
} from '@/entities/leads/api'
import { isDuplicateCase, isInjectionCase } from '@/entities/leads/model/case-filters'
import { qualifyLlmMessage, type QualifyLlmAlert } from '@/entities/leads/model/qualify-copy'
import { useWorkspaceStore } from '@/entities/workspace'
import { SceneAlert } from '@/shared/ui/scene-alert'

const REPLY_TYPES: PlannedReply[] = [
  'positive',
  'negative',
  'neutral',
  'question',
  'opt_out',
  'out_of_office',
  'uncertain',
]

const route = useRoute()
const workspace = useWorkspaceStore()
const detail = ref<LeadCaseDetail | null>(null)
const draft = ref<DraftVersionPublic | null>(null)
const draftText = ref('')
const approvalRevoked = ref(false)
const sendResult = ref<OutboxSendResult | null>(null)
const crmNote = ref('')
const crmBusy = ref(false)
const qualifyNote = ref<QualifyLlmAlert | null>(null)
const qualifyBusy = ref(false)
const reply = ref<InboundReplyPublic | null>(null)
const tasks = ref<ManagerTaskPublic[]>([])
const payments = ref(0)
const crm = ref<CrmSnapshot | null>(null)
const dlq = ref<DlqItemPublic[]>([])
const actionError = ref('')
const loading = ref(false)
const blockedReason = computed(() => {
  const row = detail.value
  if (!row || row.deliveryGuard !== 'BLOCKED') return ''
  return `запрещено: ${row.deliveryGuardReason ?? 'BLOCKED'}`
})
const draftDisabled = computed(() => Boolean(blockedReason.value) || detail.value?.status !== 'QUALIFY')

const scene = computed(() => {
  const row = detail.value
  if (!row) return { title: 'Сцена: карточка кейса', text: '' }
  if (isInjectionCase(row)) {
    return {
      title: 'Сцена: injection',
      text: 'MANUAL_REVIEW + BLOCKED + prompt_injection. Draft и Send серые.',
    }
  }
  if (row.deliveryGuardReason === 'opt_out' || row.reasons.includes('opt_out')) {
    return {
      title: 'Сцена: opt-out',
      text: 'Guard → BLOCKED, задача закрыть контакт.',
    }
  }
  if (isDuplicateCase(row)) {
    return {
      title: 'Сцена: дедуп',
      text: `Две (или больше) raw-строки, одна LeadCase, склеено по ${row.mergeBy}.`,
    }
  }
  if (row.status === 'QUALIFY' && row.deliveryGuard === 'CLEAR') {
    return {
      title: 'Сцена: черновик',
      text: 'Текст письма только из evidence. version · approved yes/no. Send без approve → 409 на карточке.',
    }
  }
  return { title: 'Сцена: карточка кейса', text: `${row.status} · ${row.deliveryGuard}` }
})

const caseId = computed(() => String(route.params.id))

async function refreshSide(): Promise<void> {
  const id = caseId.value
  const [drafts, taskList, paymentList, dlqList] = await Promise.all([
    listDrafts(id).catch(() => null),
    listTasks(),
    listPayments(),
    listDlq(),
  ])
  const latest = drafts?.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null
  draft.value = latest
  if (latest) draftText.value = latest.body
  tasks.value = taskList.tasks.filter((item) => item.leadCaseId === id)
  payments.value = paymentList.payments.filter((item) => item.leadCaseId === id).length
  dlq.value = dlqList.items.filter((item) => item.leadCaseId === id && !item.resolvedAt)
}

async function load(): Promise<void> {
  loading.value = true
  actionError.value = ''
  try {
    detail.value = await getCase(caseId.value)
    await refreshSide()
    await workspace.refresh()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'load failed'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch([caseId, () => workspace.tenantSlug], () => {
  qualifyNote.value = null
  void load()
})

async function run(fn: () => Promise<void>): Promise<void> {
  actionError.value = ''
  try {
    await fn()
    await workspace.refresh()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'action failed'
  }
}

function qualify(): void {
  void (async () => {
    actionError.value = ''
    qualifyNote.value = null
    qualifyBusy.value = true
    try {
      const row = await qualifyCase(caseId.value)
      detail.value = row
      qualifyNote.value = qualifyLlmMessage(row.decision?.llmOutput ?? null)
      await workspace.refresh()
    } catch (cause) {
      qualifyNote.value = {
        text: cause instanceof Error ? cause.message : 'Qualify / LLM failed',
        type: 'error',
      }
    } finally {
      qualifyBusy.value = false
    }
  })()
}

function makeDraft(): void {
  void run(async () => {
    const created = await createDraft(caseId.value)
    draft.value = created
    draftText.value = created.body
    approvalRevoked.value = false
    sendResult.value = null
  })
}

function savePatch(): void {
  if (!draft.value) return
  void run(async () => {
    const next = await patchDraft(draft.value!.versionId, draftText.value)
    draft.value = next
    draftText.value = next.body
    approvalRevoked.value = true
    sendResult.value = null
  })
}

function approve(): void {
  if (!draft.value) return
  void run(async () => {
    draft.value = await approveDraft(draft.value!.versionId)
    approvalRevoked.value = false
  })
}

function send(): void {
  if (!draft.value) return
  void run(async () => {
    sendResult.value = await sendDraft(draft.value!.versionId)
  })
}

function sendReply(type: PlannedReply): void {
  void run(async () => {
    reply.value = await postReply(caseId.value, type)
    detail.value = await getCase(caseId.value)
    await refreshSide()
  })
}

function doCrm(): void {
  crmNote.value = ''
  void run(async () => {
    crm.value = await syncCrm(caseId.value)
    await refreshSide()
  })
}

function doCrmFault(): void {
  void (async () => {
    actionError.value = ''
    crmNote.value = ''
    crmBusy.value = true
    try {
      await syncCrmFault(caseId.value, '500')
      crmNote.value = 'Симуляция не сработала: CRM принял запись'
    } catch (cause) {
      if (isSimulatedCrmFault(cause)) {
        crmNote.value = `${cause.message} — deal не создан, строка в DLQ`
      } else {
        actionError.value = cause instanceof Error ? cause.message : 'CRM fault failed'
      }
    } finally {
      try {
        await refreshSide()
        await workspace.refresh()
      } catch {
        // карточка уже показывает crmNote / actionError
      }
      crmBusy.value = false
    }
  })()
}

function doReprocess(id: string): void {
  void run(async () => {
    crm.value = await reprocessDlq(id)
    await refreshSide()
  })
}
</script>

<template>
  <div>
    <SceneAlert :title="scene.title" :text="scene.text" />
    <v-progress-linear v-if="loading" class="mb-4" indeterminate />

    <v-alert v-if="actionError" class="mb-4" type="error" prominent>
      {{ actionError }}
    </v-alert>

    <template v-if="detail">
      <v-card class="mb-4" variant="outlined">
        <v-card-title class="d-flex flex-wrap align-center ga-2">
          {{ detail.person.displayName ?? '—' }} · {{ detail.company.name }}
          <v-chip :color="detail.status === 'QUALIFY' ? 'success' : 'warning'" label>
            {{ detail.status }}
          </v-chip>
          <v-chip :color="detail.deliveryGuard === 'CLEAR' ? 'success' : 'error'" label>
            {{ detail.deliveryGuard }}
          </v-chip>
        </v-card-title>
        <v-card-text class="text-body-1">
          <p>склеено по {{ detail.mergeBy }} · raw {{ detail.rawCount }} · basis {{ detail.processingBasis }}</p>
          <p v-if="detail.conflicts.length">conflict: {{ detail.conflicts.join(', ') }}</p>
          <p>reasons: {{ detail.reasons.join(', ') || '—' }}</p>
          <p>evidence: {{ detail.processingBasisEvidenceRefs.map((row) => `${row.field} ← ${row.rawId}`).join('; ') || '—' }}</p>
          <p v-if="blockedReason" class="text-error font-weight-bold mt-2">{{ blockedReason }}</p>
          <v-btn
            class="mt-3"
            variant="tonal"
            type="button"
            :loading="qualifyBusy"
            :disabled="qualifyBusy"
            @click="qualify"
          >
            Qualify / LLM
          </v-btn>
          <v-alert v-if="qualifyNote" class="mt-4" :type="qualifyNote.type" prominent>
            {{ qualifyNote.text }}
          </v-alert>
        </v-card-text>
      </v-card>

      <v-card class="mb-4" variant="outlined">
        <v-card-title>Raw-строки</v-card-title>
        <v-card-text>
          <div v-for="raw in detail.rawRecords" :key="raw.id" class="mb-4">
            <div class="font-weight-medium">
              {{ raw.payload.contactName }} · {{ raw.payload.companyName }} · {{ raw.source }} / {{ raw.externalId }}
            </div>
            <div class="text-body-2">comment: {{ raw.payload.comment || '—' }}</div>
            <div class="text-body-2">basis {{ raw.payload.processingBasis }} · optOut {{ raw.payload.optOut }}</div>
          </div>
        </v-card-text>
      </v-card>

      <v-card class="mb-4" variant="outlined">
        <v-card-title>Черновик</v-card-title>
        <v-card-text>
          <p class="mb-3">только evidence · CTA book_a_15min_demo · канал mock_email</p>
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-btn :disabled="draftDisabled" @click="makeDraft">Создать черновик</v-btn>
            <v-btn :disabled="!draft" variant="tonal" @click="savePatch">Сохранить правку</v-btn>
            <v-btn color="success" :disabled="!draft || draftDisabled" @click="approve">Approve</v-btn>
            <v-btn :disabled="draftDisabled || !draft" @click="send">
              Send
            </v-btn>
          </div>
          <p v-if="draftDisabled && blockedReason" class="text-error font-weight-bold">
            Draft и Send серые — {{ blockedReason }}
          </p>
          <template v-if="draft">
            <p class="text-h6">
              version v{{ draft.versionNumber }} · approved: {{ draft.approved ? 'yes' : 'no' }}
            </p>
            <p class="text-caption">versionId {{ draft.versionId }}</p>
            <p v-if="approvalRevoked" class="text-warning font-weight-bold">approval отозван</p>
            <v-textarea v-model="draftText" auto-grow rows="8" class="mt-3" />
          </template>
          <v-alert v-if="sendResult" class="mt-4" type="success" prominent>
            MOCK-SENT · outbox id {{ sendResult.outboxId }}
            <span v-if="sendResult.idempotent"> · already sent</span>
          </v-alert>
        </v-card-text>
      </v-card>

      <v-card class="mb-4" variant="outlined">
        <v-card-title>Mock reply</v-card-title>
        <v-card-text>
          <div class="d-flex flex-wrap ga-2 mb-3">
            <v-chip
              v-for="type in REPLY_TYPES"
              :key="type"
              variant="outlined"
              label
              @click="sendReply(type)"
            >
              {{ type }}
            </v-chip>
          </div>
          <p v-if="reply">чип типа: {{ reply.type }} · replyId {{ reply.replyId }}</p>
          <p>Payment = {{ payments }} <span class="text-medium-emphasis">(positive ≠ оплата)</span></p>
          <p v-if="tasks.length" class="font-weight-bold">
            Задача менеджеру:
            <span v-for="task in tasks" :key="task.id">
              {{ task.type }}{{ task.type === 'opt_out' ? ' — закрыть контакт' : '' }}
            </span>
          </p>
          <p v-else>Задач менеджеру нет</p>
        </v-card-text>
      </v-card>

      <v-card variant="outlined">
        <v-card-title>Mock CRM + DLQ</v-card-title>
        <v-card-text>
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-btn color="primary" type="button" :loading="crmBusy" :disabled="crmBusy" @click="doCrm">
              CRM sync
            </v-btn>
            <v-btn
              color="error"
              variant="tonal"
              type="button"
              :loading="crmBusy"
              :disabled="crmBusy"
              @click="doCrmFault"
            >
              Симулировать CRM 500
            </v-btn>
          </div>
          <v-alert v-if="crmNote" class="mb-4" type="warning" prominent>
            {{ crmNote }}
          </v-alert>
          <template v-if="crm">
            <p>company {{ crm.companyId }}</p>
            <p>contact {{ crm.contactId }}</p>
            <p>deal {{ crm.dealId }}</p>
            <p>task {{ crm.taskId }}</p>
          </template>
          <p v-else>CRM ids: ещё нет</p>
          <div v-if="dlq.length" class="mt-4">
            <p class="font-weight-bold">DLQ</p>
            <div v-for="item in dlq" :key="item.id" class="d-flex align-center ga-3 mb-2">
              <span>{{ item.fault }} · attempts {{ item.attempts }} · {{ item.id }}</span>
              <v-btn size="small" @click="doReprocess(item.id)">Reprocess</v-btn>
            </div>
          </div>
          <p v-else class="mt-4">DLQ пуст</p>
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>
