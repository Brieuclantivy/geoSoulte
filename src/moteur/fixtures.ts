// Outils de test : construit des Parcelles à partir de rectangles exprimés en Lambert 93 (mètres)
import proj4 from 'proj4'
import type { Position } from 'geojson'
import type { Parcelle } from './bien'

const L93 =
  '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs'
const versWgs84 = proj4(L93, 'WGS84')

// Origine arbitraire en France métropolitaine
const X0 = 650000
const Y0 = 6750000

export function rectangle(id: string, x: number, y: number, largeur: number, hauteur: number, contenance?: number): Parcelle {
  const coins = [
    [x, y],
    [x + largeur, y],
    [x + largeur, y + hauteur],
    [x, y + hauteur],
    [x, y],
  ].map(([cx, cy]) => versWgs84.forward([X0 + cx, Y0 + cy]))
  return {
    id,
    geometrie: { type: 'Polygon', coordinates: [coins] },
    contenance: contenance ?? largeur * hauteur,
  }
}

// Inverse de `rectangle` : position WGS84 → coordonnées locales (mètres) du jeu de test
export function enLocal(p: Position): Position {
  const [x, y] = versWgs84.inverse(p)
  return [x - X0, y - Y0]
}
