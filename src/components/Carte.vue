<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'

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

const cible = ref<HTMLDivElement>()

onMounted(() => {
  new OlMap({
    target: cible.value,
    layers: [couches.orthophoto, couches.rpg, couches.cadastre],
    view: new View({ center: fromLonLat([2.5, 46.6]), zoom: 6 }),
  })
})
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
