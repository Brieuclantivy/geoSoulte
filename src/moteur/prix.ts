import type { Bien } from './bien'

export interface PrixEffectifs {
  // Prix effectif (recalé) en € par m² de Contenance, par Parcelle ; vide si aucun prix n'est saisi
  parM2: Map<string, number>
  // Prix total du Bien, saisi ou déduit des prix à l'hectare ; null si aucun prix n'est saisi
  prixBien: number | null
  // Prix total - Σ Contenance × prix à l'hectare, quand les deux sont saisis
  ecartAvantRecalage: number | null
  // Parcelles sans prix à l'hectare alors que d'autres en ont (leur Coût est nul)
  sansPrix: string[]
}

export function prixEffectifs(bien: Bien): PrixEffectifs {
  const { total, parHectareDefaut, parHectare } = bien.prix
  const brut = new Map(
    bien.parcelles.map((p) => [p.id, (parHectare[p.id] ?? parHectareDefaut ?? null) as number | null]),
  )
  const avecPrix = bien.parcelles.filter((p) => brut.get(p.id) !== null)
  const contenance = bien.parcelles.reduce((t, p) => t + p.contenance, 0)

  if (avecPrix.length === 0) {
    const uniforme = total !== null && contenance > 0 ? total / contenance : null
    return {
      parM2: new Map(uniforme === null ? [] : bien.parcelles.map((p) => [p.id, uniforme])),
      prixBien: total,
      ecartAvantRecalage: null,
      sansPrix: [],
    }
  }

  const sommeBrute = avecPrix.reduce((t, p) => t + (p.contenance * brut.get(p.id)!) / 10000, 0)
  const facteur = total !== null && sommeBrute > 0 ? total / sommeBrute : 1
  return {
    parM2: new Map(bien.parcelles.map((p) => [p.id, ((brut.get(p.id) ?? 0) * facteur) / 10000])),
    prixBien: total ?? sommeBrute,
    ecartAvantRecalage: total === null ? null : total - sommeBrute,
    sansPrix: bien.parcelles.filter((p) => brut.get(p.id) === null).map((p) => p.id),
  }
}
