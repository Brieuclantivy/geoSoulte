<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import GeoJSON from 'ol/format/GeoJSON'
import Collection from 'ol/Collection'
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Polygon from 'ol/geom/Polygon'
import Modify from 'ol/interaction/Modify'
import Draw from 'ol/interaction/Draw'
import Snap from 'ol/interaction/Snap'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import { equals, squaredDistance, squaredDistanceToSegment, type Coordinate } from 'ol/coordinate'
import { primaryAction } from 'ol/events/condition'
import { Circle, Fill, Stroke, Style } from 'ol/style'
import { fromLonLat, toLonLat } from 'ol/proj'
import { fixerOrientation, scenarioCourant, type Bien, type BilanBien } from '../moteur/bien'
import { prixEffectifs } from '../moteur/prix'
import { praticable, type Troncon } from '../moteur/acces'
import { euros, hectares } from '../format'
import Boussole from './Boussole.vue'
import {
  ajouterLigne,
  fermerLigne,
  modifierLigne,
  reattribuer,
  supprimerLigne,
  type BilanScenario,
  type ModificationLigne,
} from '../moteur/decoupage'

const props = defineProps<{
  bien: Bien
  bilan: BilanBien
  scenario: BilanScenario
  // Tronçons de route autour du Bien, ou null s'ils ne sont pas chargés
  voies: Troncon[] | null
  peutAnnuler: boolean
  peutRetablir: boolean
}>()
const emit = defineEmits<{
  // Ajout de la Parcelle située en ce point, depuis le menu ouvert hors du Bien
  ajouter: [lon: number, lat: number]
  annuler: []
  retablir: []
  // Lignes de coupe en cours de modification, ensemble (final = false pendant le geste, true à la fin)
  lignes: [modifications: ModificationLigne[], final: boolean]
  // Retrait d'une Parcelle depuis le menu d'un Lot
  retirer: [idParcelle: string]
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
const enclave = new Style({ stroke: new Stroke({ color: '#d00', width: 5, lineDash: [8, 6] }) })

// Lots du Découpage, colorés par Acquéreur ; hachurés en gris s'ils n'ont pas d'Acquéreur ; cernés de pointillés
// rouges s'ils sont enclavés
const sourceLots = new VectorSource()
const coucheLots = new VectorLayer({
  source: sourceLots,
  style: (feature) => {
    if (!feature.get('couleur')) {
      return nonAttribue
    }

    const style = new Style({
      stroke: new Stroke({ color: 'white', width: 2 }),
      fill: new Fill({ color: feature.get('couleur') + '99' }),
    })
    return feature.get('sansAcces') ? [style, enclave] : style
  },
})
watch(
  () => props.scenario,
  (scenario) => {
    sourceLots.clear()
    for (const lot of scenario.lots) {
      const couleur = props.bien.acquereurs.find((a) => a.id === lot.acquereur)?.couleur
      // Avant tout Découpage, les Lots ne sont pas affichés : le menu du Bien ne propose que de retirer la Parcelle
      if (!couleur && !scenarioCourant(props.bien).decoupe) {
        continue
      }

      const feature = geojson.readFeature({
        type: 'Feature',
        geometry: lot.geometrie,
        properties: { couleur, tenement: lot.tenement, signature: lot.signature, sansAcces: lot.sansAcces },
      })
      if (!Array.isArray(feature)) {
        sourceLots.addFeature(feature)
      }
    }
  },
  { immediate: true },
)

// Lignes de coupe, modifiables : déplacer un sommet, en ajouter un en tirant un segment, Alt+clic pour en supprimer un.
// Une ligne fermée (zone) est dessinée en polygone ; un brouillon, qui ne coupe rien, en pointillés orange.
const sourceLignes = new VectorSource<Feature<LineString | Polygon>>()
const styleLigne = new Style({ stroke: new Stroke({ color: '#111', width: 2, lineDash: [6, 4] }) })
const styleBrouillon = new Style({ stroke: new Stroke({ color: '#f58231', width: 3, lineDash: [4, 6] }) })
const coucheLignes = new VectorLayer({
  source: sourceLignes,
  style: (feature) => (props.scenario.brouillons.includes(feature.get('index')) ? styleBrouillon : styleLigne),
})
// Lignes que le geste en cours peut modifier : toutes, sauf aimant désactivé, où seule la ligne saisie l'est
const modifiables = new Collection<Feature<LineString | Polygon>>()
function rendreToutesModifiables() {
  if (modifiables.getLength() !== sourceLignes.getFeatures().length) {
    modifiables.clear()
    modifiables.extend(sourceLignes.getFeatures())
  }
}

function dessinerLignes() {
  modifiables.clear()
  sourceLignes.clear()
  scenarioCourant(props.bien).lignes.forEach((l, index) => {
    const points = l.points.map((p) => fromLonLat(p))
    const feature = new Feature(l.fermee ? new Polygon([[...points, points[0]]]) : new LineString(points))
    feature.set('index', index)
    sourceLignes.addFeature(feature)
  })
  rendreToutesModifiables()
}
watch(() => scenarioCourant(props.bien).lignes, dessinerLignes, { immediate: true, deep: true })
watch(() => props.scenario.brouillons, () => coucheLignes.changed())

// Voies praticables prises en compte pour l'accès des Lots, affichées à la demande
const sourceVoies = new VectorSource()
const coucheVoies = new VectorLayer({
  source: sourceVoies,
  style: new Style({ stroke: new Stroke({ color: '#ffd400', width: 3 }) }),
})
const voiesVisibles = ref(false)
watch(voiesVisibles, (v) => coucheVoies.setVisible(v), { immediate: true })
watch(
  () => props.voies,
  (voies) => {
    sourceVoies.clear()
    for (const t of (voies ?? []).filter(praticable)) {
      sourceVoies.addFeature(new Feature(new LineString(t.points.map((p) => fromLonLat(p)))))
    }
  },
  { immediate: true },
)

// Tolérance de saisie de Modify (px), sa valeur par défaut
const SAISIE = 10
// Écart (unités EPSG:3857, moins d'1 cm au sol) sous lequel un point accroché par l'aimant est confondu avec le
// sommet ou le bord où il a été accroché, malgré l'aller-retour en WGS84 des points enregistrés
const JONCTION = 0.01

// Sommets d'une ligne de coupe dessinée ; le point de fermeture d'un polygone est répété
function anneau(f: Feature<LineString | Polygon>): Coordinate[] {
  const geometrie = f.getGeometry()!
  return geometrie instanceof Polygon ? geometrie.getCoordinates()[0] : geometrie.getCoordinates()
}
function fixerAnneau(f: Feature<LineString | Polygon>, sommets: Coordinate[]) {
  const geometrie = f.getGeometry()!
  if (geometrie instanceof Polygon) {
    geometrie.setCoordinates([sommets])
  } else {
    geometrie.setCoordinates(sommets)
  }
}

// À l'appui, avant que Modify ne saisisse le point le plus proche d'une ligne de coupe, comme elle le fait : un
// sommet à moins de SAISIE px, sinon le point du bord. Aimant activé, ce point est rendu identique dans toutes les
// lignes qui y passent, un sommet y étant inséré au besoin : Modify les déplace alors toutes ensemble. Aimant
// désactivé, seule la ligne saisie reste modifiable.
function preparerSaisie(coordonnee: Coordinate) {
  rendreToutesModifiables()
  const saisie = sourceLignes.getClosestFeatureToCoordinate(coordonnee)
  const resolution = carte.getView().getResolution()!
  const proche = saisie?.getGeometry()!.getClosestPoint(coordonnee)
  if (!saisie || !proche || Math.sqrt(squaredDistance(proche, coordonnee)) / resolution > SAISIE) {
    return
  }

  if (!aimant.value) {
    modifiables.clear()
    modifiables.push(saisie)
    return
  }

  const sommet = anneau(saisie).reduce((a, b) => (squaredDistance(a, proche) <= squaredDistance(b, proche) ? a : b))
  const point = Math.sqrt(squaredDistance(sommet, proche)) / resolution <= SAISIE ? sommet : proche
  const confondu = (c: Coordinate) => squaredDistance(c, point) < JONCTION ** 2
  for (const f of sourceLignes.getFeatures()) {
    const sommets = anneau(f)
    if (sommets.some(confondu)) {
      if (sommets.some((c) => confondu(c) && !equals(c, point))) {
        fixerAnneau(f, sommets.map((c) => (confondu(c) ? point : c)))
      }

      continue
    }

    const i = sommets.findIndex((c, k) => k < sommets.length - 1 && squaredDistanceToSegment(point, [c, sommets[k + 1]]) < JONCTION ** 2)
    if (i >= 0) {
      fixerAnneau(f, [...sommets.slice(0, i + 1), point, ...sommets.slice(i + 1)])
    }
  }
}

const modification = new Modify({
  features: modifiables,
  pixelTolerance: SAISIE,
  condition: (e) => {
    const principal = primaryAction(e)
    if (principal) {
      preparerSaisie(e.coordinate)
    }

    return principal
  },
  style: new Style({ image: new Circle({ radius: 6, fill: new Fill({ color: '#111' }), stroke: new Stroke({ color: 'white', width: 2 }) }) }),
})
// Points (WGS84) d'une ligne de coupe dessinée ; le point de fermeture d'un polygone n'est pas répété
function pointsDe(f: Feature<LineString | Polygon>): number[][] {
  const geometrie = f.getGeometry()!
  const coordonnees = geometrie instanceof Polygon ? geometrie.getCoordinates()[0].slice(0, -1) : geometrie.getCoordinates()
  return coordonnees.map((c) => toLonLat(c))
}
// Nouveaux points des lignes de coupe dessinées
function modificationsDe(features: Feature<LineString | Polygon>[]): ModificationLigne[] {
  return features.map((f) => ({ index: f.get('index'), points: pointsDe(f) }))
}
// Lignes modifiées par le geste en cours
let enCours: Feature<LineString | Polygon>[] | null = null
let image = 0
modification.on('modifystart', (e) => {
  menu.value = null
  enCours = e.features.getArray() as Feature<LineString | Polygon>[]
})
sourceLignes.on('changefeature', (e) => {
  const feature = e.feature as Feature<LineString | Polygon>
  if (!enCours?.includes(feature) || image) {
    return
  }

  // Au plus un aperçu par image affichée
  image = requestAnimationFrame(() => {
    image = 0
    if (enCours) {
      emit('lignes', modificationsDe(enCours), false)
    }
  })
})
modification.on('modifyend', (e) => {
  enCours = null
  emit('lignes', modificationsDe(e.features.getArray() as Feature<LineString | Polygon>[]), true)
  // Redessine depuis l'état : une modification refusée revient en place
  dessinerLignes()
})

// Tracé d'une nouvelle ligne de coupe, ou d'une zone (ligne fermée) : clic pour chaque sommet, double-clic pour
// finir (ou clic sur le premier point pour fermer une zone), Échap pour annuler
const traces = { ligne: new Draw({ type: 'LineString' }), zone: new Draw({ type: 'Polygon' }) }
const enTrace = ref<keyof typeof traces | null>(null)
// Le tracé n'est retiré qu'après l'événement en cours : il absorbe ainsi le double-clic de fin, qui sinon zoomerait
traces.ligne.on('drawend', (e) => {
  setTimeout(() => basculerTrace(null))
  if (!ajouterLigne(props.bien, pointsDe(e.feature as Feature<LineString>))) {
    alert('La ligne doit toucher le Bien et y découper au moins un Lot.')
  }
})
traces.zone.on('drawend', (e) => {
  setTimeout(() => basculerTrace(null))
  if (!ajouterLigne(props.bien, pointsDe(e.feature as Feature<Polygon>), true)) {
    alert('La zone doit découper au moins un Lot du Bien.')
  }
})

// Active le tracé demandé, ou le désactive s'il l'est déjà (null : désactive tout tracé)
function basculerTrace(mode: keyof typeof traces | null) {
  if (enTrace.value) {
    carte.removeInteraction(traces[enTrace.value])
  }

  enTrace.value = enTrace.value === mode ? null : mode
  traceCommence = false
  if (enTrace.value) {
    carte.addInteraction(traces[enTrace.value])
  }

  placerAimant()
}

// Défilement au bord : une fois le premier sommet posé, la carte défile quand la souris approche d'un bord, plus
// vite à mesure qu'elle s'en rapproche. Le tracé en cours est ensuite remis sous la souris.
const BORD = 40
const VITESSE = 15
let traceCommence = false
let pointeur: PointerEvent | null = null
let defilement = 0
Object.values(traces).forEach((t) => {
  t.on('drawstart', () => (traceCommence = true))
  t.on(['drawend', 'drawabort'], () => (traceCommence = false))
})

function suivrePointeur(e: PointerEvent) {
  // Ignore le mouvement réémis par defiler
  if (!e.isTrusted) {
    return
  }

  pointeur = e.pointerType === 'mouse' ? e : null
  if (!defilement) {
    defiler()
  }
}

// Pousse (en px) vers un bord, nulle loin des bords
function poussee(position: number, taille: number) {
  if (position < BORD) {
    return (-VITESSE * (BORD - position)) / BORD
  }

  if (position > taille - BORD) {
    return (VITESSE * (position - taille + BORD)) / BORD
  }

  return 0
}

function defiler() {
  defilement = 0
  if (!traceCommence || !pointeur) {
    return
  }

  const [x, y] = carte.getEventPixel(pointeur)
  const [largeur, hauteur] = carte.getSize()!
  const dx = poussee(x, largeur)
  const dy = poussee(y, hauteur)
  if (!dx && !dy) {
    return
  }

  const vue = carte.getView()
  const resolution = vue.getResolution()!
  const [cx, cy] = vue.getCenter()!
  vue.setCenter([cx + dx * resolution, cy - dy * resolution])
  carte.renderSync()
  carte.getViewport().dispatchEvent(new PointerEvent('pointermove', pointeur))
  defilement = requestAnimationFrame(defiler)
}

// Aimant : pendant un tracé ou le déplacement d'un sommet, colle le pointeur aux sommets et bords proches
// des lignes de coupe et des Parcelles du Bien (10 px, 16 px au doigt)
const aimant = ref(true)
const PROXIMITE = window.matchMedia('(pointer: coarse)').matches ? 16 : 10
const accroches = [
  new Snap({ source: sourceLignes, pixelTolerance: PROXIMITE }),
  new Snap({ source: sourceBien, pixelTolerance: PROXIMITE }),
]
// Les accroches doivent être ajoutées après les interactions de tracé et de modification pour agir avant elles
function placerAimant() {
  accroches.forEach((a) => carte.removeInteraction(a))
  if (aimant.value) {
    accroches.forEach((a) => carte.addInteraction(a))
  }
}
watch(aimant, placerAimant)

function touche(e: KeyboardEvent) {
  if (e.key === 'Escape' && enTrace.value) {
    traces[enTrace.value].abortDrawing()
    basculerTrace(null)
  }

  if (e.key === 'Escape') {
    menu.value = null
  }
}

// Surface et Valeur du Lot situé en un point (de la Parcelle du Bien avant tout Découpage) : au survol, et en tête
// du menu
type Info = [libelle: string, valeur: string]
function infosEn(coordonnee: number[]): Info[] {
  const feature = sourceLots.getFeaturesAtCoordinate(coordonnee)[0]
  const lot = props.scenario.lots.find((l) => l.tenement === feature?.get('tenement') && l.signature === feature?.get('signature'))
  if (lot) {
    return [
      ['Surface', hectares(lot.surfaceCadastrale)],
      ...(lot.cout === null ? [] : [['Valeur', euros(lot.cout)] as Info]),
      ...(lot.sansAcces ? [['Accès', 'Sans accès'] as Info] : []),
    ]
  }

  const id = sourceBien.getFeaturesAtCoordinate(coordonnee)[0]?.getId()
  const parcelle = props.bilan.parcelles.find((p) => p.id === id)
  if (!parcelle) {
    return []
  }

  const parM2 = prixEffectifs(props.bien).parM2.get(parcelle.id)
  return [
    ['Surface', hectares(parcelle.contenance)],
    ...(parM2 === undefined ? [] : [['Valeur', euros(parM2 * parcelle.contenance)] as Info]),
  ]
}

// Étiquette au survol, à la souris seulement (au doigt, les informations sont en tête du menu de l'appui long) ;
// masquée pendant un geste, un tracé ou quand le menu est ouvert
const survol = ref<{ x: number; y: number; versLaGauche: boolean; infos: Info[] } | null>(null)
function survoler(e: MapBrowserEvent) {
  const libre = (e.originalEvent as PointerEvent).pointerType === 'mouse' && !e.dragging && !enTrace.value && !enCours && !menu.value
  const infos = libre ? infosEn(e.coordinate) : []
  const [x, y] = e.pixel
  survol.value = infos.length ? { x, y, versLaGauche: x > carte.getSize()![0] - 280, infos } : null
}

// Menu ouvert par un clic droit (ou un appui long au doigt), selon ce qui est dessous : une ligne de coupe
// (suppression), un Lot (réattribution, retrait de la Parcelle), une Parcelle du Bien avant tout Découpage
// (retrait), ou un point hors du Bien (ajout de la Parcelle). Un clic gauche ou Échap le ferme.
const menu = ref<
  | { x: number; y: number; type: 'lot'; tenement: string; signature: string; parcelle: string | null; infos: Info[] }
  | { x: number; y: number; type: 'parcelle'; parcelle: string; infos: Info[] }
  | { x: number; y: number; type: 'dehors'; lon: number; lat: number }
  // sommet : indice du sommet sous le pointeur, s'il peut être supprimé
  | { x: number; y: number; type: 'ligne'; index: number; sommet: number | null }
  | null
>(null)

function ouvrirMenu(pixel: number[]) {
  // Pendant un tracé, la carte ne sert qu'à poser des sommets
  if (enTrace.value) {
    return
  }

  const [x, y] = pixel
  const ligne = carte.forEachFeatureAtPixel(pixel, (f) => f, { layerFilter: (c) => c === coucheLignes, hitTolerance: 6 })
  if (ligne) {
    const index = ligne.get('index')
    const { points, fermee } = scenarioCourant(props.bien).lignes[index]
    const sommet = points.findIndex((p) => {
      const [sx, sy] = carte.getPixelFromCoordinate(fromLonLat(p))
      return Math.hypot(sx - x, sy - y) <= PROXIMITE
    })
    // Une ligne garde au moins deux sommets, une zone trois
    const supprimable = sommet >= 0 && points.length > (fermee ? 3 : 2)
    menu.value = { x, y, type: 'ligne', index, sommet: supprimable ? sommet : null }
    return
  }

  survol.value = null
  const coordonnee = carte.getCoordinateFromPixel(pixel)
  const infos = infosEn(coordonnee)
  const parcelle = sourceBien.getFeaturesAtCoordinate(coordonnee)[0]
  const id = parcelle ? String(parcelle.getId()) : null
  const lot = sourceLots.getFeaturesAtCoordinate(coordonnee)[0]
  if (lot) {
    menu.value = { x, y, type: 'lot', tenement: lot.get('tenement'), signature: lot.get('signature'), parcelle: id, infos }
  } else if (id) {
    menu.value = { x, y, type: 'parcelle', parcelle: id, infos }
  } else {
    const [lon, lat] = toLonLat(coordonnee)
    menu.value = { x, y, type: 'dehors', lon, lat }
  }
}

// Appui long au doigt (Safari iOS n'émet pas de contextmenu) : ouvre le menu si le doigt reste immobile ;
// un déplacement ou un second doigt (zoom) l'annule
const DUREE_APPUI_LONG = 500
let appui: { id: number; x: number; y: number; minuterie: number } | null = null
// Le relâcher qui suit un appui long ne doit pas compter comme un clic, qui fermerait le menu
let appuiLongFini = false
function annulerAppui() {
  if (appui) {
    clearTimeout(appui.minuterie)
    appui = null
  }
}
function debutAppui(e: PointerEvent) {
  annulerAppui()
  appuiLongFini = false
  if (e.pointerType !== 'touch' || !e.isPrimary) {
    return
  }

  const pixel = carte.getEventPixel(e)
  appui = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    minuterie: window.setTimeout(() => {
      appui = null
      appuiLongFini = true
      ouvrirMenu(pixel)
    }, DUREE_APPUI_LONG),
  }
}
function deplacementAppui(e: PointerEvent) {
  if (appui && (e.pointerId !== appui.id || Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 10)) {
    annulerAppui()
  }
}

