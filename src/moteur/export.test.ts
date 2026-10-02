import { describe, expect, test } from 'vitest'
import type { Position } from 'geojson'
import {
  ajouterAcquereur,
  ajouterParcelle,
  bilanBien,
  choisirScenario,
  creerBien,
  dupliquerScenario,
  fixerObjectif,
  fixerOrdre,
  fixerOrientation,
  fixerPrix,
  fixerTolerance,
  scenarioCourant,
  verrouiller,
} from './bien'
import { bilanScenario, lancerDecoupage, modifierLigne } from './decoupage'
import { exporter, importer } from './export'
import { enLocal, rectangle } from './fixtures'

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

  test('tout l’état survit à l’export/import : prix, Objectifs, réglages, verrouillages, lignes ajustées, Scénarios', () => {
    const bien = creerBien()
    // Tènement découpé (Parcelles A et B) et Tènement isolé (C), verrouillé
    ajouterParcelle(bien, rectangle('A', 0, 0, 300, 500, 150500))
    ajouterParcelle(bien, rectangle('B', 300, 0, 300, 500, 149000))
    ajouterParcelle(bien, rectangle('C', 1000, 0, 200, 500))
    fixerPrix(bien, { total: 600000, parHectareDefaut: 9000, parHectare: { B: 12000 } })
    const paul = ajouterAcquereur(bien, 'Paul')
    const marie = ajouterAcquereur(bien, 'Marie')
    const jean = ajouterAcquereur(bien, 'Jean')
    fixerObjectif(bien, paul, { unite: 'ha', valeur: 15 })
    fixerObjectif(bien, marie, { unite: 'eur', valeur: 200000 })
    fixerObjectif(bien, jean, { unite: 'ha', valeur: 10 })
    fixerTolerance(bien, 0.02)
    verrouiller(bien, 'C', jean)
    fixerOrientation(bien, 30)
    fixerOrdre(bien, [marie, paul, jean])
    lancerDecoupage(bien)
    // Premier sommet de la première ligne poussé de 20 m vers l'est
    const [debut, ...suite] = scenarioCourant(bien).lignes[0].points
    const [x, y] = enLocal(debut)
    const pousse = rectangle('tmp', x + 20, y, 1, 1).geometrie.coordinates[0][0] as Position
    expect(modifierLigne(bien, 0, [pousse, ...suite])).toBe(true)
    // Second Scénario, avec d'autres réglages
    choisirScenario(bien, dupliquerScenario(bien))
    fixerObjectif(bien, paul, { unite: 'ha', valeur: 20 })
    fixerOrientation(bien, null)
    verrouiller(bien, 'C', null)
    lancerDecoupage(bien)

    const reimporte = importer(exporter(bien))

    expect(reimporte).toEqual(bien)
    expect(bilanBien(reimporte)).toEqual(bilanBien(bien))
    for (const { id } of bien.scenarios) {
      choisirScenario(bien, id)
      choisirScenario(reimporte, id)
      expect(bilanScenario(reimporte)).toEqual(bilanScenario(bien))
    }
    expect(reimporte.scenarios[0].ajuste).toBe(true)
    expect(bilanScenario(reimporte).ecartAvantRecalage).not.toBeNull()
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
