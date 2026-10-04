import { describe, expect, test } from 'vitest'
import type { Position } from 'geojson'
import { ajouterAcquereur, ajouterParcelle, creerBien, fixerObjectif, scenarioCourant, type Bien, type LigneCoupe } from './bien'
import { ajouterLigne, bilanScenario, lancerDecoupage, modifierLigne, modifierLignes, type ModificationLigne } from './decoupage'
import { enLocal, rectangle } from './fixtures'
import { aire, versL93 } from './geo'

// Point du repère du jeu de test (mètres) en WGS84
const pt = (x: number, y: number) => rectangle('tmp', x, y, 1, 1).geometrie.coordinates[0][0] as Position

// Carré de 50 ha (1000 × 500 m) découpé d'ouest en est (Paul x < 200, Marie au-delà), avec deux zones jointes par
// leur côté x = 600 : la zone 1 sur [400, 600] × [100, 300], la zone 2 sur [600, 800] × [100, 300]
function bienAvecZonesJointes(): Bien {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
  for (const [nom, hectares] of [['Paul', 10], ['Marie', 40]] as const) {
    fixerObjectif(bien, ajouterAcquereur(bien, nom), { unite: 'ha', valeur: hectares })
  }
  lancerDecoupage(bien)
  ajouterLigne(bien, [pt(400, 100), pt(600, 100), pt(600, 300), pt(400, 300)], true)
  ajouterLigne(bien, [pt(600, 100), pt(800, 100), pt(800, 300), pt(600, 300)], true)
  return bien
}

// Points de la ligne d'indice donné, dont le sommet situé en (x, y) est déplacé en (nx, ny)
function deplacer(bien: Bien, index: number, [x, y]: number[], [nx, ny]: number[]): ModificationLigne {
  const points = scenarioCourant(bien).lignes[index].points.map((p) => {
    const [px, py] = enLocal(p)
    return Math.hypot(px - x, py - y) < 0.01 ? pt(nx, ny) : p
  })
  return { index, points }
}

// Surface (m²) entourée par une zone
const aireDeZone = (l: LigneCoupe) => aire(versL93({ type: 'Polygon', coordinates: [[...l.points, l.points[0]]] }))
const acquereursDesLots = (bien: Bien) => bilanScenario(bien).lots.map((l) => [l.signature, l.acquereur])

describe('Modifier ensemble des lignes jointes', () => {
  test('déplacer le sommet commun de deux zones les modifie toutes deux, sans changer les Lots', () => {
    const bien = bienAvecZonesJointes()
    const lots = acquereursDesLots(bien)

    const accepte = modifierLignes(bien, [
      deplacer(bien, 1, [600, 300], [650, 300]),
      deplacer(bien, 2, [600, 300], [650, 300]),
    ])

    expect(accepte).toBe(true)
    // La zone 1 gagne le triangle (600, 100), (650, 300), (600, 300) que perd la zone 2
    expect(aireDeZone(scenarioCourant(bien).lignes[1])).toBeCloseTo(45000, 0)
    expect(aireDeZone(scenarioCourant(bien).lignes[2])).toBeCloseTo(35000, 0)
    expect(acquereursDesLots(bien)).toEqual(lots)
  })

  test('le même sommet déplacé dans une seule des zones est refusé : leur chevauchement ferait un Lot de plus', () => {
    const bien = bienAvecZonesJointes()

    const { points } = deplacer(bien, 1, [600, 300], [650, 300])

    expect(modifierLigne(bien, 1, points)).toBe(false)
  })

  test('refusée pour l’une des lignes, la modification ne change aucune d’elles', () => {
    const bien = bienAvecZonesJointes()
    const lignes = structuredClone(scenarioCourant(bien).lignes)

    // Les zones restent jointes, mais la ligne entre Paul et Marie sort du Tènement
    const accepte = modifierLignes(bien, [
      deplacer(bien, 1, [600, 300], [650, 300]),
      deplacer(bien, 2, [600, 300], [650, 300]),
      { index: 0, points: [pt(-600, -1), pt(-600, 501)] },
    ])

    expect(accepte).toBe(false)
    expect(scenarioCourant(bien).lignes).toEqual(lignes)
  })

  test('une ligne tracée à travers deux Tènements se modifie dans les deux à la fois', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    ajouterParcelle(bien, rectangle('B', 0, 1000, 1000, 500))
    ajouterAcquereur(bien, 'Paul')
    ajouterLigne(bien, [pt(500, -50), pt(500, 1550)])
    const lots = acquereursDesLots(bien)

    const accepte = modifierLignes(bien, [
      { index: 0, points: [pt(600, -50), pt(500, 1550)] },
      { index: 1, points: [pt(600, -50), pt(500, 1550)] },
    ])

    expect(accepte).toBe(true)
    expect(scenarioCourant(bien).lignes.map((l) => l.points)).toEqual([
      [pt(600, -50), pt(500, 1550)],
      [pt(600, -50), pt(500, 1550)],
    ])
    expect(acquereursDesLots(bien)).toEqual(lots)
  })
})
