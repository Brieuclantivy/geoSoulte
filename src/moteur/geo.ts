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

export function tourner(p: Position, angle: number, pivot: Position): Position {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const x = p[0] - pivot[0]
  const y = p[1] - pivot[1]
  return [pivot[0] + x * cos - y * sin, pivot[1] + x * sin + y * cos]
}

export function tournerPolygones(polygones: PolygonesL93, angle: number, pivot: Position): PolygonesL93 {
  return polygones.map((anneaux) => anneaux.map((anneau) => anneau.map((p) => tourner(p, angle, pivot))))
}

function enveloppeConvexe(points: Position[]): Position[] {
  const tries = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const croix = (o: Position, a: Position, b: Position) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const demi = (liste: Position[]) => {
    const h: Position[] = []
    for (const p of liste) {
      while (h.length >= 2 && croix(h[h.length - 2], h[h.length - 1], p) <= 0) {
        h.pop()
      }

      h.push(p)
    }
    return h.slice(0, -1)
  }
  return [...demi(tries), ...demi([...tries].reverse())]
}

// Direction (radians, dans ]-π/2, π/2]) du grand côté du plus petit rectangle englobant les polygones
export function axeLong(polygones: PolygonesL93): number {
  const enveloppe = enveloppeConvexe(polygones.flat(2))
  let meilleur = { aire: Infinity, angle: 0 }
  for (let i = 0; i < enveloppe.length; i++) {
    const a = enveloppe[i]
    const b = enveloppe[(i + 1) % enveloppe.length]
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
    const tournes = enveloppe.map((p) => tourner(p, -angle, [0, 0]))
    const [x0, y0, x1, y1] = boite([[tournes]])
    const aireRectangle = (x1 - x0) * (y1 - y0)
    if (aireRectangle < meilleur.aire) {
      meilleur = { aire: aireRectangle, angle: x1 - x0 >= y1 - y0 ? angle : angle + Math.PI / 2 }
    }
  }

  // Ramène la direction dans ]-π/2, π/2]
  let angle = meilleur.angle % Math.PI
  if (angle <= -Math.PI / 2) {
    angle += Math.PI
  } else if (angle > Math.PI / 2) {
    angle -= Math.PI
  }

  return angle
}

function segmentsSeCoupent(a: Position, b: Position, c: Position, d: Position): boolean {
  const orient = (p: Position, q: Position, r: Position) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b)
}

export function pointDans(p: Position, polygones: PolygonesL93): boolean {
  return polygones.some((anneaux) => {
    let dedans = false
    for (const anneau of anneaux) {
      for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
        const [xi, yi] = anneau[i]
        const [xj, yj] = anneau[j]
        if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
          dedans = !dedans
        }
      }
    }
    return dedans
  })
}

// Vrai si la ligne brisée touche les polygones (croise un bord ou a un point à l'intérieur)
export function ligneTouche(points: Position[], polygones: PolygonesL93): boolean {
  if (points.some((p) => pointDans(p, polygones))) {
    return true
  }

  const bords = polygones.flat()
  for (let i = 0; i < points.length - 1; i++) {
    for (const anneau of bords) {
      for (let k = 0; k < anneau.length - 1; k++) {
        if (segmentsSeCoupent(points[i], points[i + 1], anneau[k], anneau[k + 1])) {
          return true
        }
      }
    }
  }

  return false
}

// Distance (m) entre la ligne brisée et les polygones : 0 si elle les touche, sinon le plus court écart entre
// un de ses segments et un bord
export function distanceLigne(points: Position[], polygones: PolygonesL93): number {
  if (ligneTouche(points, polygones)) {
    return 0
  }

  let min = Infinity
  for (const anneau of polygones.flat()) {
    for (let k = 0; k < anneau.length - 1; k++) {
      for (let i = 0; i < points.length - 1; i++) {
        min = Math.min(
          min,
          distancePointSegment(points[i], anneau[k], anneau[k + 1]),
          distancePointSegment(points[i + 1], anneau[k], anneau[k + 1]),
          distancePointSegment(anneau[k], points[i], points[i + 1]),
          distancePointSegment(anneau[k + 1], points[i], points[i + 1]),
        )
      }
    }
  }

  return min
}
