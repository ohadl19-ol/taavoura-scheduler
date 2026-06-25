import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron/main', 'electron/renderer'],
              output: {
                entryFileNames: '[name].mjs',
                format: 'es',
              },
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron/main', 'electron/renderer'],
              output: {
                entryFileNames: '[name].mjs',
                format: 'es',
              },
            },
          },
        },
        onstart({ reload }) {
          reload()
        },
      },
    ]),
    renderer(),
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
