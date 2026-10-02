import { describe, expect, test } from 'vitest'
import {
  ajouterAcquereur,
  ajouterParcelle,
  choisirScenario,
  creerBien,
  dupliquerScenario,
  fixerObjectif,
  retirerParcelle,
  scenarioCourant,
  verrouiller,
  type Bien,
} from './bien'
import { bilanScenario, lancerDecoupage } from './decoupage'
import { rectangle } from './fixtures'

const NON_ATTRIBUE = 'Surface non attribuée : relancez le Découpage'

// Deux Tènements de 20 ha : T1 (Parcelles 'A' et 'B', à l'ouest), découpé entre Paul et Marie,
// et T2 (Parcelle 'C', à l'est), verrouillé sur Jean
function bienDecoupe(): { bien: Bien; ids: Record<string, string> } {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 200, 500))
  ajouterParcelle(bien, rectangle('B', 200, 0, 200, 500))
  ajouterParcelle(bien, rectangle('C', 1000, 0, 400, 500))
  const ids: Record<string, string> = {}
  for (const [nom, hectares] of [['Paul', 10], ['Marie', 10], ['Jean', 20]] as const) {
    ids[nom] = ajouterAcquereur(bien, nom)
    fixerObjectif(bien, ids[nom], { unite: 'ha', valeur: hectares })
  }
  verrouiller(bien, 'C', ids.Jean)
  lancerDecoupage(bien)
  return { bien, ids }
}

// Lignes, attributions et verrouillages du Tènement de clé donnée, dans un Scénario
function decoupageDe(bien: Bien, tenement: string, scenario = scenarioCourant(bien)) {
  return {
    lignes: scenario.lignes.filter((l) => l.tenement === tenement),
    attributions: scenario.attributions.filter((a) => a.tenement === tenement),
    verrouillage: scenario.verrouillages[tenement],
  }
}

describe('Parcelles modifiées après un Découpage', () => {
  test('ajouter une Parcelle contiguë efface le Découpage de ce seul Tènement', () => {
    const { bien, ids } = bienDecoupe()
    const t2 = decoupageDe(bien, 'C')
    expect(decoupageDe(bien, 'A').lignes).toHaveLength(1)

    ajouterParcelle(bien, rectangle('D', 0, 500, 400, 100))

    expect(decoupageDe(bien, 'A')).toEqual({ lignes: [], attributions: [], verrouillage: undefined })
    expect(decoupageDe(bien, 'C')).toEqual(t2)
    expect(t2.verrouillage).toBe(ids.Jean)
  })

  test('retirer une Parcelle efface le Découpage de ce seul Tènement', () => {
    const { bien } = bienDecoupe()
    const t2 = decoupageDe(bien, 'C')

    retirerParcelle(bien, 'A')

    expect(scenarioCourant(bien).lignes.filter((l) => l.tenement !== 'C')).toEqual([])
    expect(scenarioCourant(bien).attributions.filter((a) => a.tenement !== 'C')).toEqual([])
    expect(decoupageDe(bien, 'C')).toEqual(t2)
  })

  test('un Tènement verrouillé dont la composition change perd son verrouillage', () => {
    const { bien } = bienDecoupe()

    ajouterParcelle(bien, rectangle('D', 1000, 500, 400, 100))

    expect(scenarioCourant(bien).verrouillages).toEqual({})
    expect(decoupageDe(bien, 'A').lignes).toHaveLength(1)
  })

  test('ajouter une Parcelle isolée ne touche à aucun Découpage', () => {
    const { bien } = bienDecoupe()
    const avant = structuredClone(scenarioCourant(bien))

    ajouterParcelle(bien, rectangle('E', 3000, 0, 100, 100))

    expect(scenarioCourant(bien)).toEqual(avant)
  })

  test('le même effacement s’applique à tous les Scénarios', () => {
    const { bien } = bienDecoupe()
    choisirScenario(bien, dupliquerScenario(bien))

    retirerParcelle(bien, 'B')

    for (const scenario of bien.scenarios) {
      expect(decoupageDe(bien, 'A', scenario).lignes).toEqual([])
      expect(decoupageDe(bien, 'A', scenario).attributions).toEqual([])
      expect(decoupageDe(bien, 'C', scenario).attributions).toHaveLength(1)
    }
  })

  test('un avertissement signale la surface non attribuée jusqu’à la relance du Découpage', () => {
    const { bien } = bienDecoupe()
    expect(bilanScenario(bien).avertissements).not.toContain(NON_ATTRIBUE)

    ajouterParcelle(bien, rectangle('D', 0, 500, 400, 100))
    expect(bilanScenario(bien).lots.some((l) => l.acquereur === null)).toBe(true)
    expect(bilanScenario(bien).avertissements).toContain(NON_ATTRIBUE)

    lancerDecoupage(bien)
    expect(bilanScenario(bien).lots.every((l) => l.acquereur !== null)).toBe(true)
    expect(bilanScenario(bien).avertissements).not.toContain(NON_ATTRIBUE)
  })

  test('avant tout Découpage, aucun avertissement de surface non attribuée', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 200, 500))
    ajouterAcquereur(bien, 'Paul')

    expect(bilanScenario(bien).avertissements).not.toContain(NON_ATTRIBUE)
  })
})
