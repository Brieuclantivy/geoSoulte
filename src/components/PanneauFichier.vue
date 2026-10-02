<script setup lang="ts">
import { ref } from 'vue'
import type { Bien } from '../moteur/bien'
import { exporter, importer } from '../moteur/export'

const props = defineProps<{ bien: Bien }>()
const emit = defineEmits<{ importe: [bien: Bien] }>()
const erreur = ref('')

function exporterFichier() {
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(new Blob([exporter(props.bien)], { type: 'application/json' }))
  lien.download = 'geosoulte.json'
  lien.click()
  URL.revokeObjectURL(lien.href)
}

async function importerFichier(e: Event) {
  const input = e.target as HTMLInputElement
  const fichier = input.files?.[0]
  input.value = ''
  if (!fichier || !confirm('Remplacer le Bien actuel par celui du fichier ?')) {
    return
  }

  try {
    erreur.value = ''
    emit('importe', importer(await fichier.text()))
  } catch (err) {
    erreur.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <section>
    <h2>Fichier</h2>
    <button type="button" @click="exporterFichier">Exporter</button>
    <label class="bouton import">
      Importer
      <input type="file" accept=".json,application/json" @change="importerFichier" />
    </label>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </section>
</template>

<style scoped>
.import {
  margin-left: 6px;
}
.import input {
  display: none;
}
.erreur {
  color: var(--erreur);
}
</style>
