import { describe, expect, test } from 'vitest'
import {
  ajouterAcquereur,
  ajouterParcelle,
  creerBien,
  fixerObjectif,
  fixerTolerance,
  supprimerAcquereur,
  verrouiller,
  type Bien,
} from './bien'
import { bilanScenario, lancerDecoupage } from './decoupage'
import { rectangle } from './fixtures'

const HA = 10000

// Deux Tènements séparés : T1 (Parcelle 'A', à l'ouest) et T2 (Parcelle 'B', 40 ha, à l'est)
function deuxTenements(hectaresT1: number): Bien {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 100, hectaresT1 * 100))
  ajouterParcelle(bien, rectangle('B', 1000, 0, 1000, 400))
  return bien
}

function groupe(bien: Bien, objectifs: Record<string, number>): Record<string, string> {
  const ids: Record<string, string> = {}
  for (const [nom, hectares] of Object.entries(objectifs)) {
    ids[nom] = ajouterAcquereur(bien, nom)
    fixerObjectif(bien, ids[nom], { unite: 'ha', valeur: hectares })
  }
  return ids
}

const lotsDe = (bien: Bien, id: string) => bilanScenario(bien).lots.filter((l) => l.acquereur === id)

describe('Bien en plusieurs Tènements', () => {
  test('un Tènement de la taille d’un Objectif est attribué en entier, sans ligne de coupe', () => {
    const bien = deuxTenements(10)
    const ids = groupe(bien, { Marie: 40, Paul: 10 })

    lancerDecoupage(bien)

    expect(bien.scenario.lignes).toEqual([])
    expect(lotsDe(bien, ids.Paul).map((l) => l.tenement)).toEqual(['A'])
    expect(lotsDe(bien, ids.Marie).map((l) => l.tenement)).toEqual(['B'])
  })

  test('un Tènement qui dépasse l’Objectif de moins que la tolérance est attribué en entier', () => {
    const bien = deuxTenements(10.3)
    const ids = groupe(bien, { Marie: 40, Paul: 10 })

    lancerDecoupage(bien)

    expect(lotsDe(bien, ids.Paul).map((l) => l.tenement)).toEqual(['A'])
  })

  test('avec une tolérance plus stricte, le même Tènement est découpé', () => {
    const bien = deuxTenements(10.3)
    const ids = groupe(bien, { Marie: 40, Paul: 10 })
    fixerTolerance(bien, 0.01)

    lancerDecoupage(bien)

    const lotsT1 = bilanScenario(bien).lots.filter((l) => l.tenement === 'A')
    expect(lotsT1.map((l) => l.acquereur).sort()).toEqual([ids.Marie, ids.Paul].sort())
    // Bien de 50,3 ha pour 50 ha d'Objectifs : Paul vise 10 × 50,3 / 50 ha
    const paul = bilanScenario(bien).acquereurs.find((a) => a.id === ids.Paul)!
    expect(paul.surfaceCadastrale).toBeCloseTo(10.06 * HA, -1)
  })

  test('les Tènements qui ne tiennent dans aucun Objectif sont découpés et toute la surface est attribuée', () => {
    const bien = deuxTenements(10)
    const ids = groupe(bien, { Paul: 25, Marie: 25 })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    expect(bilan.lots.every((l) => l.acquereur !== null)).toBe(true)
    expect(bilan.acquereurs.find((a) => a.id === ids.Paul)!.surfaceCadastrale).toBeCloseTo(25 * HA, -1)
    expect(bilan.acquereurs.find((a) => a.id === ids.Marie)!.surfaceCadastrale).toBeCloseTo(25 * HA, -1)
  })
})

describe('Attributions verrouillées', () => {
  test('un Tènement verrouillé va à son Acquéreur, et le reste se répartit autour', () => {
    const bien = deuxTenements(10)
    const ids = groupe(bien, { Paul: 40, Marie: 10 })
    verrouiller(bien, 'A', ids.Paul)

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    expect(bilan.lots.filter((l) => l.tenement === 'A').map((l) => l.acquereur)).toEqual([ids.Paul])
    expect(bilan.acquereurs.find((a) => a.id === ids.Paul)!.surfaceCadastrale).toBeCloseTo(40 * HA, -1)
    expect(bilan.acquereurs.find((a) => a.id === ids.Marie)!.surfaceCadastrale).toBeCloseTo(10 * HA, -1)
  })

  test('le verrouillage survit à une relance du Découpage, et se retire', () => {
    const bien = deuxTenements(10)
    const ids = groupe(bien, { Paul: 40, Marie: 10 })
    verrouiller(bien, 'A', ids.Paul)
    lancerDecoupage(bien)

    lancerDecoupage(bien)
    expect(lotsDe(bien, ids.Paul).some((l) => l.tenement === 'A')).toBe(true)

    verrouiller(bien, 'A', null)
    lancerDecoupage(bien)
    expect(lotsDe(bien, ids.Marie).map((l) => l.tenement)).toEqual(['A'])
  })

  test('supprimer un Acquéreur retire ses verrouillages', () => {
    const bien = deuxTenements(10)
    const ids = groupe(bien, { Paul: 40, Marie: 10 })
    verrouiller(bien, 'A', ids.Paul)

    supprimerAcquereur(bien, ids.Paul)

    expect(bien.scenario.verrouillages).toEqual({})
  })
})
