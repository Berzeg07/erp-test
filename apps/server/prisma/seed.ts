import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma.js'

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
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
