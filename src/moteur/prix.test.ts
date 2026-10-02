import { describe, expect, test } from 'vitest'
import { ajouterAcquereur, ajouterParcelle, creerBien, fixerObjectif, fixerPrix, type Bien, type Objectif } from './bien'
import { bilanScenario, lancerDecoupage } from './decoupage'
import { rectangle } from './fixtures'

const HA = 10000

// Deux Parcelles de 10 ha : A à l'ouest, B à l'est (le Découpage avance d'ouest en est)
function bienAB(): Bien {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 500, 200))
  ajouterParcelle(bien, rectangle('B', 500, 0, 500, 200))
  return bien
}

function groupe(bien: Bien, objectifs: Record<string, Objectif>): Record<string, string> {
  const ids: Record<string, string> = {}
  for (const [nom, objectif] of Object.entries(objectifs)) {
    ids[nom] = ajouterAcquereur(bien, nom)
    fixerObjectif(bien, ids[nom], objectif)
  }
  return ids
}

const ha = (valeur: number): Objectif => ({ unite: 'ha', valeur })
const eur = (valeur: number): Objectif => ({ unite: 'eur', valeur })

describe('Prix et Coûts', () => {
  test('avec des prix à l’hectare seuls, le Coût d’un Lot est sa Surface cadastrale × le prix de ses Parcelles', () => {
    const bien = bienAB()
    fixerPrix(bien, { total: null, parHectareDefaut: 5000, parHectare: { A: 10000 } })
    const ids = groupe(bien, { Paul: ha(10), Marie: ha(10) })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    const cout = (id: string) => bilan.acquereurs.find((a) => a.id === id)!.cout
    expect(cout(ids.Paul)).toBeCloseTo(100000, 0)
    expect(cout(ids.Marie)).toBeCloseTo(50000, 0)
  })

  test('avec un prix total seul, le prix à l’hectare est uniforme', () => {
    const bien = bienAB()
    fixerPrix(bien, { total: 200000, parHectareDefaut: null, parHectare: {} })
    const ids = groupe(bien, { Paul: ha(5), Marie: ha(15) })

    lancerDecoupage(bien)

    expect(bilanScenario(bien).acquereurs.find((a) => a.id === ids.Paul)!.cout).toBeCloseTo(50000, 0)
  })

  test('avec un prix total et des prix à l’hectare, les prix à l’hectare sont recalés sur le prix total', () => {
    const bien = bienAB()
    // 10 ha × 12 000 + 10 ha × 6 000 = 180 000 €, pour un prix total de 200 000 €
    fixerPrix(bien, { total: 200000, parHectareDefaut: 6000, parHectare: { A: 12000 } })
    const ids = groupe(bien, { Paul: ha(10), Marie: ha(10) })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    expect(bilan.ecartAvantRecalage).toBeCloseTo(20000, 0)
    const cout = (id: string) => bilan.acquereurs.find((a) => a.id === id)!.cout!
    expect(cout(ids.Paul)).toBeCloseTo((120000 * 200000) / 180000, 0)
    expect(cout(ids.Paul) + cout(ids.Marie)).toBeCloseTo(200000, 0)
  })

  test('une Parcelle sans prix à l’hectare est signalée', () => {
    const bien = bienAB()
    fixerPrix(bien, { total: null, parHectareDefaut: null, parHectare: { A: 10000 } })

    expect(bilanScenario(bien).avertissements).toContainEqual(expect.stringContaining('B'))
  })
})

describe('Objectifs en euros', () => {
  test('le Découpage vise le Coût pour un Objectif en euros', () => {
    const bien = bienAB()
    fixerPrix(bien, { total: null, parHectareDefaut: 5000, parHectare: { A: 10000 } })
    const ids = groupe(bien, { Paul: eur(100000), Marie: eur(50000) })

    lancerDecoupage(bien)
    const paul = bilanScenario(bien).acquereurs.find((a) => a.id === ids.Paul)!

    // 100 000 € correspondent exactement à la Parcelle A
    expect(paul.cout).toBeCloseTo(100000, 0)
    expect(paul.surfaceCadastrale).toBeCloseTo(10 * HA, -1)
    expect(paul.ecart).toBeCloseTo(0, 0)
  })

  test('des Objectifs mixtes ha / € qui ne couvrent pas le Bien sont ramenés au prorata, avec un avertissement', () => {
    const bien = bienAB()
    fixerPrix(bien, { total: 200000, parHectareDefaut: null, parHectare: {} })
    // Paul : 5 ha = 25 % du Bien ; Marie : 100 000 € = 50 % ; total 75 %
    const ids = groupe(bien, { Paul: ha(5), Marie: eur(100000) })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    expect(bilan.acquereurs.find((a) => a.id === ids.Paul)!.surfaceCadastrale).toBeCloseTo((20 * HA) / 3, -1)
    expect(bilan.avertissements).toContainEqual(expect.stringContaining('prorata'))
  })

  test('un Objectif en euros sans aucun prix saisi est signalé et ignoré par le Découpage', () => {
    const bien = bienAB()
    const ids = groupe(bien, { Paul: ha(10), Marie: eur(50000) })

    lancerDecoupage(bien)
    const bilan = bilanScenario(bien)

    expect(bilan.avertissements).toContainEqual(expect.stringContaining('Marie'))
    expect(bilan.acquereurs.find((a) => a.id === ids.Marie)!.surfaceCadastrale).toBe(0)
    expect(bilan.acquereurs.find((a) => a.id === ids.Paul)!.surfaceCadastrale).toBeCloseTo(20 * HA, -1)
  })
})
