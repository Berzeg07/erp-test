import { prisma } from './prisma.js'

export async function wipeLeadGraph() {
  await prisma.leadCase.deleteMany()
  await prisma.companyContact.deleteMany()
  await prisma.companyDomain.deleteMany()
  await prisma.companyExternalId.deleteMany()
  await prisma.company.deleteMany()
  await prisma.person.deleteMany()
  await prisma.rawLeadRecord.deleteMany()
}
