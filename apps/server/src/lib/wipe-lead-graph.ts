import { prisma } from './prisma.js'

export async function wipeLeadGraph() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('wipeLeadGraph refused outside NODE_ENV=test')
  }

  await prisma.leadCase.deleteMany()
  await prisma.companyContact.deleteMany()
  await prisma.companyDomain.deleteMany()
  await prisma.companyExternalId.deleteMany()
  await prisma.company.deleteMany()
  await prisma.person.deleteMany()
  await prisma.rawLeadRecord.deleteMany()
}
