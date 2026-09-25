import { createApp } from 'vue'
import App from './App.vue'
import { pinia } from './providers/pinia'
import { router } from './providers/router'
import { vuetify } from './providers/vuetify'
import '@/assets/scss/common.scss'

createApp(App).use(pinia).use(router).use(vuetify).mount('#app')
