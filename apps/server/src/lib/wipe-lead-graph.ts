import { DEFAULT_LLM_TOKEN_BUDGET } from '@app/shared'
import { prisma } from './prisma.js'

export async function wipeLeadGraph() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('wipeLeadGraph refused outside NODE_ENV=test')
  }

  await prisma.paymentEvent.deleteMany()
  await prisma.meetingEvent.deleteMany()
  await prisma.managerTask.deleteMany()
  await prisma.inboundReply.deleteMany()
  await prisma.outboxMessage.deleteMany()
  await prisma.approval.deleteMany()
  await prisma.draftVersion.deleteMany()
  await prisma.draft.deleteMany()
  await prisma.decisionRecord.deleteMany()
  await prisma.leadCase.deleteMany()
  await prisma.companyContact.deleteMany()
  await prisma.companyDomain.deleteMany()
  await prisma.companyExternalId.deleteMany()
  await prisma.company.deleteMany()
  await prisma.person.deleteMany()
  await prisma.rawLeadRecord.deleteMany()
  await prisma.tenant.updateMany({
    data: {
      llmTokenBudget: DEFAULT_LLM_TOKEN_BUDGET,
      llmTokenSpent: 0,
      killSwitchOn: false,
      killSwitchReason: null,
    },
  })
}
