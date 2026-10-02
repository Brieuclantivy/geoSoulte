import { describe, expect, test } from 'vitest'
import { ajouterAcquereur, ajouterParcelle, bilanBien, creerBien, fixerObjectif } from './bien'
import { bilanScenario, lancerDecoupage } from './decoupage'
import { exporter, importer } from './export'
import { rectangle } from './fixtures'

describe('Export et import JSON', () => {
  test('exporter puis importer redonne le même Bien et le même bilan', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100, 10150))
    ajouterParcelle(bien, rectangle('B', 300, 0, 100, 50, 4900))
    const paul = ajouterAcquereur(bien, 'Paul')
    fixerObjectif(bien, paul, { unite: 'ha', valeur: 1 })
    fixerObjectif(bien, ajouterAcquereur(bien, 'Marie'), { unite: 'ha', valeur: 0.5 })
    lancerDecoupage(bien)

    const reimporte = importer(exporter(bien))

    expect(reimporte).toEqual(bien)
    expect(bilanBien(reimporte)).toEqual(bilanBien(bien))
    expect(bilanScenario(reimporte)).toEqual(bilanScenario(bien))
  })

  test('l’export porte un numéro de version de format', () => {
    expect(JSON.parse(exporter(creerBien())).version).toBe(2)
  })

  test('un export sans Acquéreurs ni Scénario (format initial) s’importe avec des valeurs par défaut', () => {
    const bien = importer(JSON.stringify({ version: 1, bien: { parcelles: [rectangle('A', 0, 0, 100, 100)] } }))

    expect(bien.acquereurs).toEqual([])
    expect(bilanScenario(bien).lots).toHaveLength(1)
  })

  test('importer un fichier qui n’est pas un export geoSoulte échoue', () => {
    expect(() => importer('{"foo": 1}')).toThrow()
    expect(() => importer('pas du json')).toThrow()
  })
})
