<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/entities/session'
import { UiButton } from '@/shared/ui/button'

const router = useRouter()
const session = useSessionStore()
const title = 'Админка'
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await session.login({ email: email.value, password: password.value })
    await router.push('/')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось войти'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <v-card class="login-card" elevation="8">
      <v-card-title class="text-h5">{{ title }}</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="email"
            label="Email"
            type="email"
            autocomplete="email"
            required
          />
          <v-text-field
            v-model="password"
            label="Пароль"
            type="password"
            autocomplete="current-password"
            minlength="8"
            required
          />
          <v-alert v-if="error" class="mb-4" type="error" density="compact">
            {{ error }}
          </v-alert>
          <UiButton type="submit" :loading="loading" block>Войти</UiButton>
        </v-form>
      </v-card-text>
    </v-card>
  </main>
</template>

<style scoped lang="scss">
.login-page {
  display: grid;
  min-height: 100vh;
  padding: $space-lg;
  place-items: center;
}

.login-card {
  width: min(100%, to-rem(420));
  border: 1px solid $color-border;
}
</style>
