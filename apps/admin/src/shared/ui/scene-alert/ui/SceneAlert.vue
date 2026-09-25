<script setup lang="ts">
defineProps<{
  title: string
  text?: string
}>()
</script>

<template>
  <v-alert
    class="scene-alert mb-6"
    type="info"
    variant="tonal"
    prominent
    border="start"
  >
    <div class="text-h5 font-weight-bold">{{ title }}</div>
    <div v-if="text" class="text-body-1 mt-2">{{ text }}</div>
  </v-alert>
</template>

<style scoped lang="scss">
.scene-alert {
  font-size: to-rem(18);
}
</style>
