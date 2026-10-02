// Géométrie interne du Moteur : tout calcul de surface ou de découpe se fait en Lambert 93 (mètres)
import proj4 from 'proj4'
import type { MultiPolygon, Polygon, Position } from 'geojson'

export type Geometrie = Polygon | MultiPolygon

const L93 =
  '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs'
const projection = proj4('WGS84', L93)

// Polygones (anneaux de positions) en Lambert 93
export type PolygonesL93 = Position[][][]

export function versL93(g: Geometrie): PolygonesL93 {
  const polygones = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  return polygones.map((anneaux) => anneaux.map((anneau) => anneau.map((p) => projection.forward(p))))
}

function aireAnneau(anneau: Position[]): number {
  let somme = 0
  for (let i = 0; i < anneau.length - 1; i++) {
    somme += anneau[i][0] * anneau[i + 1][1] - anneau[i + 1][0] * anneau[i][1]
  }
  return Math.abs(somme) / 2
}

export function aire(polygones: PolygonesL93): number {
  return polygones.reduce(
    (total, [exterieur, ...trous]) =>
      total + aireAnneau(exterieur) - trous.reduce((t, trou) => t + aireAnneau(trou), 0),
    0,
  )
}

function distancePointSegment(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

export function boite(polygones: PolygonesL93): [number, number, number, number] {
  const points = polygones.flat(2)
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function distanceSommetsVersBords(a: PolygonesL93, b: PolygonesL93): number {
  let min = Infinity
  for (const p of a.flat(2)) {
    for (const anneau of b.flat()) {
      for (let i = 0; i < anneau.length - 1; i++) {
        min = Math.min(min, distancePointSegment(p, anneau[i], anneau[i + 1]))
      }
    }
  }
  return min
}

// Vrai si les deux géométries sont à moins de `tolerance` mètres l'une de l'autre.
// Suffisant pour des Parcelles cadastrales, qui ne se chevauchent pas : leurs contacts passent par des sommets.
export function voisines(a: PolygonesL93, b: PolygonesL93, tolerance: number): boolean {
  const [ax0, ay0, ax1, ay1] = boite(a)
  const [bx0, by0, bx1, by1] = boite(b)
  if (ax0 - tolerance > bx1 || bx0 - tolerance > ax1 || ay0 - tolerance > by1 || by0 - tolerance > ay1) {
    return false
  }

  return Math.min(distanceSommetsVersBords(a, b), distanceSommetsVersBords(b, a)) <= tolerance
}

const inverse = proj4(L93, 'WGS84')

export function pointVersL93(p: Position): Position {
  return projection.forward(p)
}

export function pointVersWgs84(p: Position): Position {
  return inverse.forward(p)
}

export function polygonesVersWgs84(polygones: PolygonesL93): MultiPolygon {
  return {
    type: 'MultiPolygon',
    coordinates: polygones.map((anneaux) => anneaux.map((anneau) => anneau.map(pointVersWgs84))),
  }
}
