<script setup lang="ts">
import { ref } from 'vue'
import type { Bien } from '../moteur/bien'
import { exporter, importer } from '../moteur/export'
import { lotsEnGeoJSON, lotsEnKML, nomFichierLots } from '../moteur/export-lots'

const props = defineProps<{ bien: Bien }>()
const emit = defineEmits<{ importe: [bien: Bien] }>()
const erreur = ref('')

function telecharger(contenu: string, type: string, nom: string) {
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(new Blob([contenu], { type }))
  lien.download = nom
  lien.click()
  URL.revokeObjectURL(lien.href)
}

function exporterFichier() {
  telecharger(exporter(props.bien), 'application/json', 'geosoulte.json')
}

// Lots du Scénario courant, pour un logiciel de cartographie ; on prévient si une surface n'est pas attribuée
function exporterLots(format: 'geojson' | 'kml') {
  const geojson = lotsEnGeoJSON(props.bien)
  const sansAcquereur = geojson.features.filter((f) => f.properties.acquereur === null).length
  if (sansAcquereur && !confirm(`${sansAcquereur} Lot(s) sans Acquéreur seront exportés sans nom. Continuer ?`)) {
    return
  }

  if (format === 'geojson') {
    telecharger(JSON.stringify(geojson), 'application/geo+json', nomFichierLots(props.bien, 'geojson'))
  } else {
    telecharger(lotsEnKML(props.bien), 'application/vnd.google-earth.kml+xml', nomFichierLots(props.bien, 'kml'))
  }
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
    <div v-if="bien.parcelles.length" class="lots">
      <button type="button" @click="exporterLots('geojson')">Exporter les Lots (GeoJSON)</button>
      <button type="button" @click="exporterLots('kml')">Exporter les Lots (KML)</button>
    </div>
    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </section>
</template>

<style scoped>
.import {
  margin-left: 6px;
}
.lots {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.import input {
  display: none;
}
.erreur {
  color: var(--erreur);
}
</style>
