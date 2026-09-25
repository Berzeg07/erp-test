<script setup lang="ts">
withDefaults(
  defineProps<{
    loading?: boolean
    type?: 'button' | 'submit' | 'reset'
    block?: boolean
  }>(),
  {
    loading: false,
    type: 'button',
    block: false,
  },
)
</script>

<template>
  <v-btn
    :type="type"
    :loading="loading"
    :block="block"
    color="primary"
    variant="flat"
  >
    <slot />
  </v-btn>
</template>
