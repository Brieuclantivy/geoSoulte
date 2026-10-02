import type { MultiPolygon, Position } from 'geojson'
import { difference, intersection, union, type Geom } from 'polyclip-ts'
import { tenementsDuBien, type Bien, type LigneCoupe, type Parcelle } from './bien'
import { aire, boite, pointVersL93, pointVersWgs84, polygonesVersWgs84, versL93, type PolygonesL93 } from './geo'

export interface BilanLot {
  tenement: string
  signature: string
  acquereur: string | null
  geometrie: MultiPolygon
  surfaceMesuree: number
  surfaceCadastrale: number
}

export interface BilanAcquereur {
  id: string
  surfaceMesuree: number
  surfaceCadastrale: number
  // Objectif en m², ou null s'il n'est pas fixé
  objectif: number | null
  // Surface cadastrale - Objectif
  ecart: number | null
}

export interface BilanScenario {
  lots: BilanLot[]
  acquereurs: BilanAcquereur[]
}

const TOLERANCE_BISSECTION = 0.01 // m²

// Morceau d'une Parcelle situé d'un même côté de chaque ligne de coupe
interface Morceau {
  signature: string
  geometrie: PolygonesL93
  // Contenance par m² mesuré de la Parcelle d'origine
  densite: number
}

function enGeom(polygones: PolygonesL93): Geom {
  return polygones as Geom
}

// Polygone couvrant le côté gauche de la ligne (sens de parcours de ses points), dans un rayon largement
// supérieur au Tènement : la ligne est prolongée à ses deux bouts puis refermée par la gauche.
function coteGauche(points: Position[], portee: number): PolygonesL93 {
  const [ax, ay] = points[0]
  const [bx, by] = points[points.length - 1]
  const longueur = Math.hypot(bx - ax, by - ay)
  const ux = (bx - ax) / longueur
  const uy = (by - ay) / longueur
  // Normale gauche
  const nx = -uy
  const ny = ux
  const debut = [ax - ux * portee, ay - uy * portee]
  const fin = [bx + ux * portee, by + uy * portee]
  const anneau = [
    debut,
    ...points,
    fin,
    [fin[0] + nx * portee, fin[1] + ny * portee],
    [debut[0] + nx * portee, debut[1] + ny * portee],
    debut,
  ]
  return [[anneau]]
}

function morceaux(parcelles: Parcelle[], lignes: LigneCoupe[]): Morceau[] {
  const geometries = parcelles.map((p) => versL93(p.geometrie))
  const [x0, y0, x1, y1] = boite(geometries.flat())
  const portee = 10 * Math.hypot(x1 - x0, y1 - y0)
  const cotes = lignes.map((l) => coteGauche(l.points.map(pointVersL93), portee))

  let resultat: Morceau[] = parcelles.map((p, i) => ({
    signature: '',
    geometrie: geometries[i],
    densite: p.contenance / aire(geometries[i]),
  }))
  for (const cote of cotes) {
    resultat = resultat.flatMap((m) =>
      [
        { ...m, signature: m.signature + 'G', geometrie: intersection(enGeom(m.geometrie), enGeom(cote)) },
        { ...m, signature: m.signature + 'D', geometrie: difference(enGeom(m.geometrie), enGeom(cote)) },
      ].filter((n) => n.geometrie.length > 0),
    )
  }

  return resultat
}

