import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// BASE_PATH permet de servir l'app sous un sous-chemin (ex. /geoSoulte/ sur GitHub Pages)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue()],
})
