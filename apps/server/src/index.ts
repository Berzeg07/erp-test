import { buildServer } from './app.js'
import { env } from './config/env.js'

async function main() {
  const app = await buildServer()

  await app.listen({
    host: env.SERVER_HOST,
    port: env.SERVER_PORT,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
