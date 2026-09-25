import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { WEB_API_PROXY_PREFIXES } from './vite.api-prefixes'

const proxy = Object.fromEntries(
  WEB_API_PROXY_PREFIXES.map((prefix) => [
    prefix,
    {
      target: 'http://localhost:4101',
      changeOrigin: true,
    },
  ]),
)

export default defineConfig({
  plugins: [vue()],
  envDir: '../..',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: (source: string, filename: string) =>
          filename.replaceAll('\\\\', '/').includes('/src/assets/scss/')
            ? source
            : `@use "@/assets/scss/index.scss" as *;\n${source}`,
      },
    },
  },
  server: {
    port: 5283,
    proxy,
  },
  preview: {
    port: 5283,
  },
})
