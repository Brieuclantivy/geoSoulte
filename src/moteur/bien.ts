import { aire, versL93, voisines, type Geometrie } from './geo'

// Écart maximal (m) entre deux Parcelles considérées comme contiguës, pour absorber les imprécisions du cadastre
const TOLERANCE_CONTIGUITE = 1

export interface Parcelle {
  id: string
  geometrie: Geometrie
  // Contenance en m²
  contenance: number
}

export interface Bien {
  parcelles: Parcelle[]
}

export interface BilanParcelle {
  id: string
  contenance: number
  surfaceMesuree: number
  // Indice du Tènement dans BilanBien.tenements
  tenement: number
}

export interface BilanTenement {
  parcelles: string[]
  contenance: number
  surfaceMesuree: number
}

export interface BilanBien {
  parcelles: BilanParcelle[]
  tenements: BilanTenement[]
  contenance: number
  surfaceMesuree: number
  // Contenance - Surface mesurée
  ecart: number
}

export function creerBien(): Bien {
  return { parcelles: [] }
}

export function ajouterParcelle(bien: Bien, parcelle: Parcelle): void {
  if (bien.parcelles.some((p) => p.id === parcelle.id)) {
    return
  }

  bien.parcelles.push(parcelle)
}

export function retirerParcelle(bien: Bien, id: string): void {
  bien.parcelles = bien.parcelles.filter((p) => p.id !== id)
}

// Regroupe les Parcelles contiguës (union-find) ; renvoie pour chaque Parcelle l'indice de son Tènement
function tenements(bien: Bien): number[] {
  const geometries = bien.parcelles.map((p) => versL93(p.geometrie))
  const parent = geometries.map((_, i) => i)
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])))
  for (let i = 0; i < geometries.length; i++) {
    for (let j = i + 1; j < geometries.length; j++) {
      if (voisines(geometries[i], geometries[j], TOLERANCE_CONTIGUITE)) {
        parent[racine(j)] = racine(i)
      }
    }
  }

  // Numérotation dans l'ordre d'apparition des Parcelles
  const numeros = new Map<number, number>()
  return geometries.map((_, i) => {
    const r = racine(i)
    if (!numeros.has(r)) {
      numeros.set(r, numeros.size)
    }

    return numeros.get(r)!
  })
}

export function bilanBien(bien: Bien): BilanBien {
  const indices = tenements(bien)
  const parcelles = bien.parcelles.map((p, i) => ({
    id: p.id,
    contenance: p.contenance,
    surfaceMesuree: aire(versL93(p.geometrie)),
    tenement: indices[i],
  }))
  const totaliser = (ps: BilanParcelle[]) => ({
    contenance: ps.reduce((t, p) => t + p.contenance, 0),
    surfaceMesuree: ps.reduce((t, p) => t + p.surfaceMesuree, 0),
  })
  const nbTenements = Math.max(0, ...indices.map((i) => i + 1))
  const bilanTenements = Array.from({ length: nbTenements }, (_, t) => {
    const ps = parcelles.filter((p) => p.tenement === t)
    return { parcelles: ps.map((p) => p.id), ...totaliser(ps) }
  })
  const total = totaliser(parcelles)
  return { parcelles, tenements: bilanTenements, ...total, ecart: total.contenance - total.surfaceMesuree }
}
