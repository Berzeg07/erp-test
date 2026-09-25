/**
 * Boot server first, wait for /health, then start admin (Vuetify).
 */
import { spawn } from 'node:child_process'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

const HEALTH_URL = 'http://127.0.0.1:4101/health'
const MAX_ATTEMPTS = 180
const INTERVAL_MS = 500

function run(command, args) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
}

function killChild(child) {
  if (!child.pid || child.killed) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
      windowsHide: true,
    })
    return
  }
  child.kill('SIGTERM')
}

async function waitForHealth() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(HEALTH_URL)
      if (response.ok) return
    } catch {
      // Server not ready yet.
    }
    if (attempt === 1 || attempt % 10 === 0) {
      const sec = ((attempt * INTERVAL_MS) / 1000).toFixed(0)
      console.log(`[dev] waiting for ${HEALTH_URL}… (${sec}s)`)
    }
    await sleep(INTERVAL_MS)
  }
  throw new Error(
    `Server did not become ready at ${HEALTH_URL} after ${(MAX_ATTEMPTS * INTERVAL_MS) / 1000}s. ` +
      `Is Postgres up? Try pnpm docker:up && pnpm db:migrate && pnpm db:seed.`,
  )
}

const children = []

function shutdown(code = 0) {
  for (const child of children) {
    killChild(child)
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const server = run('pnpm', ['--filter', '@app/server', 'dev'])
children.push(server)
server.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`[dev] server exited with code ${code}`)
    shutdown(code)
  }
})

try {
  console.log('[dev] waiting for server health…')
  await waitForHealth()
  console.log('[dev] server ready — starting admin')
} catch (error) {
  console.error(`[dev] ${error instanceof Error ? error.message : error}`)
  shutdown(1)
}

const admin = run('pnpm', ['--filter', '@app/admin', 'dev'])
children.push(admin)
admin.on('exit', (code) => shutdown(code ?? 0))
