import { describe, expect, test } from 'vitest'
import type { Position } from 'geojson'
import { ajouterAcquereur, ajouterParcelle, creerBien, fixerObjectif, type Bien, scenarioCourant } from './bien'
import { bilanScenario, lancerDecoupage, modifierLigne } from './decoupage'
import { enLocal, rectangle } from './fixtures'
import { exporter, importer } from './export'

const HA = 10000

// Carré de 50 ha (1000 × 500 m) découpé d'ouest en est : Paul 10 ha, Marie 15 ha, Jean 25 ha
function bienDecoupe(): { bien: Bien; ids: Record<string, string> } {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
  const ids: Record<string, string> = {}
  for (const [nom, hectares] of [['Paul', 10], ['Marie', 15], ['Jean', 25]] as const) {
    ids[nom] = ajouterAcquereur(bien, nom)
    fixerObjectif(bien, ids[nom], { unite: 'ha', valeur: hectares })
  }
  lancerDecoupage(bien)
  return { bien, ids }
}

// Déplace de dx mètres vers l'est (repère du jeu de test) les points d'une ligne
function decaler(points: Position[], dx: number, indices = points.map((_, i) => i)): Position[] {
  return points.map((p, i) => {
    if (!indices.includes(i)) {
      return p
    }

    const [x, y] = enLocal(p)
    return rectangle('tmp', x + dx, y, 1, 1).geometrie.coordinates[0][0] as Position
  })
}

const surface = (bien: Bien, id: string) => bilanScenario(bien).acquereurs.find((a) => a.id === id)!.surfaceCadastrale

describe('Ajuster une ligne de coupe', () => {
  test('déplacer une ligne change les surfaces sans changer l’Acquéreur des Lots', () => {
    const { bien, ids } = bienDecoupe()
    const avant = bilanScenario(bien).lots.map((l) => [l.signature, l.acquereur])

    // La première ligne (entre Paul et Marie, à x = 200 m) passe à x = 250 m
    const accepte = modifierLigne(bien, 0, decaler(scenarioCourant(bien).lignes[0].points, 50))

    expect(accepte).toBe(true)
    expect(surface(bien, ids.Paul)).toBeCloseTo(12.5 * HA, -1)
    expect(surface(bien, ids.Marie)).toBeCloseTo(12.5 * HA, -1)
    expect(bilanScenario(bien).lots.map((l) => [l.signature, l.acquereur])).toEqual(avant)
  })

  test('déplacer un seul sommet incline la ligne', () => {
    const { bien, ids } = bienDecoupe()

    // Sommet nord de la première ligne poussé de 100 m vers l'est : Paul gagne un triangle de 100 × 500 / 2 m²
    modifierLigne(bien, 0, decaler(scenarioCourant(bien).lignes[0].points, 100, [1]))

    expect(surface(bien, ids.Paul)).toBeCloseTo(10 * HA + 25000, -1)
  })

  test('ajouter un sommet au milieu de la ligne permet de la plier', () => {
    const { bien, ids } = bienDecoupe()
    const [debut, fin] = scenarioCourant(bien).lignes[0].points
    const [, yDebut] = enLocal(debut)
    const [, yFin] = enLocal(fin)
    const milieu = rectangle('tmp', 300, (yDebut + yFin) / 2, 1, 1).geometrie.coordinates[0][0] as Position

    const accepte = modifierLigne(bien, 0, [debut, milieu, fin])

    expect(accepte).toBe(true)
    // Triangle ajouté à Paul : base 501 m (ligne prolongée d'1 m de chaque côté, coupée au bord), hauteur 100 m
    expect(surface(bien, ids.Paul)).toBeGreaterThan(10 * HA + 20000)
    expect(bilanScenario(bien).lots.every((l) => l.acquereur !== null)).toBe(true)
  })

  test('une ligne sortie du Tènement est refusée et rien ne change', () => {
    const { bien, ids } = bienDecoupe()
    const lignes = structuredClone(scenarioCourant(bien).lignes)

    const accepte = modifierLigne(bien, 0, decaler(scenarioCourant(bien).lignes[0].points, -500))

    expect(accepte).toBe(false)
    expect(scenarioCourant(bien).lignes).toEqual(lignes)
    expect(surface(bien, ids.Paul)).toBeCloseTo(10 * HA, -1)
  })

  test('une ligne qui en croise une autre est refusée', () => {
    const { bien } = bienDecoupe()

    // La première ligne (x = 200) inclinée jusqu'au-delà de la seconde (x = 500) côté nord
    const accepte = modifierLigne(bien, 0, decaler(scenarioCourant(bien).lignes[0].points, 400, [1]))

    expect(accepte).toBe(false)
  })

  test('les lignes modifiées survivent à l’export/import', () => {
    const { bien } = bienDecoupe()
    modifierLigne(bien, 0, decaler(scenarioCourant(bien).lignes[0].points, 50))

    expect(bilanScenario(importer(exporter(bien)))).toEqual(bilanScenario(bien))
  })
})
