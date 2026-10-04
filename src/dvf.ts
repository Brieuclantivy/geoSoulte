// Adaptateur vers les ventes DVF d'une commune : sections cadastrales (cadastre.data.gouv.fr), puis ventes de
// chaque section (API de l'app DVF d'Etalab, la seule source DVF qui accepte les requêtes d'un autre site)
import type { LigneDvf } from './moteur/dvf'

async function json<T>(url: string): Promise<T> {
  const reponse = await fetch(url)
  if (!reponse.ok) {
    throw new Error(`${url} : ${reponse.status}`)
  }

  return reponse.json()
}

// Ventes DVF (2021 à aujourd'hui) de la commune au code INSEE donné, toutes sections confondues, et nom de la
// commune s'il y a des ventes
export async function ventesDvf(insee: string): Promise<{ nom: string | null; lignes: LigneDvf[] }> {
  const sections = await json<{ features: { id: string }[] }>(
    `https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/${insee}/geojson/sections`,
  )
  // Identifiant de section : INSEE (5) + préfixe (3) + section (2)
  const ventes = await Promise.all(
    sections.features.map((s) =>
      json<{ mutations: (LigneDvf & { nom_commune: string })[] }>(
        `https://app.dvf.etalab.gouv.fr/api/mutations3/${insee}/${s.id.slice(5)}`,
      ),
    ),
  )
  const lignes = ventes.flatMap((v) => v.mutations)
  return { nom: lignes[0]?.nom_commune ?? null, lignes }
}
