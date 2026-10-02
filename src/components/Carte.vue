<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Modify from 'ol/interaction/Modify'
import Draw from 'ol/interaction/Draw'
import { Circle, Fill, Stroke, Style } from 'ol/style'
import { fromLonLat, toLonLat } from 'ol/proj'
import { fixerOrientation, retirerParcelle, scenarioCourant, type Bien, type BilanBien } from '../moteur/bien'
import Boussole from './Boussole.vue'
import { ajouterLigne, reattribuer, supprimerLigne, type BilanScenario } from '../moteur/decoupage'

const props = defineProps<{ bien: Bien; bilan: BilanBien; scenario: BilanScenario }>()
const emit = defineEmits<{
  // idParcelle : la Parcelle du Bien cliquée, ou null si le clic est hors du Bien
  clic: [lon: number, lat: number, idParcelle: string | null]
  // Ligne de coupe en cours de modification (final = false pendant le geste, true à la fin)
  ligne: [index: number, points: number[][], final: boolean]
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

// Hachures grises des Lots sans Acquéreur
function hachures(): CanvasPattern {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 8
  const contexte = canvas.getContext('2d')!
  contexte.strokeStyle = '#666'
  contexte.lineWidth = 2
  contexte.beginPath()
  contexte.moveTo(0, 8)
  contexte.lineTo(8, 0)
  contexte.stroke()
  return contexte.createPattern(canvas, 'repeat')!
}
const nonAttribue = new Style({ stroke: new Stroke({ color: '#666', width: 2 }), fill: new Fill({ color: hachures() }) })

// Lots du Découpage, colorés par Acquéreur ; hachurés en gris s'ils n'ont pas d'Acquéreur
const sourceLots = new VectorSource()
const coucheLots = new VectorLayer({
  source: sourceLots,
  style: (feature) =>
    feature.get('couleur')
      ? new Style({
          stroke: new Stroke({ color: 'white', width: 2 }),
          fill: new Fill({ color: feature.get('couleur') + '99' }),
        })
      : nonAttribue,
})
watch(
  () => props.scenario,
  (scenario) => {
    sourceLots.clear()
    for (const lot of scenario.lots) {
      const couleur = props.bien.acquereurs.find((a) => a.id === lot.acquereur)?.couleur
      // Avant tout Découpage, les Lots ne sont pas affichés : un clic sur le Bien retire la Parcelle
      if (!couleur && !scenarioCourant(props.bien).attributions.length) {
        continue
      }

      const feature = geojson.readFeature({
        type: 'Feature',
        geometry: lot.geometrie,
        properties: { couleur, tenement: lot.tenement, signature: lot.signature },
      })
      if (!Array.isArray(feature)) {
        sourceLots.addFeature(feature)
      }
    }
  },
  { immediate: true },
)

// Lignes de coupe, modifiables : déplacer un sommet, en ajouter un en tirant un segment, Alt+clic pour en supprimer un
const sourceLignes = new VectorSource<Feature<LineString>>()
const coucheLignes = new VectorLayer({
  source: sourceLignes,
  style: new Style({ stroke: new Stroke({ color: '#111', width: 2, lineDash: [6, 4] }) }),
})
function dessinerLignes() {
  sourceLignes.clear()
  scenarioCourant(props.bien).lignes.forEach((l, index) => {
    const feature = new Feature(new LineString(l.points.map((p) => fromLonLat(p))))
    feature.set('index', index)
    sourceLignes.addFeature(feature)
  })
}
watch(() => scenarioCourant(props.bien).lignes, dessinerLignes, { immediate: true, deep: true })

const modification = new Modify({
  source: sourceLignes,
  style: new Style({ image: new Circle({ radius: 6, fill: new Fill({ color: '#111' }), stroke: new Stroke({ color: 'white', width: 2 }) }) }),
})
const pointsDe = (f: Feature<LineString>) => f.getGeometry()!.getCoordinates().map((c) => toLonLat(c))
let enCours: Feature<LineString> | null = null
let image = 0
modification.on('modifystart', (e) => {
  enCours = e.features.item(0) as Feature<LineString>
})
sourceLignes.on('changefeature', (e) => {
  const feature = e.feature as Feature<LineString>
  if (feature !== enCours || image) {
    return
  }

  // Au plus un aperçu par image affichée
  image = requestAnimationFrame(() => {
    image = 0
    if (enCours) {
      emit('ligne', enCours.get('index'), pointsDe(enCours), false)
    }
  })
})
modification.on('modifyend', (e) => {
  const feature = e.features.item(0) as Feature<LineString>
  enCours = null
  emit('ligne', feature.get('index'), pointsDe(feature), true)
  // Redessine depuis l'état : une modification refusée revient en place
  dessinerLignes()
})

// Tracé d'une nouvelle ligne de coupe : clic pour chaque sommet, double-clic pour finir, Échap pour annuler
const trace = new Draw({ type: 'LineString' })
const enTrace = ref(false)
trace.on('drawend', (e) => {
  const points = (e.feature.getGeometry() as LineString).getCoordinates().map((c) => toLonLat(c))
  basculerTrace()
  if (!ajouterLigne(props.bien, points)) {
    alert('La ligne doit traverser au moins un Lot.')
  }
})

function basculerTrace() {
  enTrace.value = !enTrace.value
  if (enTrace.value) {
    carte.addInteraction(trace)
  } else {
    carte.removeInteraction(trace)
  }
}

function touche(e: KeyboardEvent) {
  if (e.key === 'Escape' && enTrace.value) {
    trace.abortDrawing()
    basculerTrace()
  }
}

// Menu ouvert par un clic sur un Lot (réattribution, retrait de la Parcelle cliquée) ou sur une ligne de coupe (suppression)
const menu = ref<
  | { x: number; y: number; type: 'lot'; tenement: string; signature: string; parcelle: string | null }
  | { x: number; y: number; type: 'ligne'; index: number }
  | null
>(null)

function choisirAcquereur(acquereur: string) {
  if (menu.value?.type === 'lot') {
    reattribuer(props.bien, menu.value.tenement, menu.value.signature, acquereur)
  }

  menu.value = null
}

function retirerLaParcelle() {
  if (menu.value?.type === 'lot' && menu.value.parcelle) {
    const id = menu.value.parcelle
    if (confirm(`Retirer la Parcelle ${id} du Bien ? Le Découpage de son Tènement sera effacé.`)) {
      retirerParcelle(props.bien, id)
    }
  }

  menu.value = null
}

function supprimerLaLigne() {
  if (menu.value?.type === 'ligne') {
    supprimerLigne(props.bien, menu.value.index)
  }

  menu.value = null
}

const cible = ref<HTMLDivElement>()
let carte: OlMap

onMounted(() => {
  carte = new OlMap({
    target: cible.value,
    layers: [couches.orthophoto, couches.rpg, couches.cadastre, coucheBien, coucheLots, coucheLignes],
    view: new View({ center: fromLonLat([2.5, 46.6]), zoom: 6 }),
  })
  carte.addInteraction(modification)
  window.addEventListener('keydown', touche)
  impression.addEventListener('change', changementImpression)
  carte.on('movestart', () => (menu.value = null))
  carte.on('singleclick', (e) => {
    menu.value = null
    // Pendant un tracé, les clics posent des sommets ; Alt+clic supprime un sommet de ligne
    if (enTrace.value || e.originalEvent.altKey) {
      return
    }

    const [x, y] = e.pixel
    const ligne = carte.forEachFeatureAtPixel(e.pixel, (f) => f, { layerFilter: (c) => c === coucheLignes, hitTolerance: 6 })
    if (ligne) {
      menu.value = { x, y, type: 'ligne', index: ligne.get('index') }
      return
    }

    const parcelle = sourceBien.getFeaturesAtCoordinate(e.coordinate)[0]
    const lot = sourceLots.getFeaturesAtCoordinate(e.coordinate)[0]
    if (lot) {
      const id = parcelle ? String(parcelle.getId()) : null
      menu.value = { x, y, type: 'lot', tenement: lot.get('tenement'), signature: lot.get('signature'), parcelle: id }
      return
    }

    const [lon, lat] = toLonLat(e.coordinate)
    emit('clic', lon, lat, parcelle ? String(parcelle.getId()) : null)
  })
})

// Impression : la carte est cadrée sur le Bien et redimensionnée au format de la page. On suit le média
// « print » plutôt que beforeprint, qui survient avant la mise en page d'impression.
const impression = window.matchMedia('print')
function changementImpression(e: MediaQueryListEvent) {
  if (e.matches) {
    avantImpression()
  } else {
    apresImpression()
  }
}

function avantImpression() {
  carte.updateSize()
  const etendue = sourceBien.getExtent()
  if (etendue && sourceBien.getFeatures().length) {
    carte.getView().fit(etendue, { padding: [20, 20, 20, 20] })
  }

  carte.renderSync()
}

function apresImpression() {
  carte.updateSize()
}

onUnmounted(() => {
  window.removeEventListener('keydown', touche)
  impression.removeEventListener('change', changementImpression)
})

function centrerSur(lon: number, lat: number) {
  carte.getView().animate({ center: fromLonLat([lon, lat]), zoom: 15 })
}

defineExpose({ centrerSur })
</script>

<template>
  <div class="carte">
    <div ref="cible" class="ol"></div>
    <div class="outils">
      <button v-if="scenarioCourant(bien).lignes.length || scenarioCourant(bien).attributions.length" type="button" @click="basculerTrace">
        {{ enTrace ? 'Annuler le tracé' : '✏ Tracer une ligne de coupe' }}
      </button>
      <span v-if="enTrace" class="aide">Clic pour chaque sommet, double-clic pour finir</span>
    </div>
    <div v-if="menu" class="menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <template v-if="menu.type === 'lot'">
        <div class="titre">Attribuer ce Lot à</div>
        <button v-for="a in bien.acquereurs" :key="a.id" type="button" @click="choisirAcquereur(a.id)">
          <span class="pastille" :style="{ background: a.couleur }"></span> {{ a.nom }}
        </button>
        <button v-if="menu.parcelle" type="button" class="retrait" @click="retirerLaParcelle">
          Retirer la Parcelle {{ menu.parcelle }} du Bien
        </button>
      </template>
      <button v-else type="button" @click="supprimerLaLigne">Supprimer cette ligne de coupe</button>
    </div>
    <Boussole :orientation="scenarioCourant(bien).orientation" @change="(o) => fixerOrientation(bien, o)" />
    <fieldset class="fonds">
      <legend>Fonds</legend>
      <label><input v-model="visibles.orthophoto" type="checkbox" /> Orthophoto</label>
      <label><input v-model="visibles.cadastre" type="checkbox" /> Plan cadastral</label>
      <label><input v-model="visibles.rpg" type="checkbox" /> RPG (cultures)</label>
    </fieldset>
  </div>
</template>

<style scoped>
.outils {
  position: absolute;
  top: 8px;
  left: 48px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.outils .aide {
  background: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.menu {
  position: absolute;
  background: white;
  border: 1px solid #999;
  border-radius: 4px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.menu .titre {
  color: #666;
}
.menu button {
  text-align: left;
}
.menu .retrait {
  margin-top: 4px;
}
.pastille {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
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
/* En dernier : l'emporte sur les règles d'affichage ci-dessus */
@media print {
  .outils,
  .menu,
  .fonds,
  .boussole,
  .carte :deep(.ol-control) {
    display: none;
  }
}
</style>
