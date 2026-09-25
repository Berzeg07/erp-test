<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/entities/session'

const router = useRouter()
const session = useSessionStore()

async function logout(): Promise<void> {
  await session.logout()
  await router.push('/login')
}
</script>

<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <strong>Admin</strong>
      <button type="button" @click="logout">Выйти</button>
    </aside>
    <main class="admin-content">
      <h1>Lead Engine</h1>
      <p class="admin-banner">SYNTHETIC DATA</p>
      <p>{{ session.user?.displayName }}</p>
    </main>
  </div>
</template>

<style scoped lang="scss">
.admin-layout {
  display: grid;
  min-height: 100vh;
  grid-template-columns: to-rem(240) 1fr;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.admin-sidebar {
  display: flex;
  flex-direction: column;
  gap: $space-lg;
  padding: $space-lg;
  border-right: 1px solid $color-border;
  background: $color-surface;

  button {
    width: fit-content;
    color: $color-accent;
    cursor: pointer;
    border: 0;
    background: transparent;
  }
}

.admin-content {
  padding: $space-lg;

  p {
    margin-top: $space-sm;
    color: $color-muted;
  }

  .admin-banner {
    font-weight: 700;
    letter-spacing: 0.04em;
    color: $color-accent;
  }
}
</style>
