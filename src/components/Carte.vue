<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import GeoJSON from 'ol/format/GeoJSON'
import { Fill, Stroke, Style } from 'ol/style'
import { fromLonLat, toLonLat } from 'ol/proj'
import type { Bien, BilanBien } from '../moteur/bien'
import type { BilanScenario } from '../moteur/decoupage'

const props = defineProps<{ bien: Bien; bilan: BilanBien; scenario: BilanScenario }>()
const emit = defineEmits<{
  // idParcelle : la Parcelle du Bien cliquée, ou null si le clic est hors du Bien
  clic: [lon: number, lat: number, idParcelle: string | null]
}>()

// Fonds WMTS de la Géoplateforme IGN, interrogés en XYZ (matrices PM_*, EPSG:3857)
function coucheIgn(layer: string, style: string, format: string, matrixSet: string, maxZoom: number) {
  return new TileLayer({
    source: new XYZ({
      url:
        'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
        `&LAYER=${layer}&STYLE=${encodeURIComponent(style)}&FORMAT=${format}` +
        `&TILEMATRIXSET=${matrixSet}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
      maxZoom,
      attributions: '© IGN',
    }),
  })
}

const couches = {
  orthophoto: coucheIgn('ORTHOIMAGERY.ORTHOPHOTOS', 'normal', 'image/jpeg', 'PM_0_19', 19),
  cadastre: coucheIgn('CADASTRALPARCELS.PARCELLAIRE_EXPRESS', 'PCI vecteur', 'image/png', 'PM_0_19', 19),
  rpg: coucheIgn('LANDUSE.AGRICULTURE.LATEST', 'normal', 'image/png', 'PM_6_16', 16),
}
couches.rpg.setOpacity(0.6)

const visibles = reactive({ orthophoto: true, cadastre: true, rpg: false })
watch(
  visibles,
  (v) => {
    couches.orthophoto.setVisible(v.orthophoto)
    couches.cadastre.setVisible(v.cadastre)
    couches.rpg.setVisible(v.rpg)
  },
  { immediate: true },
)

// Parcelles du Bien, colorées par Tènement
const COULEURS_TENEMENTS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45']
const sourceBien = new VectorSource()
const coucheBien = new VectorLayer({
  source: sourceBien,
  style: (feature) => {
    const couleur = COULEURS_TENEMENTS[feature.get('tenement') % COULEURS_TENEMENTS.length]
    return new Style({ stroke: new Stroke({ color: couleur, width: 3 }), fill: new Fill({ color: couleur + '33' }) })
  },
})
const geojson = new GeoJSON({ featureProjection: 'EPSG:3857' })
watch(
  () => props.bilan,
  (bilan) => {
    sourceBien.clear()
    props.bien.parcelles.forEach((p, i) => {
      const feature = geojson.readFeature({ type: 'Feature', geometry: p.geometrie, properties: {} })
      if (Array.isArray(feature)) {
        return
      }

      feature.setId(p.id)
      feature.set('tenement', bilan.parcelles[i].tenement)
      sourceBien.addFeature(feature)
    })
  },
  { immediate: true },
)

// Lots du Découpage, colorés par Acquéreur
const sourceLots = new VectorSource()
const coucheLots = new VectorLayer({
  source: sourceLots,
  style: (feature) =>
    new Style({
      stroke: new Stroke({ color: 'white', width: 2 }),
      fill: new Fill({ color: feature.get('couleur') + '99' }),
    }),
})
watch(
  () => props.scenario,
  (scenario) => {
    sourceLots.clear()
    for (const lot of scenario.lots) {
      const couleur = props.bien.acquereurs.find((a) => a.id === lot.acquereur)?.couleur
      if (!couleur) {
        continue
      }

      const feature = geojson.readFeature({ type: 'Feature', geometry: lot.geometrie, properties: { couleur } })
      if (!Array.isArray(feature)) {
        sourceLots.addFeature(feature)
      }
    }
  },
  { immediate: true },
)

const cible = ref<HTMLDivElement>()
let carte: OlMap

onMounted(() => {
  carte = new OlMap({
    target: cible.value,
    layers: [couches.orthophoto, couches.rpg, couches.cadastre, coucheBien, coucheLots],
    view: new View({ center: fromLonLat([2.5, 46.6]), zoom: 6 }),
  })
  carte.on('singleclick', (e) => {
    const [lon, lat] = toLonLat(e.coordinate)
    const parcelle = sourceBien.getFeaturesAtCoordinate(e.coordinate)[0]
    emit('clic', lon, lat, parcelle ? String(parcelle.getId()) : null)
  })
})

function centrerSur(lon: number, lat: number) {
  carte.getView().animate({ center: fromLonLat([lon, lat]), zoom: 15 })
}

defineExpose({ centrerSur })
</script>

<template>
  <div class="carte">
    <div ref="cible" class="ol"></div>
    <fieldset class="fonds">
      <legend>Fonds</legend>
      <label><input v-model="visibles.orthophoto" type="checkbox" /> Orthophoto</label>
      <label><input v-model="visibles.cadastre" type="checkbox" /> Plan cadastral</label>
      <label><input v-model="visibles.rpg" type="checkbox" /> RPG (cultures)</label>
    </fieldset>
  </div>
</template>

<style scoped>
.carte {
  position: relative;
  height: 100%;
}
.ol {
  position: absolute;
  inset: 0;
}
.fonds {
  position: absolute;
  top: 8px;
  right: 8px;
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
}
</style>
