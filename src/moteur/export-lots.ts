// Export des Lots du Scénario courant en GeoJSON et en KML, pour les ouvrir dans un logiciel de cartographie
// (QGIS, Google Earth, Géoportail) ou les transmettre comme point de départ à un géomètre ou un notaire
import type { Feature, FeatureCollection, MultiPolygon, Position } from 'geojson'
import { scenarioCourant, type Bien } from './bien'
import { bilanScenario } from './decoupage'

const MENTION = 'Simulation indicative geoSoulte, pas un plan de géomètre'

export interface ProprietesLot {
  // Nom de l'Acquéreur, null pour une surface non attribuée
  acquereur: string | null
  couleur: string | null
  surface_mesuree_m2: number
  surface_cadastrale_m2: number
  // Absent si aucun prix n'est saisi
  cout_eur?: number
  tenement: string
  scenario: string
  parcelles: string[]
}

export type LotsGeoJSON = FeatureCollection<MultiPolygon, ProprietesLot> & { name: string; description: string }

// Un objet par Lot ; surfaces arrondies au m², Coût à l'euro
export function lotsEnGeoJSON(bien: Bien): LotsGeoJSON {
  const scenario = scenarioCourant(bien).nom
  const features = bilanScenario(bien).lots.map((lot): Feature<MultiPolygon, ProprietesLot> => {
    const acquereur = bien.acquereurs.find((a) => a.id === lot.acquereur)
    return {
      type: 'Feature',
      geometry: lot.geometrie,
      properties: {
        acquereur: acquereur?.nom ?? null,
        couleur: acquereur?.couleur ?? null,
        surface_mesuree_m2: Math.round(lot.surfaceMesuree),
        surface_cadastrale_m2: Math.round(lot.surfaceCadastrale),
        ...(lot.cout === null ? {} : { cout_eur: Math.round(lot.cout) }),
        tenement: lot.tenement,
        scenario,
        parcelles: lot.parcelles,
      },
    }
  })
  return { type: 'FeatureCollection', name: `geoSoulte — ${scenario}`, description: MENTION, features }
}

function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Couleur '#rrggbb' au format KML 'aabbggrr'
function couleurKml(couleur: string, alpha: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => couleur.slice(i, i + 2))
  return alpha + b + g + r
}

function hectares(m2: number): string {
  return `${(m2 / 10000).toFixed(2).replace('.', ',')} ha`
}

function anneauKml(anneau: Position[]): string {
  return `<LinearRing><coordinates>${anneau.map(([lon, lat]) => `${lon},${lat}`).join(' ')}</coordinates></LinearRing>`
}

function polygonesKml(geometrie: MultiPolygon): string {
  const polygones = geometrie.coordinates.map(
    ([exterieur, ...trous]) =>
      `<Polygon><outerBoundaryIs>${anneauKml(exterieur)}</outerBoundaryIs>` +
      trous.map((t) => `<innerBoundaryIs>${anneauKml(t)}</innerBoundaryIs>`).join('') +
      '</Polygon>',
  )
  return `<MultiGeometry>${polygones.join('')}</MultiGeometry>`
}

const GRIS = '#808080'

// Un Placemark par Lot, rempli en semi-transparence à la couleur de son Acquéreur, et un dossier par Acquéreur
export function lotsEnKML(bien: Bien): string {
  const { name, description, features } = lotsEnGeoJSON(bien)
  const groupes = new Map<string | null, Feature<MultiPolygon, ProprietesLot>[]>()
  for (const f of features) {
    groupes.set(f.properties.acquereur, [...(groupes.get(f.properties.acquereur) ?? []), f])
  }

  const styles = [...groupes.values()].map((fs, i) => {
    const couleur = fs[0].properties.couleur ?? GRIS
    return (
      `<Style id="s${i}"><LineStyle><color>${couleurKml(couleur, 'ff')}</color><width>2</width></LineStyle>` +
      `<PolyStyle><color>${couleurKml(couleur, '99')}</color></PolyStyle></Style>`
    )
  })
  const dossiers = [...groupes].map(([acquereur, fs], i) => {
    const nom = acquereur ?? 'Sans Acquéreur'
    const placemarks = fs.map(({ geometry, properties: p }) => {
      const lignes = [
        `Acquéreur : ${nom}`,
        `Surface cadastrale : ${hectares(p.surface_cadastrale_m2)}`,
        `Surface mesurée : ${hectares(p.surface_mesuree_m2)}`,
        ...(p.cout_eur === undefined ? [] : [`Coût : ${p.cout_eur.toLocaleString('fr-FR')} €`]),
        `Tènement : ${p.tenement}`,
        `Parcelles : ${p.parcelles.join(', ')}`,
      ]
      return (
        `<Placemark><name>${echapper(`Lot de ${nom}`)}</name>` +
        // Google Earth affiche la description en HTML
        `<description><![CDATA[${lignes.map(echapper).join('<br/>')}]]></description>` +
        `<styleUrl>#s${i}</styleUrl>${polygonesKml(geometry)}</Placemark>`
      )
    })
    return `<Folder><name>${echapper(nom)}</name>${placemarks.join('\n')}</Folder>`
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    `<name>${echapper(name)}</name><description>${echapper(description)}</description>`,
    ...styles,
    ...dossiers,
    '</Document></kml>',
  ].join('\n')
}

// Nom de fichier tiré du Scénario courant : 'Scénario 1' → 'geosoulte-scenario-1.<extension>'
export function nomFichierLots(bien: Bien, extension: string): string {
  const nom = scenarioCourant(bien)
    .nom.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `geosoulte-${nom || 'scenario'}.${extension}`
}
