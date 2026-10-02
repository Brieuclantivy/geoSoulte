import { describe, expect, test } from 'vitest'
import { ajouterParcelle, bilanBien, creerBien, retirerParcelle } from './bien'
import { rectangle } from './fixtures'

describe('Constituer le Bien', () => {
  test('une Parcelle ajoutée apparaît dans le bilan avec sa Contenance et sa Surface mesurée', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100, 10150))

    const bilan = bilanBien(bien)

    expect(bilan.parcelles).toHaveLength(1)
    expect(bilan.parcelles[0].id).toBe('A')
    expect(bilan.parcelles[0].contenance).toBe(10150)
    expect(bilan.parcelles[0].surfaceMesuree).toBeCloseTo(10000, 0)
  })

  test('le bilan totalise la Contenance et la Surface mesurée du Bien et leur écart', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100, 10150))
    ajouterParcelle(bien, rectangle('B', 100, 0, 100, 50, 4900))

    const bilan = bilanBien(bien)

    expect(bilan.contenance).toBe(15050)
    expect(bilan.surfaceMesuree).toBeCloseTo(15000, 0)
    expect(bilan.ecart).toBeCloseTo(50, 0)
  })

  test('une Parcelle retirée disparaît du Bien', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100))
    ajouterParcelle(bien, rectangle('B', 100, 0, 100, 50))

    retirerParcelle(bien, 'A')

    expect(bilanBien(bien).parcelles.map((p) => p.id)).toEqual(['B'])
  })

  test('ajouter deux fois la même Parcelle ne la compte qu’une fois', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100))
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100))

    expect(bilanBien(bien).parcelles).toHaveLength(1)
  })
})

describe('Tènements', () => {
  const idsParTenement = (bien: ReturnType<typeof creerBien>) =>
    bilanBien(bien).tenements.map((t) => [...t.parcelles].sort())

  test('des Parcelles qui se touchent forment un seul Tènement', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100))
    ajouterParcelle(bien, rectangle('B', 100, 0, 100, 100))
    ajouterParcelle(bien, rectangle('C', 100, 100, 50, 50))

    expect(idsParTenement(bien)).toEqual([['A', 'B', 'C']])
  })

  test('des Parcelles séparées forment des Tènements distincts', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100))
    ajouterParcelle(bien, rectangle('B', 120, 0, 100, 100))

    expect(idsParTenement(bien)).toEqual([['A'], ['B']])
  })

  test('un interstice de quelques centimètres dû au cadastre ne sépare pas deux Parcelles', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100))
    ajouterParcelle(bien, rectangle('B', 100.3, 0, 100, 100))

    expect(idsParTenement(bien)).toEqual([['A', 'B']])
  })

  test('une Parcelle qui relie deux Tènements les fusionne, et son retrait les sépare', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100))
    ajouterParcelle(bien, rectangle('C', 200, 0, 100, 100))
    ajouterParcelle(bien, rectangle('B', 100, 0, 100, 100))

    expect(idsParTenement(bien)).toEqual([['A', 'B', 'C']])

    retirerParcelle(bien, 'B')

    expect(idsParTenement(bien)).toEqual([['A'], ['C']])
  })

  test('chaque Tènement totalise la Contenance de ses Parcelles et chaque Parcelle connaît son Tènement', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100, 10100))
    ajouterParcelle(bien, rectangle('B', 100, 0, 100, 100, 9900))
    ajouterParcelle(bien, rectangle('C', 500, 0, 50, 50, 2600))

    const bilan = bilanBien(bien)

    expect(bilan.tenements.map((t) => t.contenance)).toEqual([20000, 2600])
    const tenementDe = (id: string) => bilan.parcelles.find((p) => p.id === id)!.tenement
    expect(tenementDe('A')).toBe(tenementDe('B'))
    expect(tenementDe('C')).not.toBe(tenementDe('A'))
  })
})
