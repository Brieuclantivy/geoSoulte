import { describe, expect, test } from 'vitest'
import { ajouterParcelle, bilanBien, creerBien } from './bien'
import { exporter, importer } from './export'
import { rectangle } from './fixtures'

describe('Export et import JSON', () => {
  test('exporter puis importer redonne le même Bien et le même bilan', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100, 10150))
    ajouterParcelle(bien, rectangle('B', 300, 0, 100, 50, 4900))

    const reimporte = importer(exporter(bien))

    expect(reimporte).toEqual(bien)
    expect(bilanBien(reimporte)).toEqual(bilanBien(bien))
  })

  test('l’export porte un numéro de version de format', () => {
    expect(JSON.parse(exporter(creerBien())).version).toBe(1)
  })

  test('importer un fichier qui n’est pas un export geoSoulte échoue', () => {
    expect(() => importer('{"foo": 1}')).toThrow()
    expect(() => importer('pas du json')).toThrow()
  })
})
