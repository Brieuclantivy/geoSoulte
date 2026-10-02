import { describe, expect, test } from 'vitest'
import {
  ajouterAcquereur,
  ajouterParcelle,
  choisirScenario,
  creerBien,
  dupliquerScenario,
  fixerObjectif,
  fixerOrdre,
  fixerTolerance,
  scenariosAvecLots,
  supprimerAcquereur,
  verrouiller,
  type Bien,
  scenarioCourant,
} from './bien'
import { bilanScenario, lancerDecoupage, reattribuer } from './decoupage'
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

    expect(scenarioCourant(bien).lignes).toEqual([])
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

  test('un Tènement entier va à l’Acquéreur le plus loin de son Objectif en proportion, pas en valeur absolue', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 300, 1000))
    ajouterParcelle(bien, rectangle('B', 1000, 0, 100, 200))
    ajouterParcelle(bien, rectangle('C', 2000, 0, 100, 600))
    ajouterParcelle(bien, rectangle('D', 3000, 0, 100, 500))
    ajouterParcelle(bien, rectangle('E', 4000, 0, 100, 500))
    const ids = groupe(bien, { Paul: 40, Marie: 8 })
    // Paul reçoit A (30 ha), Marie B (2 ha) : il reste 10 ha sur 40 à Paul (25 %), 6 ha sur 8 à Marie (75 %)
    verrouiller(bien, 'A', ids.Paul)
    verrouiller(bien, 'B', ids.Marie)

    lancerDecoupage(bien)

    // C (6 ha), le plus grand Tènement libre, va à Marie, bien que Paul ait plus d'hectares à recevoir
    expect(lotsDe(bien, ids.Marie).map((l) => l.tenement).sort()).toEqual(['B', 'C'])
    expect(scenarioCourant(bien).lignes).toEqual([])
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

    expect(scenarioCourant(bien).verrouillages).toEqual({})
  })
})

describe('Supprimer un Acquéreur', () => {
  // Scénario 1 : Paul a des Lots. Scénario 2 : Paul n'en a pas, mais il est dans l'ordre et a un verrouillage
  // posé après le Découpage, ajusté à la main
  function deuxScenarios(): { bien: Bien; ids: Record<string, string>; s1: string; s2: string } {
    const bien = deuxTenements(10)
    const ids = groupe(bien, { Paul: 10, Marie: 20, Jean: 20 })
    lancerDecoupage(bien)
    const s1 = bien.courant
    const s2 = dupliquerScenario(bien)
    choisirScenario(bien, s2)
    fixerObjectif(bien, ids.Paul, { unite: 'ha', valeur: 0 })
    fixerObjectif(bien, ids.Marie, { unite: 'ha', valeur: 25 })
    fixerObjectif(bien, ids.Jean, { unite: 'ha', valeur: 25 })
    fixerOrdre(bien, [ids.Jean, ids.Paul, ids.Marie])
    lancerDecoupage(bien)
    verrouiller(bien, 'A', ids.Paul)
    reattribuer(bien, 'A', '', ids.Jean)
    return { bien, ids, s1, s2 }
  }

  test('seuls les Scénarios où il a des Lots perdent leur Découpage', () => {
    const { bien, ids, s1, s2 } = deuxScenarios()
    const scenario = (id: string) => bien.scenarios.find((s) => s.id === id)!
    expect(scenario(s1).attributions.some((a) => a.acquereur === ids.Paul)).toBe(true)
    const { lignes, attributions, ajuste } = structuredClone(scenario(s2))
    expect(lignes.length).toBeGreaterThan(0)
    expect(ajuste).toBe(true)

    expect(scenariosAvecLots(bien, ids.Paul).map((s) => s.id)).toEqual([s1])
    supprimerAcquereur(bien, ids.Paul)

    expect(scenario(s1).lignes).toEqual([])
    expect(scenario(s1).attributions).toEqual([])
    expect(scenario(s2).lignes).toEqual(lignes)
    expect(scenario(s2).attributions).toEqual(attributions)
    expect(scenario(s2).ajuste).toBe(true)
  })

  test('son Objectif, son rang dans l’ordre et ses verrouillages disparaissent de tous les Scénarios', () => {
    const { bien, ids } = deuxScenarios()
    verrouiller(bien, 'B', ids.Paul)
    choisirScenario(bien, bien.scenarios[0].id)
    fixerOrdre(bien, [ids.Paul, ids.Marie])
    verrouiller(bien, 'B', ids.Paul)

    supprimerAcquereur(bien, ids.Paul)

    for (const scenario of bien.scenarios) {
      expect(scenario.objectifs[ids.Paul]).toBeUndefined()
      expect(scenario.ordre).not.toContain(ids.Paul)
      expect(Object.values(scenario.verrouillages)).not.toContain(ids.Paul)
    }
  })
})
