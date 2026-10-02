// Adaptateur vers les API publiques : communes (geo.api.gouv.fr) et Parcelles (API Carto IGN)
import type { FeatureCollection, MultiPolygon } from 'geojson'
import type { Parcelle } from './moteur/bien'

export interface Commune {
  nom: string
  code: string
  departement: string
  centre: [number, number]
}

export async function rechercherCommunes(nom: string): Promise<Commune[]> {
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(nom)}&fields=nom,code,centre,departement&limit=10`
  const reponse = await fetch(url)
  const communes: { nom: string; code: string; centre: { coordinates: [number, number] }; departement: { code: string } }[] =
    await reponse.json()
  return communes.map((c) => ({ nom: c.nom, code: c.code, departement: c.departement.code, centre: c.centre.coordinates }))
}

// La Parcelle cadastrale qui contient le point (lon, lat), ou null
export async function parcelleEn(lon: number, lat: number): Promise<Parcelle | null> {
  const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] })
  const reponse = await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`)
  const resultat: FeatureCollection<MultiPolygon, { idu: string; contenance: number }> =
    await reponse.json()
  const f = resultat.features[0]
  if (!f) {
    return null
  }

  return { id: f.properties.idu, geometrie: f.geometry, contenance: f.properties.contenance }
}
