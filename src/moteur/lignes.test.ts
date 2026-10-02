import { describe, expect, test } from 'vitest'
import type { Position } from 'geojson'
import { ajouterAcquereur, ajouterParcelle, creerBien, fixerObjectif, type Bien, scenarioCourant } from './bien'
import { ajouterLigne, bilanScenario, lancerDecoupage, modifierLigne, reattribuer, supprimerLigne } from './decoupage'
import { rectangle } from './fixtures'

const HA = 10000

// Point du repère du jeu de test (mètres) en WGS84
const pt = (x: number, y: number) => rectangle('tmp', x, y, 1, 1).geometrie.coordinates[0][0] as Position

// Carré de 50 ha (1000 × 500 m) découpé d'ouest en est : Paul 10 ha (x < 200), Marie 40 ha
function bienDecoupe(): { bien: Bien; ids: Record<string, string> } {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
  const ids: Record<string, string> = {}
  for (const [nom, hectares] of [['Paul', 10], ['Marie', 40]] as const) {
    ids[nom] = ajouterAcquereur(bien, nom)
    fixerObjectif(bien, ids[nom], { unite: 'ha', valeur: hectares })
  }
  lancerDecoupage(bien)
  return { bien, ids }
}

const bilanDe = (bien: Bien, id: string) => bilanScenario(bien).acquereurs.find((a) => a.id === id)!
const toutAttribue = (bien: Bien) => bilanScenario(bien).lots.every((l) => l.acquereur !== null)

describe('Ajouter une ligne de coupe', () => {
  test('une nouvelle ligne crée un Lot qui garde l’Acquéreur du Lot d’origine', () => {
    const { bien, ids } = bienDecoupe()

    // Coupe est-ouest de part en part, à y = 250
    const accepte = ajouterLigne(bien, [pt(-50, 250), pt(1050, 250)])

    expect(accepte).toBe(true)
    const lots = bilanScenario(bien).lots
    expect(lots.filter((l) => l.acquereur === ids.Marie)).toHaveLength(2)
    expect(bilanDe(bien, ids.Marie).surfaceCadastrale).toBeCloseTo(40 * HA, -1)
    expect(toutAttribue(bien)).toBe(true)
  })

  test('une ligne ne coupe que les Tènements qu’elle touche, pas ceux situés dans son prolongement', () => {
    const { bien } = bienDecoupe()
    // Second Tènement à l'est, dans l'alignement d'une coupe est-ouest tracée dans le premier
    ajouterParcelle(bien, rectangle('B', 2000, 0, 500, 500))
    lancerDecoupage(bien)
    const lotsB = bilanScenario(bien).lots.filter((l) => l.tenement === 'B').length

    ajouterLigne(bien, [pt(-50, 250), pt(1050, 250)])

    expect(bilanScenario(bien).lots.filter((l) => l.tenement === 'B')).toHaveLength(lotsB)
  })

  test('une ligne qui ne traverse pas le Bien est refusée', () => {
    const { bien } = bienDecoupe()
    const lignes = structuredClone(scenarioCourant(bien).lignes)

    expect(ajouterLigne(bien, [pt(2000, -100), pt(2000, 600)])).toBe(false)
    expect(scenarioCourant(bien).lignes).toEqual(lignes)
  })
})

describe('Ligne de coupe en U', () => {
  test('une ligne en U dont les extrémités sont hors du Tènement découpe exactement le U', () => {
    const { bien, ids } = bienDecoupe()

    // U de 400 m × 300 m entré par le nord dans le Lot de Marie
    const accepte = ajouterLigne(bien, [pt(300, 600), pt(300, 200), pt(700, 200), pt(700, 600)])

    expect(accepte).toBe(true)
    const surfaces = bilanScenario(bien)
      .lots.filter((l) => l.acquereur === ids.Marie)
      .map((l) => l.surfaceMesuree)
      .sort((a, b) => a - b)
    expect(surfaces).toHaveLength(2)
    expect(surfaces[0]).toBeCloseTo(12 * HA, -1)
    expect(bilanDe(bien, ids.Marie).surfaceCadastrale).toBeCloseTo(40 * HA, -1)
    expect(toutAttribue(bien)).toBe(true)
  })
})

describe('Réattribuer un Lot', () => {
  test('un Lot réattribué change d’Acquéreur, et un Acquéreur peut cumuler plusieurs Lots', () => {
    const { bien, ids } = bienDecoupe()
    ajouterLigne(bien, [pt(800, -10), pt(800, 510)])
    const lotEst = bilanScenario(bien).lots.find((l) => l.acquereur === ids.Marie && l.surfaceMesuree < 11 * HA)!

    reattribuer(bien, lotEst.tenement, lotEst.signature, ids.Paul)

    expect(bilanScenario(bien).lots.filter((l) => l.acquereur === ids.Paul)).toHaveLength(2)
    expect(bilanDe(bien, ids.Paul).surfaceCadastrale).toBeCloseTo(20 * HA, -1)
    expect(bilanDe(bien, ids.Marie).surfaceCadastrale).toBeCloseTo(30 * HA, -1)
  })
})

describe('Supprimer une ligne de coupe', () => {
  test('supprimer une ligne fusionne ses deux Lots, attribués à l’Acquéreur du plus grand', () => {
    const { bien, ids } = bienDecoupe()

    supprimerLigne(bien, 0)

    const lots = bilanScenario(bien).lots
    expect(lots).toHaveLength(1)
    expect(lots[0].acquereur).toBe(ids.Marie)
    expect(bilanDe(bien, ids.Marie).surfaceCadastrale).toBeCloseTo(50 * HA, -1)
  })

  test('supprimer une ligne ajoutée redonne les Lots d’avant', () => {
    const { bien, ids } = bienDecoupe()
    ajouterLigne(bien, [pt(-50, 250), pt(1050, 250)])

    supprimerLigne(bien, 1)

    expect(bilanScenario(bien).lots.map((l) => l.acquereur)).toEqual([ids.Paul, ids.Marie])
    expect(toutAttribue(bien)).toBe(true)
  })
})

describe('Ajustements manuels', () => {
  test('le Scénario sait s’il a été ajusté à la main depuis le dernier Découpage automatique', () => {
    const { bien, ids } = bienDecoupe()
    expect(scenarioCourant(bien).ajuste).toBe(false)

    modifierLigne(bien, 0, [pt(250, -1), pt(250, 501)])
    expect(scenarioCourant(bien).ajuste).toBe(true)

    lancerDecoupage(bien)
    expect(scenarioCourant(bien).ajuste).toBe(false)

    const lot = bilanScenario(bien).lots[0]
    reattribuer(bien, lot.tenement, lot.signature, ids.Marie)
    expect(scenarioCourant(bien).ajuste).toBe(true)
  })
})