function choisirAcquereur(acquereur: string) {
  if (menu.value?.type === 'lot') {
    reattribuer(props.bien, menu.value.tenement, menu.value.signature, acquereur)
  }

  menu.value = null
}

function retirerLaParcelle() {
  if ((menu.value?.type === 'lot' || menu.value?.type === 'parcelle') && menu.value.parcelle) {
    emit('retirer', menu.value.parcelle)
  }

  menu.value = null
}

function ajouterLaParcelle() {
  if (menu.value?.type === 'dehors') {
    emit('ajouter', menu.value.lon, menu.value.lat)
  }

  menu.value = null
}

function relierExtremites() {
  if (menu.value?.type === 'ligne' && !fermerLigne(props.bien, menu.value.index)) {
    alert('La zone ainsi fermée ne découpe aucun Lot.')
  }

  menu.value = null
}

function supprimerLeSommet() {
  if (menu.value?.type === 'ligne' && menu.value.sommet !== null) {
    const { index, sommet } = menu.value
    const points = scenarioCourant(props.bien).lignes[index].points.filter((_, i) => i !== sommet)
    if (!modifierLigne(props.bien, index, points)) {
      alert('Sans ce sommet, la ligne ne découperait plus les mêmes Lots.')
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
    layers: [couches.orthophoto, couches.rpg, couches.cadastre, coucheBien, coucheLots, coucheVoies, coucheLignes],
    view: new View({ center: fromLonLat([2.5, 46.6]), zoom: 6 }),
  })
  carte.addInteraction(modification)
  placerAimant()
  window.addEventListener('keydown', touche)
  impression.addEventListener('change', changementImpression)
  carte.on('movestart', () => (menu.value = null))
  carte.on('singleclick', () => {
    if (appuiLongFini) {
      appuiLongFini = false
      return
    }

    menu.value = null
  })
  const fenetre = carte.getViewport()
  fenetre.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    // Sur Android, l'appui long émet aussi contextmenu : le menu est déjà ouvert
    if (!appuiLongFini) {
      ouvrirMenu(carte.getEventPixel(e))
    }
  })
  carte.on('pointermove', survoler)
  fenetre.addEventListener('pointermove', suivrePointeur)
  fenetre.addEventListener('mouseleave', () => {
    survol.value = null
    pointeur = null
  })
  fenetre.addEventListener('pointerdown', debutAppui)
  fenetre.addEventListener('pointermove', deplacementAppui)
  fenetre.addEventListener('pointerup', annulerAppui)
  // Un appui sans geste, aimant désactivé, a pu ne laisser modifiable que la ligne saisie
  fenetre.addEventListener('pointerup', () => {
    if (!enCours) {
      rendreToutesModifiables()
    }
  })
  fenetre.addEventListener('pointercancel', annulerAppui)
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
      <button type="button" title="Annuler (Ctrl+Z)" :disabled="!peutAnnuler" @click="emit('annuler')">↶</button>
      <button type="button" title="Rétablir (Ctrl+Maj+Z)" :disabled="!peutRetablir" @click="emit('retablir')">↷</button>
      <template v-if="bien.parcelles.length">
        <button type="button" @click="basculerTrace('ligne')">
          {{ enTrace === 'ligne' ? 'Annuler le tracé' : '✏ Tracer une ligne de coupe' }}
        </button>
        <button type="button" @click="basculerTrace('zone')">
          {{ enTrace === 'zone' ? 'Annuler le tracé' : '⬠ Tracer une zone' }}
        </button>
        <label class="case"><input v-model="aimant" type="checkbox" /> 🧲 Aimant</label>
        <label
          class="case"
          title="Routes et chemins de la BD TOPO (IGN) qui desservent les Lots. Certains chemins d'exploitation n'y figurent pas, et un chemin peut être privé : l'alerte d'accès invite à vérifier."
        >
          <input v-model="voiesVisibles" type="checkbox" :disabled="!voies" /> Voies
        </label>
      </template>
      <span v-if="enTrace === 'ligne'" class="aide">Clic pour chaque sommet, double-clic ou clic sur le dernier point pour finir</span>
      <span v-if="enTrace === 'zone'" class="aide">Clic pour chaque sommet, clic sur le premier point ou double-clic pour fermer</span>
    </div>
    <dl
      v-if="survol"
      class="etiquette infos"
      :style="
        survol.versLaGauche
          ? { right: `calc(100% - ${survol.x - 14}px)`, top: survol.y + 14 + 'px' }
          : { left: survol.x + 14 + 'px', top: survol.y + 14 + 'px' }
      "
    >
      <template v-for="[libelle, valeur] in survol.infos" :key="libelle">
        <dt>{{ libelle }}</dt>
        <dd>{{ valeur }}</dd>
      </template>
    </dl>
    <div v-if="menu" class="menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <dl v-if="(menu.type === 'lot' || menu.type === 'parcelle') && menu.infos.length" class="infos">
        <template v-for="[libelle, valeur] in menu.infos" :key="libelle">
          <dt>{{ libelle }}</dt>
          <dd>{{ valeur }}</dd>
        </template>
      </dl>
      <template v-if="menu.type === 'lot'">
        <div class="titre">Attribuer ce Lot à</div>
        <button v-for="a in bien.acquereurs" :key="a.id" type="button" @click="choisirAcquereur(a.id)">
          <span class="pastille" :style="{ background: a.couleur }"></span> {{ a.nom }}
        </button>
        <button v-if="menu.parcelle" type="button" class="retrait" @click="retirerLaParcelle">
          Retirer la Parcelle {{ menu.parcelle }} du Bien
        </button>
      </template>
      <button v-else-if="menu.type === 'parcelle'" type="button" @click="retirerLaParcelle">
        Retirer la Parcelle {{ menu.parcelle }} du Bien
      </button>
      <button v-else-if="menu.type === 'dehors'" type="button" @click="ajouterLaParcelle">
        Ajouter au Bien la Parcelle située ici
      </button>
      <template v-else>
        <button
          v-if="scenario.brouillons.includes(menu.index) && scenarioCourant(bien).lignes[menu.index].points.length >= 3"
          type="button"
          @click="relierExtremites"
        >
          Relier les extrémités
        </button>
        <button v-if="menu.sommet !== null" type="button" @click="supprimerLeSommet">Supprimer ce sommet</button>
        <button type="button" @click="supprimerLaLigne">Supprimer cette ligne de coupe</button>
      </template>
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
  top: 10px;
  left: 48px;
  /* Laisse la place à l'encart Fonds : les boutons passent à la ligne sur écran étroit */
  right: 160px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  pointer-events: none;
}
.outils > * {
  pointer-events: auto;
}
.outils button {
  height: auto;
  min-height: 30px;
  white-space: normal;
  background: white;
  box-shadow: var(--ombre);
}
.outils .aide,
.outils .case {
  background: white;
  padding: 4px 8px;
  border-radius: var(--rayon);
  box-shadow: var(--ombre);
}
.outils .case {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.outils .case input {
  margin: 0;
}
.etiquette {
  position: absolute;
  margin: 0;
  padding: 6px 10px;
  background: white;
  border-radius: var(--rayon);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
.infos {
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 12px;
  font-size: 12px;
  white-space: nowrap;
}
.infos dt {
  color: var(--discret);
}
.infos dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.menu .infos {
  margin: 0 0 4px;
  padding: 4px 8px 6px;
  border-bottom: 1px solid var(--bordure);
}
.menu {
  position: absolute;
  background: white;
  border: 1px solid var(--bordure);
  border-radius: var(--rayon);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.menu .titre {
  padding: 2px 8px;
  font-size: 12px;
  color: var(--discret);
}
.menu button {
  height: 28px;
  border: none;
  background: none;
  text-align: left;
}
.menu button:hover {
  background: var(--fond-doux);
}
.menu .retrait {
  margin-top: 4px;
  border-top: 1px solid var(--bordure);
  border-radius: 0 0 var(--rayon) var(--rayon);
  color: var(--erreur);
}
.carte {
  position: relative;
  height: 100%;
}
.ol {
  position: absolute;
  inset: 0;
  /* Pas de loupe ni de sélection de texte à l'appui long, qui ouvre le menu */
  -webkit-touch-callout: none;
  user-select: none;
}
.fonds {
  position: absolute;
  top: 10px;
  right: 10px;
  margin: 0;
  padding: 8px 12px;
  background: white;
  border: none;
  border-radius: var(--rayon);
  box-shadow: var(--ombre);
  font-size: 13px;
}
/* Légende flottante : placée dans le cadre plutôt qu'à cheval sur sa bordure */
.fonds legend {
  float: left;
  width: 100%;
  margin-bottom: 4px;
  padding: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--discret);
}
.fonds label {
  display: flex;
  align-items: center;
  gap: 6px;
  clear: left;
  padding: 1px 0;
  cursor: pointer;
}
.fonds input {
  margin: 0;
}
/* En dernier : l'emporte sur les règles d'affichage ci-dessus */
@media print {
  .outils,
  .menu,
  .etiquette,
  .fonds,
  .boussole,
  .carte :deep(.ol-control) {
    display: none;
  }
}
</style>
