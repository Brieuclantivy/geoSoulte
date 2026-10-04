import { describe, expect, test } from 'vitest'
import { horsCouvertureDvf, statistiquesDvf, type LigneDvf } from './dvf'

// Ligne au format de l'API de l'app DVF d'Etalab ('None' pour une valeur absente)
function ligne(
  id_mutation: string,
  valeur_fonciere: string,
  surface_terrain: string,
  nature_culture: string,
  autres: Partial<LigneDvf> = {},
): LigneDvf {
  return {
    id_mutation,
    date_mutation: '2024-03-01',
    nature_mutation: 'Vente',
    valeur_fonciere,
    type_local: 'None',
    nature_culture,
    surface_terrain,
    ...autres,
  }
}

// Extrait de ventes réelles à Montbard (21425), complété de cas à écarter
const LIGNES: LigneDvf[] = [
  ligne('2022-1', '700.0', '2246.0', 'terres', { date_mutation: '2022-05-12' }),
  // Une mutation sur deux lignes : la valeur, répétée, n'est comptée qu'une fois
  ligne('2024-2', '6266.0', '20138.0', 'terres'),
  ligne('2024-2', '6266.0', '4050.0', 'terres'),
  ligne('2025-3', '10000.0', '20000.0', 'terres', { date_mutation: '2025-01-20' }),
  ligne('2024-4', '20000.0', '3176.0', 'prés'),
  // Natures mêlées
  ligne('2024-5', '9000.0', '10000.0', 'terres'),
  ligne('2024-5', '9000.0', '5000.0', 'prés'),
  // À écarter : bâti, emprise de construction, adjudication, vente symbolique, surface nulle
  ligne('2024-6', '150000.0', '1000.0', 'terres', { type_local: 'Maison' }),
  ligne('2024-6', '150000.0', '9000.0', 'terres'),
  ligne('2024-7', '9692000.0', '5104.0', 'Terrain à bâtir'),
  ligne('2024-7', '9692000.0', '1069.0', 'sols'),
  ligne('2021-8', '5000.0', '10000.0', 'terres', { nature_mutation: 'Adjudication', date_mutation: '2021-01-01' }),
  ligne('2021-9', '1.0', '10000.0', 'terres', { date_mutation: '2021-01-01' }),
  ligne('2021-10', '5000.0', '0.0', 'terres', { date_mutation: '2021-01-01' }),
]

describe('Prix de référence DVF', () => {
  const stats = statistiquesDvf(LIGNES)
  const culture = (nom: string) => stats.cultures.find((c) => c.culture === nom)

  test('le €/ha d’une mutation est sa valeur, comptée une fois, sur la somme de ses surfaces', () => {
    // 3 ventes de terres : 700 € / 0,2246 ha, 6 266 € / 2,4188 ha, 10 000 € / 2 ha
    const terres = culture('terres')!
    expect(terres.ventes).toBe(3)
    expect(terres.prix!.mediane).toBeCloseTo(700 / 0.2246, 2)
    expect(terres.prix!.q1).toBeCloseTo((6266 / 2.4188 + 700 / 0.2246) / 2, 2)
    expect(terres.prix!.q3).toBeCloseTo((700 / 0.2246 + 5000) / 2, 2)
  })

  test('les ventes bâties, symboliques, sans surface ou hors vente sont écartées', () => {
    expect(stats.cultures.map((c) => c.culture).sort()).toEqual(['mixte', 'prés', 'terres'])
    expect(stats.cultures.reduce((t, c) => t + c.ventes, 0)).toBe(5)
    expect(stats.annees).toEqual([2022, 2025])
  })

  test('une vente qui mêle plusieurs natures de culture va dans « mixte »', () => {
    expect(culture('mixte')!.ventes).toBe(1)
  })

  test('moins de 3 ventes : données insuffisantes, sans médiane', () => {
    expect(culture('prés')).toEqual({ culture: 'prés', ventes: 1, prix: null })
  })

  test('aucune vente retenue', () => {
    expect(statistiquesDvf([])).toEqual({ annees: null, cultures: [] })
  })

  test('Alsace-Moselle et Mayotte sont hors couverture DVF', () => {
    expect(['57463', '67482', '68224', '97611'].every(horsCouvertureDvf)).toBe(true)
    expect(horsCouvertureDvf('21425')).toBe(false)
  })
})
