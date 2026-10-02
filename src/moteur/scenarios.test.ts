import { describe, expect, test } from 'vitest'
import {
  ajouterAcquereur,
  ajouterParcelle,
  choisirScenario,
  creerBien,
  creerScenario,
  dupliquerScenario,
  fixerObjectif,
  fixerPrix,
  renommerScenario,
  scenarioCourant,
  supprimerScenario,
  type Bien,
} from './bien'
import { bilanScenario, lancerDecoupage } from './decoupage'
import { exporter, importer } from './export'
import { rectangle } from './fixtures'

const HA = 10000

function bienDecoupe(): { bien: Bien; paul: string; marie: string } {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
  const paul = ajouterAcquereur(bien, 'Paul')
  const marie = ajouterAcquereur(bien, 'Marie')
  fixerObjectif(bien, paul, { unite: 'ha', valeur: 35 })
  fixerObjectif(bien, marie, { unite: 'ha', valeur: 15 })
  lancerDecoupage(bien)
  return { bien, paul, marie }
}

const surface = (bien: Bien, id: string) => bilanScenario(bien).acquereurs.find((a) => a.id === id)!.surfaceCadastrale

describe('Scénarios', () => {
  test('un nouveau Bien a un premier Scénario, courant', () => {
    const bien = creerBien()

    expect(bien.scenarios.map((s) => s.nom)).toEqual(['Scénario 1'])
    expect(scenarioCourant(bien).nom).toBe('Scénario 1')
  })

  test('un Scénario dupliqué se modifie sans toucher à l’original', () => {
    const { bien, paul, marie } = bienDecoupe()
    const original = bien.courant

    const copie = dupliquerScenario(bien)
    choisirScenario(bien, copie)
    fixerObjectif(bien, paul, { unite: 'ha', valeur: 30 })
    fixerObjectif(bien, marie, { unite: 'ha', valeur: 20 })
    lancerDecoupage(bien)

    expect(surface(bien, paul)).toBeCloseTo(30 * HA, -1)
    choisirScenario(bien, original)
    expect(surface(bien, paul)).toBeCloseTo(35 * HA, -1)
    expect(bien.scenarios.find((s) => s.id === copie)!.nom).toBe('Scénario 1 (copie)')
  })

  test('les Parcelles, les prix et les Acquéreurs sont communs à tous les Scénarios', () => {
    const { bien } = bienDecoupe()
    const autre = creerScenario(bien, 'Variante')

    choisirScenario(bien, autre)
    const jean = ajouterAcquereur(bien, 'Jean')
    fixerPrix(bien, { total: 500000, parHectareDefaut: null, parHectare: {} })

    choisirScenario(bien, bien.scenarios[0].id)
    expect(bien.acquereurs.map((a) => a.id)).toContain(jean)
    expect(bilanScenario(bien).acquereurs.find((a) => a.id === jean)).toBeDefined()
    expect(bilanScenario(bien).acquereurs.reduce((t, a) => t + (a.cout ?? 0), 0)).toBeCloseTo(500000, 0)
  })

  test('un nouveau Scénario part de zéro', () => {
    const { bien, paul } = bienDecoupe()

    choisirScenario(bien, creerScenario(bien, 'Variante'))

    expect(scenarioCourant(bien).objectifs).toEqual({})
    expect(surface(bien, paul)).toBe(0)
  })

  test('renommer et supprimer un Scénario ; le dernier ne peut pas être supprimé', () => {
    const bien = creerBien()
    const variante = creerScenario(bien, 'Variante')
    choisirScenario(bien, variante)

    renommerScenario(bien, variante, 'Nord-sud')
    expect(scenarioCourant(bien).nom).toBe('Nord-sud')

    supprimerScenario(bien, variante)
    expect(bien.scenarios.map((s) => s.nom)).toEqual(['Scénario 1'])
    expect(scenarioCourant(bien).nom).toBe('Scénario 1')

    supprimerScenario(bien, bien.courant)
    expect(bien.scenarios).toHaveLength(1)
  })
})

describe('Export des Scénarios', () => {
  test('tous les Scénarios survivent à l’export/import', () => {
    const { bien, paul } = bienDecoupe()
    choisirScenario(bien, dupliquerScenario(bien))
    fixerObjectif(bien, paul, { unite: 'ha', valeur: 20 })
    lancerDecoupage(bien)

    const reimporte = importer(exporter(bien))

    expect(reimporte).toEqual(bien)
    expect(bilanScenario(reimporte)).toEqual(bilanScenario(bien))
  })

  test('un export à Scénario unique (version 1) s’importe comme premier Scénario', () => {
    const { bien, paul } = bienDecoupe()
    const { scenarios, courant, ...reste } = bien
    void courant
    const { id, nom, ...scenario } = scenarios[0]
    void id
    void nom
    const ancien = JSON.stringify({ version: 1, bien: { ...reste, scenario } })

    const reimporte = importer(ancien)

    expect(reimporte.scenarios).toHaveLength(1)
    expect(scenarioCourant(reimporte).nom).toBe('Scénario 1')
    expect(surface(reimporte, paul)).toBeCloseTo(35 * HA, -1)
  })
})
