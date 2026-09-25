import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'appDark',
    themes: {
      appDark: {
        dark: true,
        colors: {
          background: '#0f1115',
          surface: '#1a1d24',
          primary: '#5b8def',
          secondary: '#9aa0a6',
          'on-background': '#e8eaed',
          'on-surface': '#e8eaed',
          outline: '#2a2f3a',
          error: '#ef6b73',
        },
      },
    },
  },
})
