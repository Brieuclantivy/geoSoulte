// Adaptateur vers les tronçons de route de la BD TOPO (WFS de la Géoplateforme IGN)
import type { FeatureCollection, LineString, MultiLineString } from 'geojson'
import type { Troncon } from './moteur/acces'

const PAGE = 1000

// Tronçons de route de l'emprise [lon min, lat min, lon max, lat max], page par page
export async function tronconsDans([lonMin, latMin, lonMax, latMax]: [number, number, number, number]): Promise<Troncon[]> {
  const troncons: Troncon[] = []
  for (let debut = 0; ; debut += PAGE) {
    const url =
      'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
      '&TYPENAMES=BDTOPO_V3:troncon_de_route&OUTPUTFORMAT=application/json' +
      '&PROPERTYNAME=nature,etat_de_l_objet,acces_vehicule_leger,geometrie' +
      `&BBOX=${latMin},${lonMin},${latMax},${lonMax},urn:ogc:def:crs:EPSG::4326` +
      // Un tri stable est nécessaire pour paginer
      `&SORTBY=cleabs&COUNT=${PAGE}&STARTINDEX=${debut}`
    const reponse = await fetch(url)
    if (!reponse.ok) {
      throw new Error(`Voies BD TOPO : ${reponse.status}`)
    }

    const page: FeatureCollection<
      LineString | MultiLineString,
      { nature: string; etat_de_l_objet: string; acces_vehicule_leger: string | null }
    > = await reponse.json()
    for (const { geometry, properties } of page.features) {
      const lignes = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
      for (const ligne of lignes) {
        troncons.push({
          nature: properties.nature,
          etat: properties.etat_de_l_objet,
          accesVehiculeLeger: properties.acces_vehicule_leger,
          // Sans l'altitude
          points: ligne.map(([lon, lat]) => [lon, lat]),
        })
      }
    }

    if (page.features.length < PAGE) {
      return troncons
    }
  }
}
