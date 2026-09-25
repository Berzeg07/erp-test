import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma.js'
import { upsertSuppressionFromFixtures } from '../src/modules/policy/policy.service.js'

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL ?? 'admin@app.local').toLowerCase()
  const password = process.env.SUPERADMIN_PASSWORD ?? 'admin12345'
  const displayName = process.env.SUPERADMIN_DISPLAY_NAME ?? 'Admin'
  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      displayName,
      role: 'admin',
    },
    create: {
      email,
      passwordHash,
      displayName,
      role: 'admin',
    },
  })

  console.log(`Seeded admin: ${email}`)

  const tenants = [
    { slug: 'athenai_demo', name: 'AthenAI Demo' },
    { slug: 'proshelf_demo', name: 'Proshelf Demo' },
  ]

  for (const tenant of tenants) {
    await prisma.tenant.upsert({
      where: { slug: tenant.slug },
      update: { name: tenant.name },
      create: tenant,
    })
  }

  console.log(`Seeded tenants: ${tenants.map((item) => item.slug).join(', ')}`)

  const suppression = await upsertSuppressionFromFixtures()
  console.log(`Seeded suppression entries: ${suppression.upserted}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
