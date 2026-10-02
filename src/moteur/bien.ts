import type { Position } from 'geojson'
import { aire, versL93, voisines, type Geometrie } from './geo'

// Écart maximal (m) entre deux Parcelles considérées comme contiguës, pour absorber les imprécisions du cadastre
const TOLERANCE_CONTIGUITE = 1

export interface Parcelle {
  id: string
  geometrie: Geometrie
  // Contenance en m²
  contenance: number
}

export interface Acquereur {
  id: string
  nom: string
  couleur: string
}

export interface Objectif {
  unite: 'ha'
  valeur: number
}

// Ligne de coupe d'un Tènement (identifié par sa clé), en WGS84
export interface LigneCoupe {
  tenement: string
  points: Position[]
}

// Un Lot est la partie d'un Tènement située d'un même côté de chacune de ses lignes de coupe :
// sa signature note ce côté ('G' gauche, 'D' droite) pour chaque ligne, dans l'ordre des lignes du Tènement
export interface Attribution {
  tenement: string
  signature: string
  acquereur: string
}

export interface Scenario {
  objectifs: Record<string, Objectif>
  lignes: LigneCoupe[]
  attributions: Attribution[]
}

export interface Bien {
  parcelles: Parcelle[]
  acquereurs: Acquereur[]
  scenario: Scenario
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

const COULEURS_ACQUEREURS = ['#e6194b', '#4363d8', '#3cb44b', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324']

export function creerBien(): Bien {
  return { parcelles: [], acquereurs: [], scenario: { objectifs: {}, lignes: [], attributions: [] } }
}

export function ajouterAcquereur(bien: Bien, nom: string): string {
  const numero = Math.max(0, ...bien.acquereurs.map((a) => Number(a.id.slice(1)))) + 1
  const id = `a${numero}`
  bien.acquereurs.push({ id, nom, couleur: COULEURS_ACQUEREURS[(numero - 1) % COULEURS_ACQUEREURS.length] })
  return id
}

export function renommerAcquereur(bien: Bien, id: string, nom: string): void {
  const acquereur = bien.acquereurs.find((a) => a.id === id)
  if (acquereur) {
    acquereur.nom = nom
  }
}

// Le Découpage n'a plus de sens sans cet Acquéreur : il est effacé et devra être relancé
export function supprimerAcquereur(bien: Bien, id: string): void {
  bien.acquereurs = bien.acquereurs.filter((a) => a.id !== id)
  delete bien.scenario.objectifs[id]
  bien.scenario.lignes = []
  bien.scenario.attributions = []
}

export function fixerObjectif(bien: Bien, acquereur: string, objectif: Objectif): void {
  bien.scenario.objectifs[acquereur] = objectif
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

// Les Tènements du Bien ; la clé d'un Tènement est le plus petit identifiant de ses Parcelles
export function tenementsDuBien(bien: Bien): { cle: string; parcelles: Parcelle[] }[] {
  const indices = tenements(bien)
  const groupes: Parcelle[][] = []
  bien.parcelles.forEach((p, i) => (groupes[indices[i]] ??= []).push(p))
  return groupes.map((parcelles) => ({ cle: parcelles.map((p) => p.id).sort()[0], parcelles }))
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
