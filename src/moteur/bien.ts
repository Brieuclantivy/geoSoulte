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

// Objectif d'un Acquéreur, en hectares (de Surface cadastrale) ou en euros (de Coût)
export interface Objectif {
  unite: 'ha' | 'eur'
  valeur: number
}

// Prix du Bien en euros : total et/ou à l'hectare (par défaut, et par Parcelle)
export interface Prix {
  total: number | null
  parHectareDefaut: number | null
  parHectare: Record<string, number>
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
  id: string
  nom: string
  objectifs: Record<string, Objectif>
  // Écart relatif à l'Objectif en deçà duquel un Tènement entier est attribué
  tolerance: number
  // Attributions verrouillées : clé de Tènement → Acquéreur
  verrouillages: Record<string, string>
  // Direction d'avancée des bandes, en degrés (0 = vers l'est, 90 = vers le nord) ; null : côté le plus long
  orientation: number | null
  // Ordre des Acquéreurs dans les bandes ; les Acquéreurs absents passent ensuite
  ordre: string[]
  lignes: LigneCoupe[]
  attributions: Attribution[]
  // Vrai dès que le Découpage automatique a été lancé, même si un changement de Parcelles l'a effacé depuis
  decoupe: boolean
  // Vrai si les lignes ou les attributions ont été modifiées à la main depuis le dernier Découpage automatique
  ajuste: boolean
}

export interface Bien {
  parcelles: Parcelle[]
  prix: Prix
  acquereurs: Acquereur[]
  scenarios: Scenario[]
  // Identifiant du Scénario courant
  courant: string
}

export interface BilanParcelle {
  id: string
  contenance: number
  surfaceMesuree: number
  // Indice du Tènement dans BilanBien.tenements
  tenement: number
}

