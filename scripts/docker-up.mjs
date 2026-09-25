import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const maxAttempts = 3
const delaySeconds = 5

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runDockerComposeUp() {
  const result = spawnSync('docker', ['compose', 'up', '-d'], {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
  })
  return result.status ?? 1
}

function checkDocker() {
  const result = spawnSync('docker', ['info'], {
    cwd: root,
    stdio: 'ignore',
    shell: isWin,
  })
  return result.status === 0
}

async function main() {
  if (!checkDocker()) {
    console.error('Docker is not running. Start Docker Desktop and retry.')
    process.exit(1)
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`docker compose up -d (attempt ${attempt}/${maxAttempts})...`)
    const code = runDockerComposeUp()
    if (code === 0) {
      spawnSync('docker', ['compose', 'ps'], { cwd: root, stdio: 'inherit', shell: isWin })
      process.exit(0)
    }

    if (attempt < maxAttempts) {
      console.log(`Pull/start failed. Retry in ${delaySeconds}s...`)
      await sleep(delaySeconds * 1000)
    }
  }

  console.error('Docker compose failed after retries.')
  process.exit(1)
}

main()
