import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      includeAssets: ['logo-tc.jpg'],
      manifest: {
        name: 'Control de Pagos',
        short_name: 'Pagos',
        description: 'Gestión de pagos diarios y agentes',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: './',
        icons: [
          {
            src: 'logo-tc.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'logo-tc.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          },
          {
            src: 'logo-tc.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