export function bilanScenario(bien: Bien): BilanScenario {
  const { lignes, attributions, objectifs } = bien.scenario
  const lots: BilanLot[] = tenementsDuBien(bien).flatMap(({ cle, parcelles }) => {
    const parSignature = new Map<string, Morceau[]>()
    for (const m of morceaux(
      parcelles,
      lignes.filter((l) => l.tenement === cle),
    )) {
      parSignature.set(m.signature, [...(parSignature.get(m.signature) ?? []), m])
    }

    return [...parSignature].map(([signature, ms]) => ({
      tenement: cle,
      signature,
      acquereur: attributions.find((a) => a.tenement === cle && a.signature === signature)?.acquereur ?? null,
      geometrie: polygonesVersWgs84(union(...(ms.map((m) => enGeom(m.geometrie)) as [Geom, ...Geom[]]))),
      surfaceMesuree: ms.reduce((t, m) => t + aire(m.geometrie), 0),
      surfaceCadastrale: ms.reduce((t, m) => t + aire(m.geometrie) * m.densite, 0),
    }))
  })

  const acquereurs = bien.acquereurs.map(({ id }) => {
    const siens = lots.filter((l) => l.acquereur === id)
    const surfaceCadastrale = siens.reduce((t, l) => t + l.surfaceCadastrale, 0)
    const objectif = objectifs[id] ? objectifs[id].valeur * 10000 : null
    return {
      id,
      surfaceMesuree: siens.reduce((t, l) => t + l.surfaceMesuree, 0),
      surfaceCadastrale,
      objectif,
      ecart: objectif === null ? null : surfaceCadastrale - objectif,
    }
  })

  return { lots, acquereurs }
}

// Surface cadastrale de la partie des Parcelles située à l'ouest de l'abscisse x (Lambert 93)
function surfaceCadastraleAvant(parcelles: { geometrie: PolygonesL93; densite: number }[], x: number, boiteY: [number, number]): number {
  const demiPlan: PolygonesL93 = [
    [
      [
        [x - 1e7, boiteY[0] - 1],
        [x, boiteY[0] - 1],
        [x, boiteY[1] + 1],
        [x - 1e7, boiteY[1] + 1],
        [x - 1e7, boiteY[0] - 1],
      ],
    ],
  ]
  return parcelles.reduce((t, p) => t + aire(intersection(enGeom(p.geometrie), enGeom(demiPlan))) * p.densite, 0)
}

// Découpe chaque Tènement en bandes parallèles (lignes nord-sud, de l'ouest vers l'est), une par Acquéreur
// ayant un Objectif, dans l'ordre des Acquéreurs ; chaque bande reçoit la part du Tènement correspondant à
// la part de son Objectif dans la somme des Objectifs.
export function lancerDecoupage(bien: Bien): void {
  const participants = bien.acquereurs.filter((a) => (bien.scenario.objectifs[a.id]?.valeur ?? 0) > 0)
  const total = participants.reduce((t, a) => t + bien.scenario.objectifs[a.id].valeur, 0)
  bien.scenario.lignes = []
  bien.scenario.attributions = []
  if (participants.length === 0) {
    return
  }

  for (const { cle, parcelles } of tenementsDuBien(bien)) {
    const geometries = parcelles.map((p) => {
      const geometrie = versL93(p.geometrie)
      return { geometrie, densite: p.contenance / aire(geometrie) }
    })
    const [x0, y0, x1, y1] = boite(geometries.map((g) => g.geometrie).flat())
    const contenance = parcelles.reduce((t, p) => t + p.contenance, 0)
    const nbLignes = participants.length - 1

    let cumul = 0
    for (let k = 0; k < nbLignes; k++) {
      cumul += (bien.scenario.objectifs[participants[k].id].valeur / total) * contenance
      let bas = x0
      let haut = x1
      while (haut - bas > 1e-6) {
        const milieu = (bas + haut) / 2
        const s = surfaceCadastraleAvant(geometries, milieu, [y0, y1])
        if (Math.abs(s - cumul) < TOLERANCE_BISSECTION) {
          bas = haut = milieu
        } else if (s < cumul) {
          bas = milieu
        } else {
          haut = milieu
        }
      }

      // Ligne parcourue du sud au nord : sa gauche est l'ouest, côté des bandes précédentes
      bien.scenario.lignes.push({
        tenement: cle,
        points: [pointVersWgs84([bas, y0 - 1]), pointVersWgs84([bas, y1 + 1])],
      })
    }

    participants.forEach((a, j) => {
      bien.scenario.attributions.push({
        tenement: cle,
        signature: 'D'.repeat(j) + 'G'.repeat(nbLignes - j),
        acquereur: a.id,
      })
    })
  }
}
