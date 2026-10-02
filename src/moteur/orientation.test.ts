import { describe, expect, test } from 'vitest'
import type { MultiPolygon } from 'geojson'
import { ajouterAcquereur, ajouterParcelle, creerBien, fixerObjectif, fixerOrdre, fixerOrientation, type Bien } from './bien'
import { bilanScenario, lancerDecoupage } from './decoupage'
import { enLocal, rectangle } from './fixtures'

const HA = 10000

function groupe(bien: Bien, objectifs: Record<string, number>): Record<string, string> {
  const ids: Record<string, string> = {}
  for (const [nom, hectares] of Object.entries(objectifs)) {
    ids[nom] = ajouterAcquereur(bien, nom)
    fixerObjectif(bien, ids[nom], { unite: 'ha', valeur: hectares })
  }
  return ids
}

// Étendue (en mètres, repère du jeu de test) des Lots d'un Acquéreur
function etendue(bien: Bien, id: string) {
  const points = bilanScenario(bien)
    .lots.filter((l) => l.acquereur === id)
    .flatMap((l) => (l.geometrie as MultiPolygon).coordinates.flat(2).map(enLocal))
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return { ouest: Math.min(...xs), est: Math.max(...xs), sud: Math.min(...ys), nord: Math.max(...ys) }
}

describe('Orientation des bandes', () => {
  test('par défaut, les bandes avancent le long du côté le plus long du Tènement', () => {
    const bien = creerBien()
    // Rectangle allongé nord-sud : 200 m × 2 500 m
    ajouterParcelle(bien, rectangle('A', 0, 0, 200, 2500))
    const ids = groupe(bien, { Paul: 10, Marie: 40 })

    lancerDecoupage(bien)

    const paul = etendue(bien, ids.Paul)
    const marie = etendue(bien, ids.Marie)
    // Bandes empilées du sud au nord, coupes parallèles au petit côté (des tranches, pas des lanières) :
    // celle de Paul est entièrement au sud de celle de Marie
    expect(paul.nord).toBeLessThanOrEqual(marie.sud + 0.01)
    expect(bilanScenario(bien).acquereurs.find((a) => a.id === ids.Paul)!.surfaceCadastrale).toBeCloseTo(10 * HA, -1)
  })

  test('une orientation choisie fait avancer les bandes dans cette direction', () => {
    const bien = creerBien()
    // Rectangle allongé est-ouest, mais bandes imposées du sud vers le nord (90°)
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    const ids = groupe(bien, { Paul: 10, Marie: 40 })
    fixerOrientation(bien, 90)

    lancerDecoupage(bien)

    expect(etendue(bien, ids.Paul).nord).toBeLessThanOrEqual(etendue(bien, ids.Marie).sud + 0.01)
    expect(bilanScenario(bien).acquereurs.find((a) => a.id === ids.Marie)!.surfaceCadastrale).toBeCloseTo(40 * HA, -1)
  })

  test('une orientation oblique respecte les Objectifs', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    const ids = groupe(bien, { Paul: 10, Marie: 15, Jean: 25 })
    fixerOrientation(bien, 30)

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    for (const [nom, hectares] of [['Paul', 10], ['Marie', 15], ['Jean', 25]] as const) {
      expect(bilan.acquereurs.find((a) => a.id === ids[nom])!.surfaceCadastrale).toBeCloseTo(hectares * HA, -1)
    }
  })
})

describe('Ordre des Acquéreurs', () => {
  test('le premier Acquéreur de l’ordre reçoit la première bande', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    const ids = groupe(bien, { Paul: 10, Marie: 40 })
    fixerOrdre(bien, [ids.Marie, ids.Paul])

    lancerDecoupage(bien)

    // Bandes d'ouest en est : Marie à l'ouest
    expect(etendue(bien, ids.Marie).est).toBeLessThanOrEqual(etendue(bien, ids.Paul).ouest + 0.01)
    expect(bilanScenario(bien).acquereurs.find((a) => a.id === ids.Paul)!.surfaceCadastrale).toBeCloseTo(10 * HA, -1)
  })

  test('un Acquéreur absent de l’ordre choisi passe en dernier', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    const ids = groupe(bien, { Paul: 10, Marie: 20 })
    fixerOrdre(bien, [ids.Marie, ids.Paul])
    const jean = ajouterAcquereur(bien, 'Jean')
    fixerObjectif(bien, jean, { unite: 'ha', valeur: 20 })

    lancerDecoupage(bien)

    expect(etendue(bien, ids.Paul).est).toBeLessThanOrEqual(etendue(bien, jean).ouest + 0.01)
  })
})
