// Accès des Lots aux voies : un Lot enclavé ne touche ni route ni chemin praticable, ni directement ni par un autre
// Lot de son Acquéreur. Simple alerte : la BD TOPO ignore des chemins d'exploitation, et les servitudes ne sont pas
// connues.
import type { MultiPolygon, Position } from 'geojson'
import type { Parcelle } from './bien'
import { boite, distanceLigne, pointVersL93, pointVersWgs84, versL93, voisines, type PolygonesL93 } from './geo'

// Tronçon de route de la BD TOPO (IGN) : attributs utiles et axe en WGS84
export interface Troncon {
  nature: string
  etat: string
  accesVehiculeLeger: string | null
  points: Position[]
}

// Distance maximale (m) entre un Lot et l'axe d'une voie qui le dessert : la chaussée fait environ 4 m de large,
// et le cadastre est imprécis
export const DISTANCE_ACCES = 5

// Écart maximal (m) entre deux Lots d'un même Acquéreur pour que l'accès passe de l'un à l'autre
const TOLERANCE_CONTACT = 1

// Routes, routes empierrées et chemins. Les tronçons privés ou réservés aux ayants droit comptent : on ne connaît
// pas les droits des Acquéreurs.
const NATURES_PRATICABLES = ['Route à 1 chaussée', 'Route à 2 chaussées', 'Rond-point', 'Route empierrée', 'Chemin']

export function praticable(troncon: Troncon): boolean {
  return (
    NATURES_PRATICABLES.includes(troncon.nature) &&
    troncon.etat === 'En service' &&
    troncon.accesVehiculeLeger !== 'Physiquement impossible'
  )
}

// Emprise [lon min, lat min, lon max, lat max] où chercher les voies qui peuvent desservir les Parcelles :
// leur boîte englobante élargie de DISTANCE_ACCES ; null sans Parcelle
export function empriseVoies(parcelles: Parcelle[]): [number, number, number, number] | null {
  if (!parcelles.length) {
    return null
  }

  const [x0, y0, x1, y1] = boite(parcelles.flatMap((p) => versL93(p.geometrie)))
  const d = DISTANCE_ACCES
  const coins = [
    [x0 - d, y0 - d],
    [x1 + d, y0 - d],
    [x1 + d, y1 + d],
    [x0 - d, y1 + d],
  ].map(pointVersWgs84)
  const lons = coins.map((c) => c[0])
  const lats = coins.map((c) => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

function procheDe(a: PolygonesL93, b: PolygonesL93, distance: number): boolean {
  const [ax0, ay0, ax1, ay1] = boite(a)
  const [bx0, by0, bx1, by1] = boite(b)
  return !(ax0 - distance > bx1 || bx0 - distance > ax1 || ay0 - distance > by1 || by0 - distance > ay1)
}

// Lots attribués non desservis. Un Lot est desservi s'il passe à moins de `distance` mètres d'un tronçon
// praticable, ou s'il touche un Lot desservi du même Acquéreur (de proche en proche). Sans tronçons chargés
// (null), on ne sait rien : aucun Lot n'est déclaré enclavé.
export function lotsEnclaves<L extends { acquereur: string | null; geometrie: MultiPolygon }>(
  lots: L[],
  troncons: Troncon[] | null,
  distance = DISTANCE_ACCES,
): L[] {
  if (!troncons) {
    return []
  }

  const axes = troncons.filter(praticable).map((t) => t.points.map(pointVersL93))
  const attribues = lots.filter((l) => l.acquereur !== null).map((lot) => ({ lot, geometrie: versL93(lot.geometrie) }))
  const desservis = new Set(
    attribues.filter(({ geometrie }) =>
      axes.some((axe) => procheDe([[axe]], geometrie, distance) && distanceLigne(axe, geometrie) <= distance),
    ),
  )

  let propagation = true
  while (propagation) {
    propagation = false
    for (const a of attribues) {
      if (
        !desservis.has(a) &&
        attribues.some(
          (b) => desservis.has(b) && b.lot.acquereur === a.lot.acquereur && voisines(a.geometrie, b.geometrie, TOLERANCE_CONTACT),
        )
      ) {
        desservis.add(a)
        propagation = true
      }
    }
  }

  return attribues.filter((a) => !desservis.has(a)).map((a) => a.lot)
}
