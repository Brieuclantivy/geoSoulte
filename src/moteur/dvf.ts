// Prix de référence : statistiques des ventes de terres non bâties d'après les Demandes de valeurs foncières (DVF)

// Une ligne DVF (une parcelle d'une mutation), champs utiles au format de l'API de l'app DVF d'Etalab :
// tout est en texte, 'None' ou vide quand la valeur manque
export interface LigneDvf {
  id_mutation: string
  date_mutation: string
  nature_mutation: string
  // Total de la mutation, répété sur chacune de ses lignes
  valeur_fonciere: string
  type_local: string
  nature_culture: string
  // m²
  surface_terrain: string
}

export interface StatistiquesCulture {
  // Nature de culture, ou 'mixte' pour une vente qui en mêle plusieurs
  culture: string
  ventes: number
  // €/ha ; null s'il y a moins de VENTES_MINIMUM ventes
  prix: { q1: number; mediane: number; q3: number } | null
}

export interface StatistiquesDvf {
  // Années de la première et de la dernière vente retenue ; null si aucune
  annees: [number, number] | null
  cultures: StatistiquesCulture[]
}

const VENTES_MINIMUM = 3
// En deçà, la vente est symbolique (vente à 1 €…)
const VALEUR_MINIMUM = 100
// 'sols' : emprise d'une construction, la mutation porte donc sur du bâti
const CULTURES_BATIES = ['sols']

// Départements dont les ventes ne sont pas publiées dans DVF (régime du Livre foncier, et Mayotte)
const HORS_DVF = ['57', '67', '68', '976']

export function horsCouvertureDvf(insee: string): boolean {
  return HORS_DVF.some((d) => insee.startsWith(d))
}

function texte(v: string): string | null {
  return v === '' || v === 'None' ? null : v
}

function nombre(v: string): number | null {
  const t = texte(v)
  return t === null ? null : Number(t)
}

// Quantile p (0..1) d'une liste triée, par interpolation linéaire
function quantile(tries: number[], p: number): number {
  const position = (tries.length - 1) * p
  const bas = Math.floor(position)
  const haut = Math.ceil(position)
  return tries[bas] + (tries[haut] - tries[bas]) * (position - bas)
}

export function statistiquesDvf(lignes: LigneDvf[]): StatistiquesDvf {
  const mutations = new Map<string, LigneDvf[]>()
  for (const l of lignes) {
    mutations.set(l.id_mutation, [...(mutations.get(l.id_mutation) ?? []), l])
  }

  const prixParCulture = new Map<string, number[]>()
  const annees: number[] = []
  for (const m of mutations.values()) {
    const valeur = nombre(m[0].valeur_fonciere)
    const cultures = new Set(m.map((l) => texte(l.nature_culture)))
    const surface = m.reduce((t, l) => t + (nombre(l.surface_terrain) ?? 0), 0)
    if (
      m[0].nature_mutation !== 'Vente' ||
      m.some((l) => texte(l.type_local) !== null) ||
      cultures.has(null) ||
      CULTURES_BATIES.some((c) => cultures.has(c)) ||
      valeur === null ||
      valeur < VALEUR_MINIMUM ||
      surface <= 0
    ) {
      continue
    }

    const culture = cultures.size === 1 ? [...cultures][0]! : 'mixte'
    prixParCulture.set(culture, [...(prixParCulture.get(culture) ?? []), valeur / (surface / 10000)])
    annees.push(Number(m[0].date_mutation.slice(0, 4)))
  }

  const cultures = [...prixParCulture.entries()].map(([culture, prix]): StatistiquesCulture => {
    const tries = [...prix].sort((a, b) => a - b)
    return {
      culture,
      ventes: tries.length,
      prix:
        tries.length < VENTES_MINIMUM
          ? null
          : { q1: quantile(tries, 0.25), mediane: quantile(tries, 0.5), q3: quantile(tries, 0.75) },
    }
  })
  cultures.sort((a, b) => b.ventes - a.ventes)
  return { annees: annees.length ? [Math.min(...annees), Math.max(...annees)] : null, cultures }
}
