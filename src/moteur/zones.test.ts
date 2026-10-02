import { describe, expect, test } from 'vitest'
import type { Position } from 'geojson'
import { ajouterAcquereur, ajouterParcelle, creerBien, fixerObjectif, scenarioCourant, type Bien } from './bien'
import {
  ajouterLigne,
  bilanScenario,
  fermerLigne,
  lancerDecoupage,
  modifierLigne,
  reattribuer,
  supprimerLigne,
} from './decoupage'
import { exporter, importer } from './export'
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

// Surfaces mesurées des Lots d'un Acquéreur, de la plus petite à la plus grande
const surfacesDe = (bien: Bien, id: string) =>
  bilanScenario(bien)
    .lots.filter((l) => l.acquereur === id)
    .map((l) => l.surfaceMesuree)
    .sort((a, b) => a - b)
const toutAttribue = (bien: Bien) => bilanScenario(bien).lots.every((l) => l.acquereur !== null)
const lotsSansGeometrie = (bien: Bien) => bilanScenario(bien).lots.map(({ geometrie, ...l }) => (void geometrie, l))

describe('Lignes de coupe en brouillon', () => {
  test('une ligne dont une extrémité est dans le Tènement est acceptée en brouillon, sans rien couper', () => {
    const { bien } = bienDecoupe()
    const lots = lotsSansGeometrie(bien)

    expect(ajouterLigne(bien, [pt(500, 600), pt(500, 250)])).toBe(true)

    expect(scenarioCourant(bien).lignes).toHaveLength(2)
    expect(bilanScenario(bien).brouillons).toEqual([1])
    expect(lotsSansGeometrie(bien).map((l) => [l.acquereur, l.surfaceMesuree])).toEqual(
      lots.map((l) => [l.acquereur, l.surfaceMesuree]),
    )
  })

  test('une ligne dont les deux extrémités sont dans le Tènement est aussi un brouillon', () => {
    const { bien } = bienDecoupe()

    expect(ajouterLigne(bien, [pt(300, 400), pt(300, 200), pt(700, 200), pt(700, 400)])).toBe(true)
    expect(bilanScenario(bien).brouillons).toEqual([1])
    expect(bilanScenario(bien).lots).toHaveLength(2)
  })

  test('amener l’extrémité d’un brouillon hors du Tènement le fait couper ; le nouveau Lot hérite de l’Acquéreur', () => {
    const { bien, ids } = bienDecoupe()
    ajouterLigne(bien, [pt(500, 600), pt(500, 250)])

    expect(modifierLigne(bien, 1, [pt(500, 600), pt(500, -100)])).toBe(true)

    expect(bilanScenario(bien).brouillons).toEqual([])
    const surfaces = surfacesDe(bien, ids.Marie)
    expect(surfaces).toHaveLength(2)
    expect(surfaces[0]).toBeCloseTo(15 * HA, -1)
    expect(toutAttribue(bien)).toBe(true)
  })

  test('déplacer un sommet d’un brouillon qui reste brouillon est accepté', () => {
    const { bien } = bienDecoupe()
    ajouterLigne(bien, [pt(500, 600), pt(500, 250)])

    expect(modifierLigne(bien, 1, [pt(500, 600), pt(600, 300)])).toBe(true)
    expect(bilanScenario(bien).brouillons).toEqual([1])
  })

  test('une ligne qui coupe ne redevient pas un brouillon', () => {
    const { bien, ids } = bienDecoupe()

    expect(modifierLigne(bien, 0, [pt(200, -1), pt(200, 400)])).toBe(false)
    expect(bilanScenario(bien).acquereurs.find((a) => a.id === ids.Paul)!.surfaceCadastrale).toBeCloseTo(10 * HA, -1)
  })

  test('supprimer un brouillon ne change pas les Lots', () => {
    const { bien } = bienDecoupe()
    const lots = lotsSansGeometrie(bien)
    ajouterLigne(bien, [pt(500, 600), pt(500, 250)])

    supprimerLigne(bien, 1)

    expect(scenarioCourant(bien).lignes).toHaveLength(1)
    expect(lotsSansGeometrie(bien)).toEqual(lots)
  })
})

