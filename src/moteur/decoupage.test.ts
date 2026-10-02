import { describe, expect, test } from 'vitest'
import { ajouterAcquereur, ajouterParcelle, creerBien, fixerObjectif, renommerAcquereur, supprimerAcquereur, type Bien } from './bien'
import { bilanScenario, lancerDecoupage } from './decoupage'
import { rectangle } from './fixtures'

const HA = 10000

function groupe(bien: Bien, objectifs: Record<string, number>): Record<string, string> {
  const ids: Record<string, string> = {}
  for (const [nom, hectares] of Object.entries(objectifs)) {
    ids[nom] = ajouterAcquereur(bien, nom)
    fixerObjectif(bien, ids[nom], { unite: 'ha', valeur: hectares })
  }
  return ids
}

describe('Découpage automatique', () => {
  test('un carré de 50 ha partagé 10/35/5 ha donne à chacun sa Surface cadastrale', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    const ids = groupe(bien, { Paul: 10, Marie: 35, Jean: 5 })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    const surface = (id: string) => bilan.acquereurs.find((a) => a.id === id)!.surfaceCadastrale
    expect(surface(ids.Paul)).toBeCloseTo(10 * HA, -1)
    expect(surface(ids.Marie)).toBeCloseTo(35 * HA, -1)
    expect(surface(ids.Jean)).toBeCloseTo(5 * HA, -1)
    expect(bilan.lots).toHaveLength(3)
  })

  test('la Surface cadastrale est proratisée Parcelle par Parcelle quand la Contenance diffère de la Surface mesurée', () => {
    const bien = creerBien()
    // Deux Parcelles de 25 ha mesurés, l'une de 26 ha de Contenance à l'ouest, l'autre de 24 ha à l'est
    ajouterParcelle(bien, rectangle('A', 0, 0, 500, 500, 26 * HA))
    ajouterParcelle(bien, rectangle('B', 500, 0, 500, 500, 24 * HA))
    const ids = groupe(bien, { Paul: 25, Marie: 25 })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    const paul = bilan.acquereurs.find((a) => a.id === ids.Paul)!
    expect(paul.surfaceCadastrale).toBeCloseTo(25 * HA, -1)
    // 25 ha de Contenance pris dans A (26 ha pour 25 ha mesurés) : 25 × 25/26 ha mesurés
    expect(paul.surfaceMesuree).toBeCloseTo((25 * 25 * HA) / 26, -1)
  })

  test('les Lots couvrent tout le Bien', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 600, 400, 25 * HA))
    ajouterParcelle(bien, rectangle('B', 600, 0, 300, 200, 6 * HA))
    groupe(bien, { Paul: 10, Marie: 15, Jean: 6 })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    expect(bilan.lots.every((l) => l.acquereur !== null)).toBe(true)
    expect(bilan.lots.reduce((t, l) => t + l.surfaceCadastrale, 0)).toBeCloseTo(31 * HA, -1)
    expect(bilan.lots.reduce((t, l) => t + l.surfaceMesuree, 0)).toBeCloseTo(600 * 400 + 300 * 200, -1)
  })

  test('quand la somme des Objectifs ne correspond pas au Bien, chacun reçoit une part au prorata de son Objectif', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    const ids = groupe(bien, { Paul: 10, Marie: 30 })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    const paul = bilan.acquereurs.find((a) => a.id === ids.Paul)!
    expect(paul.surfaceCadastrale).toBeCloseTo(12.5 * HA, -1)
    expect(paul.ecart).toBeCloseTo(2.5 * HA, -1)
  })

  test('avant tout Découpage, le Bien forme un seul Lot non attribué', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    groupe(bien, { Paul: 10, Marie: 40 })

    const bilan = bilanScenario(bien)

    expect(bilan.lots).toHaveLength(1)
    expect(bilan.lots[0].acquereur).toBeNull()
  })
})

describe('Acquéreurs', () => {
  test('ajouter des Acquéreurs leur donne des couleurs distinctes, et on peut les renommer', () => {
    const bien = creerBien()
    const paul = ajouterAcquereur(bien, 'Paul')
    const marie = ajouterAcquereur(bien, 'Marie')

    renommerAcquereur(bien, paul, 'Paulo')

    expect(bien.acquereurs.map((a) => a.nom)).toEqual(['Paulo', 'Marie'])
    expect(bien.acquereurs.find((a) => a.id === paul)!.couleur).not.toBe(bien.acquereurs.find((a) => a.id === marie)!.couleur)
  })

  test('supprimer un Acquéreur efface le Découpage, qui doit être relancé', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    const ids = groupe(bien, { Paul: 10, Marie: 40 })
    lancerDecoupage(bien)

    supprimerAcquereur(bien, ids.Paul)
    const bilan = bilanScenario(bien)

    expect(bilan.acquereurs.map((a) => a.id)).toEqual([ids.Marie])
    expect(bilan.lots).toHaveLength(1)
    expect(bilan.lots[0].acquereur).toBeNull()
  })
})
