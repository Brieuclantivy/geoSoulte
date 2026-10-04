import { describe, expect, test } from 'vitest'
import type { Position } from 'geojson'
import { ajouterAcquereur, ajouterParcelle, creerBien, fixerObjectif, fixerOrientation, fixerPrix, renommerScenario, type Bien } from './bien'
import { ajouterLigne, bilanScenario, lancerDecoupage } from './decoupage'
import { lotsEnGeoJSON, lotsEnKML, nomFichierLots } from './export-lots'
import { rectangle } from './fixtures'

const pt = (x: number, y: number) => rectangle('tmp', x, y, 1, 1).geometrie.coordinates[0][0] as Position

// Tènement de 50 ha fait de deux Parcelles A (ouest) et B (est), découpé d'ouest en est : Paul 10 ha, Marie 40 ha
function bienDecoupe(): Bien {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 500, 500))
  ajouterParcelle(bien, rectangle('B', 500, 0, 500, 500))
  fixerObjectif(bien, ajouterAcquereur(bien, 'Paul'), { unite: 'ha', valeur: 10 })
  fixerObjectif(bien, ajouterAcquereur(bien, 'Marie & fils'), { unite: 'ha', valeur: 40 })
  fixerOrientation(bien, 0)
  lancerDecoupage(bien)
  return bien
}

describe('Export des Lots en GeoJSON', () => {
  test('un objet par Lot, avec géométrie et propriétés cohérentes avec le bilan', () => {
    const bien = bienDecoupe()
    fixerPrix(bien, { total: 500000, parHectareDefaut: null, parHectare: {} })
    const lots = bilanScenario(bien).lots

    const geojson = lotsEnGeoJSON(bien)

    expect(geojson.type).toBe('FeatureCollection')
    expect(geojson.features).toHaveLength(lots.length)
    const paul = geojson.features.find((f) => f.properties.acquereur === 'Paul')!
    const lotPaul = lots.find((l) => l.acquereur === bien.acquereurs[0].id)!
    expect(paul.geometry).toEqual(lotPaul.geometrie)
    expect(paul.properties).toEqual({
      acquereur: 'Paul',
      couleur: bien.acquereurs[0].couleur,
      surface_mesuree_m2: Math.round(lotPaul.surfaceMesuree),
      surface_cadastrale_m2: Math.round(lotPaul.surfaceCadastrale),
      cout_eur: Math.round(lotPaul.cout!),
      tenement: 'A',
      scenario: 'Scénario 1',
      parcelles: ['A'],
    })
    expect(paul.properties.surface_cadastrale_m2).toBeCloseTo(100000, -2)
    expect(paul.properties.cout_eur).toBeCloseTo(100000, -2)
    const marie = geojson.features.find((f) => f.properties.acquereur === 'Marie & fils')!
    expect(marie.properties.parcelles.sort()).toEqual(['A', 'B'])
  })

  test('sans prix, le Coût est absent ; un Lot non attribué a un Acquéreur null', () => {
    const bien = creerBien()
    ajouterParcelle(bien, rectangle('A', 0, 0, 1000, 500))
    ajouterLigne(bien, [pt(200, -50), pt(200, 550)])

    const { features } = lotsEnGeoJSON(bien)

    expect(features).toHaveLength(2)
    for (const { properties } of features) {
      expect(properties).not.toHaveProperty('cout_eur')
      expect(properties.acquereur).toBeNull()
      expect(properties.couleur).toBeNull()
    }
  })

  test('la collection porte la mention de simulation indicative et le nom du Scénario', () => {
    const geojson = lotsEnGeoJSON(bienDecoupe())

    expect(geojson.name).toBe('geoSoulte — Scénario 1')
    expect(geojson.description).toBe('Simulation indicative geoSoulte, pas un plan de géomètre')
  })

  test('les anneaux extérieurs suivent la règle de la main droite (sens trigonométrique, RFC 7946)', () => {
    const aireSignee = (anneau: Position[]) =>
      anneau.slice(0, -1).reduce((t, p, i) => t + p[0] * anneau[i + 1][1] - anneau[i + 1][0] * p[1], 0)

    for (const { geometry } of lotsEnGeoJSON(bienDecoupe()).features) {
      for (const [exterieur, ...trous] of geometry.coordinates) {
        expect(aireSignee(exterieur)).toBeGreaterThan(0)
        trous.forEach((t) => expect(aireSignee(t)).toBeLessThan(0))
      }
    }
  })
})

describe('Export des Lots en KML', () => {
  test('un dossier par Acquéreur, un Placemark par Lot, aux couleurs des Acquéreurs au format aabbggrr', () => {
    const bien = bienDecoupe()
    // Une coupe est-ouest donne deux Lots à chacun
    ajouterLigne(bien, [pt(-50, 250), pt(1050, 250)])

    const kml = lotsEnKML(bien)

    expect(kml.match(/<Folder>/g)).toHaveLength(2)
    expect(kml.match(/<Placemark>/g)).toHaveLength(4)
    expect(kml).toContain('<Folder><name>Marie &amp; fils</name>')
    // Paul : #e6194b
    expect(kml).toContain('<color>ff4b19e6</color>')
    expect(kml).toContain('<color>994b19e6</color>')
    expect(kml).toContain('<description>Simulation indicative geoSoulte, pas un plan de géomètre</description>')
    expect(kml).toContain('Surface cadastrale : 5,00 ha')
  })
})

describe('Nom du fichier exporté', () => {
  test('dérivé du Scénario courant, sans accents ni caractères spéciaux', () => {
    const bien = creerBien()
    expect(nomFichierLots(bien, 'geojson')).toBe('geosoulte-scenario-1.geojson')

    renommerScenario(bien, 's1', ' Été / Hiver ! ')
    expect(nomFichierLots(bien, 'kml')).toBe('geosoulte-ete-hiver.kml')

    renommerScenario(bien, 's1', '???')
    expect(nomFichierLots(bien, 'kml')).toBe('geosoulte-scenario.kml')
  })
})