describe('Zones fermées', () => {
  test('relier les extrémités d’un brouillon découpe la zone entourée, avec l’Acquéreur du Lot d’origine', () => {
    const { bien, ids } = bienDecoupe()
    // Rectangle de 400 m × 200 m dans le Lot de Marie, dont il manque le côté nord
    ajouterLigne(bien, [pt(300, 400), pt(300, 200), pt(700, 200), pt(700, 400)])

    expect(fermerLigne(bien, 1)).toBe(true)

    expect(bilanScenario(bien).brouillons).toEqual([])
    const surfaces = surfacesDe(bien, ids.Marie)
    expect(surfaces).toHaveLength(2)
    expect(surfaces[0]).toBeCloseTo(8 * HA, -1)
    expect(toutAttribue(bien)).toBe(true)

    const zone = bilanScenario(bien).lots.find((l) => Math.abs(l.surfaceMesuree - 8 * HA) < 10)!
    reattribuer(bien, zone.tenement, zone.signature, ids.Paul)
    expect(surfacesDe(bien, ids.Paul).reduce((t, s) => t + s, 0)).toBeCloseTo(18 * HA, -1)
  })

  test('une zone tracée directement dans une Parcelle crée un Lot de sa surface', () => {
    const { bien, ids } = bienDecoupe()

    expect(ajouterLigne(bien, [pt(400, 100), pt(600, 100), pt(600, 300), pt(400, 300)], true)).toBe(true)

    expect(surfacesDe(bien, ids.Marie)[0]).toBeCloseTo(4 * HA, -1)
    expect(bilanScenario(bien).acquereurs.find((a) => a.id === ids.Marie)!.surfaceCadastrale).toBeCloseTo(40 * HA, -1)
  })

  test('une zone à cheval sur la limite entre deux Lots les découpe tous les deux', () => {
    const { bien, ids } = bienDecoupe()

    ajouterLigne(bien, [pt(100, 100), pt(300, 100), pt(300, 300), pt(100, 300)], true)

    expect(surfacesDe(bien, ids.Paul)).toHaveLength(2)
    expect(surfacesDe(bien, ids.Marie)).toHaveLength(2)
    expect(toutAttribue(bien)).toBe(true)
  })

  test('une zone hors du Bien est refusée', () => {
    const { bien } = bienDecoupe()

    expect(ajouterLigne(bien, [pt(2000, 100), pt(2200, 100), pt(2200, 300)], true)).toBe(false)
    expect(scenarioCourant(bien).lignes).toHaveLength(1)
  })

  test('relier les extrémités d’une ligne qui coupe déjà est refusé', () => {
    const { bien } = bienDecoupe()

    expect(fermerLigne(bien, 0)).toBe(false)
  })

  test('un sommet de zone déplacé change sa surface sans changer les Acquéreurs', () => {
    const { bien, ids } = bienDecoupe()
    ajouterLigne(bien, [pt(400, 100), pt(600, 100), pt(600, 300), pt(400, 300)], true)

    expect(modifierLigne(bien, 1, [pt(400, 100), pt(700, 100), pt(700, 300), pt(400, 300)])).toBe(true)

    expect(surfacesDe(bien, ids.Marie)[0]).toBeCloseTo(6 * HA, -1)
  })

  test('zones fermées et brouillons survivent à l’export/import', () => {
    const { bien } = bienDecoupe()
    ajouterLigne(bien, [pt(400, 100), pt(600, 100), pt(600, 300), pt(400, 300)], true)
    ajouterLigne(bien, [pt(800, 600), pt(800, 250)])

    const reimporte = importer(exporter(bien))

    expect(reimporte).toEqual(bien)
    expect(bilanScenario(reimporte)).toEqual(bilanScenario(bien))
  })
})
