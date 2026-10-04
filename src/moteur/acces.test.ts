import { describe, expect, test } from 'vitest'
import type { Position } from 'geojson'
import { ajouterAcquereur, ajouterParcelle, creerBien, type Bien } from './bien'
import { ajouterLigne, bilanScenario, reattribuer } from './decoupage'
import { empriseVoies, type Troncon } from './acces'
import { pointDans, pointVersL93, versL93 } from './geo'
import { rectangle } from './fixtures'

// Point du repère du jeu de test (mètres) en WGS84
const pt = (x: number, y: number) => rectangle('tmp', x, y, 1, 1).geometrie.coordinates[0][0] as Position

function troncon(points: [number, number][], nature = 'Chemin', etat = 'En service', accesVehiculeLeger = 'Libre'): Troncon {
  return { nature, etat, accesVehiculeLeger, points: points.map(([x, y]) => pt(x, y)) }
}

// Chemin longeant le sud du Tènement, à 3 m de sa limite
const CHEMIN_SUD = troncon([
  [-100, -3],
  [1100, -3],
])

// Tènement de 1000 × 500 m coupé en bandes est-ouest aux ordonnées données ; chaque bande, du sud au nord, est
// attribuée à l'Acquéreur de même rang
function bienEnBandes(coupes: number[], noms: string[]): Bien {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
  const ids = new Map<string, string>()
  for (const nom of new Set(noms)) {
    ids.set(nom, ajouterAcquereur(bien, nom))
  }

  for (const y of coupes) {
    ajouterLigne(bien, [pt(-50, y), pt(1050, y)])
  }

  const limites = [0, ...coupes, 500]
  limites.slice(1).forEach((y, i) => {
    const lot = lotEn(bien, 500, (limites[i] + y) / 2)
    reattribuer(bien, lot.tenement, lot.signature, ids.get(noms[i])!)
  })
  return bien
}

function lotEn(bien: Bien, x: number, y: number, voies: Troncon[] | null = null) {
  const p = pointVersL93(pt(x, y))
  return bilanScenario(bien, voies).lots.find((l) => pointDans(p, versL93(l.geometrie)))!
}

describe('Lot enclavé', () => {
  test('un Lot qui longe un chemin est desservi ; celui du fond, séparé par le Lot d’un autre Acquéreur, est enclavé', () => {
    const bien = bienEnBandes([250], ['Paul', 'Marie'])

    expect(lotEn(bien, 500, 100, [CHEMIN_SUD]).sansAcces).toBe(false)
    expect(lotEn(bien, 500, 400, [CHEMIN_SUD]).sansAcces).toBe(true)
    expect(bilanScenario(bien, [CHEMIN_SUD]).avertissements).toContain(
      'Lot de Marie (25,00 ha, Tènement A) : aucun accès à une route ou un chemin',
    )
  })

  test('une voie au-delà de 5 m ne dessert pas ; une voie qui traverse le Lot le dessert', () => {
    const bien = bienEnBandes([250], ['Paul', 'Marie'])
    const loin = troncon([
      [-100, 508],
      [1100, 508],
    ])
    const traversant = troncon([
      [500, 450],
      [500, 600],
    ])

    expect(lotEn(bien, 500, 400, [loin]).sansAcces).toBe(true)
    expect(lotEn(bien, 500, 400, [traversant]).sansAcces).toBe(false)
  })

  test('un Lot enclavé qui touche un Lot desservi du même Acquéreur est desservi, de proche en proche', () => {
    const bien = bienEnBandes([100, 200, 300, 400], ['Paul', 'Paul', 'Paul', 'Marie', 'Paul'])
    const bilan = bilanScenario(bien, [CHEMIN_SUD])

    // Les trois bandes sud de Paul se transmettent l'accès ; sa bande nord, isolée par Marie, est enclavée,
    // comme celle de Marie
    expect(bilan.lots.filter((l) => l.sansAcces)).toHaveLength(2)
    expect(lotEn(bien, 500, 250, [CHEMIN_SUD]).sansAcces).toBe(false)
    expect(lotEn(bien, 500, 350, [CHEMIN_SUD]).sansAcces).toBe(true)
    expect(lotEn(bien, 500, 450, [CHEMIN_SUD]).sansAcces).toBe(true)
  })

  test('un sentier, un tronçon hors service ou physiquement impossible d’accès ne dessert pas', () => {
    const bien = bienEnBandes([250], ['Paul', 'Marie'])
    const nord = (nature: string, etat?: string, acces?: string) =>
      troncon(
        [
          [-100, 503],
          [1100, 503],
        ],
        nature,
        etat,
        acces,
      )

    expect(lotEn(bien, 500, 400, [nord('Sentier')]).sansAcces).toBe(true)
    expect(lotEn(bien, 500, 400, [nord('Chemin', 'En construction')]).sansAcces).toBe(true)
    expect(lotEn(bien, 500, 400, [nord('Route empierrée', 'En service', 'Physiquement impossible')]).sansAcces).toBe(true)
    // Un accès réservé aux ayants droit compte : on ne connaît pas les droits des Acquéreurs
    expect(lotEn(bien, 500, 400, [nord('Route à 1 chaussée', 'En service', 'Restreint aux ayants droit')]).sansAcces).toBe(
      false,
    )
  })

  test('sans voies chargées, aucun Lot n’est enclavé et l’accès est signalé non vérifié', () => {
    const bien = bienEnBandes([250], ['Paul', 'Marie'])
    const bilan = bilanScenario(bien, null)

    expect(bilan.lots.some((l) => l.sansAcces)).toBe(false)
    expect(bilan.avertissements).toContain('Accès des Lots aux routes et chemins non vérifié : voies non chargées')
  })

  test('les Lots non attribués ne sont jamais déclarés enclavés', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    ajouterLigne(bien, [pt(-50, 250), pt(1050, 250)])

    expect(bilanScenario(bien, []).lots.some((l) => l.sansAcces)).toBe(false)
  })

  test('l’emprise de recherche des voies déborde des Parcelles de 5 m', () => {
    const [lon0, lat0, lon1, lat1] = empriseVoies([rectangle('A', 0, 0, 1000, 500)])!
    const dedans = ([lon, lat]: Position) => lon >= lon0 && lon <= lon1 && lat >= lat0 && lat <= lat1

    expect([pt(-4.9, -4.9), pt(1004.9, -4.9), pt(1004.9, 504.9), pt(-4.9, 504.9)].every(dedans)).toBe(true)
    expect(dedans(pt(500, 520))).toBe(false)
    expect(empriseVoies([])).toBeNull()
  })
})