export interface BilanTenement {
  cle: string
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

export function scenarioVide(id: string, nom: string): Scenario {
  return {
    id,
    nom,
    objectifs: {},
    tolerance: 0.05,
    verrouillages: {},
    orientation: null,
    ordre: [],
    lignes: [],
    attributions: [],
    decoupe: false,
    ajuste: false,
  }
}

export function creerBien(): Bien {
  return {
    parcelles: [],
    prix: { total: null, parHectareDefaut: null, parHectare: {} },
    acquereurs: [],
    scenarios: [scenarioVide('s1', 'Scénario 1')],
    courant: 's1',
  }
}

export function scenarioCourant(bien: Bien): Scenario {
  return bien.scenarios.find((s) => s.id === bien.courant) ?? bien.scenarios[0]
}

function nouvelIdScenario(bien: Bien): string {
  return `s${Math.max(0, ...bien.scenarios.map((s) => Number(s.id.slice(1)))) + 1}`
}

export function creerScenario(bien: Bien, nom: string): string {
  const id = nouvelIdScenario(bien)
  bien.scenarios.push(scenarioVide(id, nom))
  return id
}

// Duplique le Scénario courant (copie JSON : le Bien peut être un proxy réactif, que structuredClone refuse)
export function dupliquerScenario(bien: Bien): string {
  const original = scenarioCourant(bien)
  const id = nouvelIdScenario(bien)
  bien.scenarios.push({ ...JSON.parse(JSON.stringify(original)), id, nom: `${original.nom} (copie)` })
  return id
}

export function choisirScenario(bien: Bien, id: string): void {
  bien.courant = id
}

export function renommerScenario(bien: Bien, id: string, nom: string): void {
  const scenario = bien.scenarios.find((s) => s.id === id)
  if (scenario) {
    scenario.nom = nom
  }
}

// Le dernier Scénario ne peut pas être supprimé
export function supprimerScenario(bien: Bien, id: string): void {
  if (bien.scenarios.length <= 1) {
    return
  }

  bien.scenarios = bien.scenarios.filter((s) => s.id !== id)
  if (bien.courant === id) {
    bien.courant = bien.scenarios[0].id
  }
}

export function fixerPrix(bien: Bien, prix: Prix): void {
  bien.prix = prix
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

// Scénarios où l'Acquéreur a au moins un Lot
export function scenariosAvecLots(bien: Bien, acquereur: string): Scenario[] {
  return bien.scenarios.filter((s) => s.attributions.some((a) => a.acquereur === acquereur))
}

// Le Découpage des Scénarios où l'Acquéreur a des Lots n'a plus de sens sans lui : il est effacé
export function supprimerAcquereur(bien: Bien, id: string): void {
  const aEffacer = scenariosAvecLots(bien, id)
  bien.acquereurs = bien.acquereurs.filter((a) => a.id !== id)
  for (const scenario of bien.scenarios) {
    delete scenario.objectifs[id]
    scenario.ordre = scenario.ordre.filter((a) => a !== id)
    for (const [tenement, acquereur] of Object.entries(scenario.verrouillages)) {
      if (acquereur === id) {
        delete scenario.verrouillages[tenement]
      }
    }

    if (aEffacer.includes(scenario)) {
      scenario.lignes = []
      scenario.attributions = []
    }
  }
}

export function fixerOrientation(bien: Bien, degres: number | null): void {
  scenarioCourant(bien).orientation = degres
}

export function fixerOrdre(bien: Bien, ordre: string[]): void {
  scenarioCourant(bien).ordre = ordre
}

// Acquéreurs dans l'ordre du Scénario
export function acquereursOrdonnes(bien: Bien): Acquereur[] {
  const rang = (a: Acquereur) => {
    const i = scenarioCourant(bien).ordre.indexOf(a.id)
    return i === -1 ? Infinity : i
  }
  return [...bien.acquereurs].sort((a, b) => rang(a) - rang(b))
}

export function fixerTolerance(bien: Bien, tolerance: number): void {
  scenarioCourant(bien).tolerance = tolerance
}

// Verrouille le Tènement (par sa clé) sur un Acquéreur, ou le déverrouille (null)
export function verrouiller(bien: Bien, tenement: string, acquereur: string | null): void {
  if (acquereur === null) {
    delete scenarioCourant(bien).verrouillages[tenement]
  } else {
    scenarioCourant(bien).verrouillages[tenement] = acquereur
  }
}

export function fixerObjectif(bien: Bien, acquereur: string, objectif: Objectif): void {
  scenarioCourant(bien).objectifs[acquereur] = objectif
}

export function ajouterParcelle(bien: Bien, parcelle: Parcelle): void {
  if (bien.parcelles.some((p) => p.id === parcelle.id)) {
    return
  }

  changerParcelles(bien, [...bien.parcelles, parcelle])
}

export function retirerParcelle(bien: Bien, id: string): void {
  changerParcelles(bien, bien.parcelles.filter((p) => p.id !== id))
}

// Remplace les Parcelles du Bien. Dans tous les Scénarios, le Découpage (lignes, attributions, verrouillages)
// des Tènements dont la composition change est effacé ; celui des Tènements intacts est conservé.
function changerParcelles(bien: Bien, parcelles: Parcelle[]): void {
  const composition = (t: { cle: string; parcelles: Parcelle[] }) => t.parcelles.map((p) => p.id).sort().join()
  const avant = new Map(tenementsDuBien(bien).map((t) => [t.cle, composition(t)]))
  bien.parcelles = parcelles
  const intacts = new Set(tenementsDuBien(bien).filter((t) => avant.get(t.cle) === composition(t)).map((t) => t.cle))
  for (const scenario of bien.scenarios) {
    scenario.lignes = scenario.lignes.filter((l) => intacts.has(l.tenement))
    scenario.attributions = scenario.attributions.filter((a) => intacts.has(a.tenement))
    for (const tenement of Object.keys(scenario.verrouillages)) {
      if (!intacts.has(tenement)) {
        delete scenario.verrouillages[tenement]
      }
    }
  }
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
    const ids = ps.map((p) => p.id)
    return { cle: [...ids].sort()[0], parcelles: ids, ...totaliser(ps) }
  })
  const total = totaliser(parcelles)
  return { parcelles, tenements: bilanTenements, ...total, ecart: total.contenance - total.surfaceMesuree }
}
