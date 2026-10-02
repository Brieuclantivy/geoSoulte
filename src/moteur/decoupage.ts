import type { MultiPolygon, Position } from 'geojson'
import { difference, intersection, union, type Geom } from 'polyclip-ts'
import { acquereursOrdonnes, scenarioCourant, tenementsDuBien, type Bien, type LigneCoupe, type Objectif, type Parcelle } from './bien'
import { prixEffectifs, type PrixEffectifs } from './prix'
import {
  aire,
  axeLong,
  boite,
  ligneTouche,
  pointVersL93,
  pointVersWgs84,
  polygonesVersWgs84,
  tourner,
  tournerPolygones,
  versL93,
  type PolygonesL93,
} from './geo'

export interface BilanLot {
  tenement: string
  signature: string
  acquereur: string | null
  geometrie: MultiPolygon
  surfaceMesuree: number
  surfaceCadastrale: number
  // Coût en €, ou null si aucun prix n'est saisi
  cout: number | null
}

export interface BilanAcquereur {
  id: string
  surfaceMesuree: number
  surfaceCadastrale: number
  cout: number | null
  objectif: Objectif | null
  // Écart à l'Objectif dans son unité : Surface cadastrale - Objectif (en ha), ou Coût - Objectif (en €)
  ecart: number | null
}

export interface BilanScenario {
  lots: BilanLot[]
  acquereurs: BilanAcquereur[]
  ecartAvantRecalage: number | null
  avertissements: string[]
}

const TOLERANCE_BISSECTION = 0.01 // m²

// Pour les calculs purement géométriques, où les prix n'interviennent pas
const SANS_PRIX: PrixEffectifs = { parM2: new Map(), prixBien: null, ecartAvantRecalage: null, sansPrix: [] }

// Morceau d'une Parcelle situé d'un même côté de chaque ligne de coupe
interface Morceau {
  signature: string
  geometrie: PolygonesL93
  // Contenance par m² mesuré de la Parcelle d'origine
  densite: number
  // Prix effectif en € par m² de Contenance de la Parcelle d'origine
  prix: number
}

function enGeom(polygones: PolygonesL93): Geom {
  return polygones as Geom
}

// Polygone couvrant le côté gauche de la ligne (sens de parcours de ses points), dans un rayon largement
// supérieur au Tènement : la ligne est prolongée à ses deux bouts puis refermée par la gauche.
function coteGauche(points: Position[], portee: number): PolygonesL93 {
  const [ax, ay] = points[0]
  const [bx, by] = points[points.length - 1]
  const longueur = Math.hypot(bx - ax, by - ay)
  const ux = (bx - ax) / longueur
  const uy = (by - ay) / longueur
  // Normale gauche
  const nx = -uy
  const ny = ux
  const debut = [ax - ux * portee, ay - uy * portee]
  const fin = [bx + ux * portee, by + uy * portee]
  const anneau = [
    debut,
    ...points,
    fin,
    [fin[0] + nx * portee, fin[1] + ny * portee],
    [debut[0] + nx * portee, debut[1] + ny * portee],
    debut,
  ]
  return [[anneau]]
}

function morceaux(parcelles: Parcelle[], lignes: LigneCoupe[], prix: PrixEffectifs): Morceau[] {
  const geometries = parcelles.map((p) => versL93(p.geometrie))
  const [x0, y0, x1, y1] = boite(geometries.flat())
  const portee = 10 * Math.hypot(x1 - x0, y1 - y0)
  const cotes = lignes.map((l) => coteGauche(l.points.map(pointVersL93), portee))

  let resultat: Morceau[] = parcelles.map((p, i) => ({
    signature: '',
    geometrie: geometries[i],
    densite: p.contenance / aire(geometries[i]),
    prix: prix.parM2.get(p.id) ?? 0,
  }))
  for (const cote of cotes) {
    resultat = resultat.flatMap((m) =>
      [
        { ...m, signature: m.signature + 'G', geometrie: intersection(enGeom(m.geometrie), enGeom(cote)) },
        { ...m, signature: m.signature + 'D', geometrie: difference(enGeom(m.geometrie), enGeom(cote)) },
      ].filter((n) => n.geometrie.length > 0),
    )
  }

  return resultat
}

export function bilanScenario(bien: Bien): BilanScenario {
  const { lignes, attributions, objectifs, decoupe } = scenarioCourant(bien)
  const prix = prixEffectifs(bien)
  const avecPrix = prix.parM2.size > 0
  const lots: BilanLot[] = tenementsDuBien(bien).flatMap(({ cle, parcelles }) => {
    const parSignature = new Map<string, Morceau[]>()
    for (const m of morceaux(
      parcelles,
      lignes.filter((l) => l.tenement === cle),
      prix,
    )) {
      parSignature.set(m.signature, [...(parSignature.get(m.signature) ?? []), m])
    }

    return [...parSignature].map(([signature, ms]) => ({
      tenement: cle,
      signature,
      acquereur: attributions.find((a) => a.tenement === cle && a.signature === signature)?.acquereur ?? null,
      geometrie: polygonesVersWgs84(union(...(ms.map((m) => enGeom(m.geometrie)) as [Geom, ...Geom[]]))),
      surfaceMesuree: ms.reduce((t, m) => t + aire(m.geometrie), 0),
      surfaceCadastrale: ms.reduce((t, m) => t + aire(m.geometrie) * m.densite, 0),
      cout: avecPrix ? ms.reduce((t, m) => t + aire(m.geometrie) * m.densite * m.prix, 0) : null,
    }))
  })

  const acquereurs = bien.acquereurs.map(({ id }) => {
    const siens = lots.filter((l) => l.acquereur === id)
    const surfaceCadastrale = siens.reduce((t, l) => t + l.surfaceCadastrale, 0)
    const cout = avecPrix ? siens.reduce((t, l) => t + l.cout!, 0) : null
    const objectif = objectifs[id] ?? null
    let ecart: number | null = null
    if (objectif?.unite === 'ha') {
      ecart = surfaceCadastrale - objectif.valeur * 10000
    } else if (objectif?.unite === 'eur' && cout !== null) {
      ecart = cout - objectif.valeur
    }

    return { id, surfaceMesuree: siens.reduce((t, l) => t + l.surfaceMesuree, 0), surfaceCadastrale, cout, objectif, ecart }
  })

  const avertissements = [...parts(bien, prix).avertissements]
  // Avant tout Découpage, aucun Lot n'est attribué : rien à signaler
  if (decoupe && lots.some((l) => l.acquereur === null)) {
    avertissements.push('Surface non attribuée : relancez le Découpage')
  }

  if (prix.sansPrix.length > 0) {
    avertissements.push(`Parcelles sans prix à l'hectare (Coût nul) : ${prix.sansPrix.join(', ')}`)
  }

  return { lots, acquereurs, ecartAvantRecalage: prix.ecartAvantRecalage, avertissements }
}

interface Part {
  id: string
  unite: Objectif['unite']
  // Fraction du Bien revenant à l'Acquéreur, après prorata
  part: number
}

// Part du Bien visée par chaque Acquéreur : Objectif / Contenance du Bien (ha) ou / prix du Bien (€),
// ramenée au prorata quand la somme ne fait pas 100 %
function parts(bien: Bien, prix: PrixEffectifs): { parts: Part[]; avertissements: string[] } {
  const contenance = bien.parcelles.reduce((t, p) => t + p.contenance, 0)
  const avertissements: string[] = []
  const brutes: Part[] = []
  for (const a of acquereursOrdonnes(bien)) {
    const objectif = scenarioCourant(bien).objectifs[a.id]
    if (!objectif || objectif.valeur <= 0) {
      continue
    }

    if (objectif.unite === 'eur' && !prix.prixBien) {
      avertissements.push(`L'Objectif en euros de ${a.nom} est ignoré : aucun prix n'est saisi`)
      continue
    }

    const reference = objectif.unite === 'ha' ? contenance / 10000 : prix.prixBien!
    brutes.push({ id: a.id, unite: objectif.unite, part: objectif.valeur / reference })
  }

  const somme = brutes.reduce((t, p) => t + p.part, 0)
  if (brutes.length > 0 && Math.abs(somme - 1) > 1e-6) {
    avertissements.push(
      `Les Objectifs représentent ${(somme * 100).toFixed(1).replace('.', ',')} % du Bien : parts ajustées au prorata`,
    )
  }

  return { parts: brutes.map((p) => ({ ...p, part: p.part / somme })), avertissements }
}

interface ParcelleL93 {
  geometrie: PolygonesL93
  densite: number
  prix: number
}

// Mesure (Surface cadastrale, ou Coût) de la partie des Parcelles située à l'ouest de l'abscisse x (Lambert 93)
function mesureAvant(parcelles: ParcelleL93[], unite: Objectif['unite'], x: number, boiteY: [number, number]): number {
  const demiPlan: PolygonesL93 = [
    [
      [
        [x - 1e7, boiteY[0] - 1],
        [x, boiteY[0] - 1],
        [x, boiteY[1] + 1],
        [x - 1e7, boiteY[1] + 1],
        [x - 1e7, boiteY[0] - 1],
      ],
    ],
  ]
  return parcelles.reduce((t, p) => {
    const surface = aire(intersection(enGeom(p.geometrie), enGeom(demiPlan))) * p.densite
    return t + (unite === 'ha' ? surface : surface * p.prix)
  }, 0)
}

function mesureTotale(parcelles: ParcelleL93[], unite: Objectif['unite']): number {
  return parcelles.reduce((t, p) => {
    const surface = aire(p.geometrie) * p.densite
    return t + (unite === 'ha' ? surface : surface * p.prix)
  }, 0)
}

// En deçà de cette quantité (m² ou €), l'Objectif d'un Acquéreur est considéré comme atteint
const RELIQUAT = 1

// Découpage automatique, en trois temps :
// 1. les Tènements verrouillés vont en entier à leur Acquéreur ;
// 2. du plus grand au plus petit, un Tènement va en entier à l'Acquéreur le plus loin de son Objectif en proportion,
//    s'il y tient à la tolérance près ;
// 3. les Tènements restants sont découpés en bandes parallèles, avançant selon l'orientation du Scénario
//    (par défaut le grand côté du Tènement), que les Acquéreurs remplissent dans leur ordre, chacun jusqu'à son Objectif, mesuré en Surface cadastrale
//    (Objectif en ha) ou en Coût (Objectif en €).
export function lancerDecoupage(bien: Bien): void {
  const prix = prixEffectifs(bien)
  const participants = parts(bien, prix).parts
  const { verrouillages, tolerance, orientation } = scenarioCourant(bien)
  scenarioCourant(bien).lignes = []
  scenarioCourant(bien).attributions = []
  scenarioCourant(bien).ajuste = false
  scenarioCourant(bien).decoupe = true

  const tenements = tenementsDuBien(bien).map(({ cle, parcelles }) => ({
    cle,
    contenance: parcelles.reduce((t, p) => t + p.contenance, 0),
    parcelles: parcelles.map((p) => {
      const geometrie = versL93(p.geometrie)
      return { geometrie, densite: p.contenance / aire(geometrie), prix: prix.parM2.get(p.id) ?? 0 }
    }),
  }))
  const tout = tenements.flatMap((t) => t.parcelles)
  const cibles = new Map(participants.map((a) => [a.id, a.part * mesureTotale(tout, a.unite)]))
  const restants = new Map(cibles)
  const attribuer = (tenement: string, signature: string, acquereur: string) =>
    scenarioCourant(bien).attributions.push({ tenement, signature, acquereur })
  const prendre = (acquereur: string, quantite: number) => {
    if (restants.has(acquereur)) {
      restants.set(acquereur, restants.get(acquereur)! - quantite)
    }
  }
  const uniteDe = (acquereur: string) => participants.find((a) => a.id === acquereur)?.unite ?? 'ha'

  // 1. Verrouillages
  const libres = tenements.filter((t) => {
    const acquereur = verrouillages[t.cle]
    if (!acquereur || !bien.acquereurs.some((a) => a.id === acquereur)) {
      return true
    }

    attribuer(t.cle, '', acquereur)
    prendre(acquereur, mesureTotale(t.parcelles, uniteDe(acquereur)))
    return false
  })
  if (participants.length === 0) {
    return
  }

  // 2. Tènements entiers
  const aDecouper = [...libres]
    .sort((a, b) => b.contenance - a.contenance)
    .filter((t) => {
      const [candidat] = [...participants].sort(
        (a, b) => restants.get(b.id)! / cibles.get(b.id)! - restants.get(a.id)! / cibles.get(a.id)!,
      )
      const mesure = mesureTotale(t.parcelles, candidat.unite)
      if (mesure > restants.get(candidat.id)! + tolerance * cibles.get(candidat.id)!) {
        return true
      }

      attribuer(t.cle, '', candidat.id)
      prendre(candidat.id, mesure)
      return false
    })

  // 3. Bandes
  for (const t of libres.filter((l) => aDecouper.includes(l))) {
    // On travaille dans un repère tourné où les bandes avancent vers les x croissants
    const geometries = t.parcelles.map((p) => p.geometrie)
    const angle = orientation === null ? axeLong(geometries.flat()) : (orientation * Math.PI) / 180
    const [bx0, by0, bx1, by1] = boite(geometries.flat())
    const pivot = [(bx0 + bx1) / 2, (by0 + by1) / 2]
    const parcelles = t.parcelles.map((p) => ({ ...p, geometrie: tournerPolygones(p.geometrie, -angle, pivot) }))
    const [x0, y0, x1, y1] = boite(parcelles.map((p) => p.geometrie).flat())
    const mesure = (unite: Objectif['unite'], x: number) => mesureAvant(parcelles, unite, x, [y0, y1])
    const proprietaires: string[] = []
    let precedente = x0
    for (const a of participants) {
      if (restants.get(a.id)! < RELIQUAT) {
        continue
      }

      const dejaPris = mesure(a.unite, precedente)
      const reste = mesureTotale(t.parcelles, a.unite) - dejaPris
      proprietaires.push(a.id)
      if (reste <= restants.get(a.id)! + RELIQUAT) {
        prendre(a.id, reste)
        precedente = x1
        break
      }

      const cible = dejaPris + restants.get(a.id)!
      let bas = precedente
      let haut = x1
      while (haut - bas > 1e-6) {
        const milieu = (bas + haut) / 2
        const s = mesure(a.unite, milieu)
        if (Math.abs(s - cible) < TOLERANCE_BISSECTION) {
          bas = haut = milieu
        } else if (s < cible) {
          bas = milieu
        } else {
          haut = milieu
        }
      }

      prendre(a.id, restants.get(a.id)!)
      precedente = bas
      // Ligne orientée de sorte que sa gauche soit du côté des bandes précédentes
      scenarioCourant(bien).lignes.push({
        tenement: t.cle,
        points: [
          [bas, y0 - 1],
          [bas, y1 + 1],
        ].map((p) => pointVersWgs84(tourner(p, angle, pivot))),
      })
    }

    // Tènement non épuisé (arrondis, ou Objectifs en € sur des terres de prix inégaux) :
    // la dernière bande est prolongée jusqu'au bout, ou le Tènement va au dernier Acquéreur
    if (precedente < x1) {
      if (proprietaires.length > 0) {
        scenarioCourant(bien).lignes.pop()
      } else {
        proprietaires.push(participants[participants.length - 1].id)
      }
    }

    const nbLignes = scenarioCourant(bien).lignes.filter((l) => l.tenement === t.cle).length
    proprietaires.forEach((acquereur, j) => attribuer(t.cle, 'D'.repeat(j) + 'G'.repeat(nbLignes - j), acquereur))
  }
}

// Signatures des Lots non vides d'un Tènement (les éclats de moins d'1 dm² dus aux arrondis sont ignorés)
function signaturesDesLots(parcelles: Parcelle[], lignes: LigneCoupe[]): Set<string> {
  return new Set(
    morceaux(parcelles, lignes, SANS_PRIX)
      .filter((m) => aire(m.geometrie) >= 0.01)
      .map((m) => m.signature),
  )
}

// Remplace les points (WGS84) de la ligne de coupe d'indice donné. La modification est refusée (false) si
// elle vide ou crée un Lot dans le Tènement : chaque Lot garde ainsi son Acquéreur et tout reste attribué.
export function modifierLigne(bien: Bien, index: number, points: Position[]): boolean {
  const ligne = scenarioCourant(bien).lignes[index]
  const tenement = tenementsDuBien(bien).find((t) => t.cle === ligne?.tenement)
  if (!tenement || points.length < 2) {
    return false
  }

  const modifiees = scenarioCourant(bien).lignes.map((l, i) => (i === index ? { ...l, points } : l))
  const duTenement = (lignes: LigneCoupe[]) => lignes.filter((l) => l.tenement === ligne.tenement)
  const avant = signaturesDesLots(tenement.parcelles, duTenement(scenarioCourant(bien).lignes))
  const apres = signaturesDesLots(tenement.parcelles, duTenement(modifiees))
  if (avant.size !== apres.size || [...avant].some((s) => !apres.has(s))) {
    return false
  }

  scenarioCourant(bien).lignes = modifiees
  scenarioCourant(bien).ajuste = true
  return true
}

// Ajoute une ligne de coupe (WGS84) à chaque Tènement que son trace touche et découpe ; les deux Lots issus
// d'un Lot gardent son Acquéreur. Refusée (false) si elle ne découpe aucun Lot.
export function ajouterLigne(bien: Bien, points: Position[]): boolean {
  const trace = points.map(pointVersL93)
  let acceptee = false
  for (const { cle, parcelles } of tenementsDuBien(bien)) {
    if (!parcelles.some((p) => ligneTouche(trace, versL93(p.geometrie)))) {
      continue
    }

    const ligne = { tenement: cle, points }
    const lignes = scenarioCourant(bien).lignes.filter((l) => l.tenement === cle)
    const avant = signaturesDesLots(parcelles, lignes)
    if (signaturesDesLots(parcelles, [...lignes, ligne]).size === avant.size) {
      continue
    }

    acceptee = true
    scenarioCourant(bien).lignes.push(ligne)
    scenarioCourant(bien).attributions = scenarioCourant(bien).attributions.flatMap((a) =>
      a.tenement === cle
        ? [
            { ...a, signature: a.signature + 'G' },
            { ...a, signature: a.signature + 'D' },
          ]
        : [a],
    )
  }

  if (acceptee) {
    scenarioCourant(bien).ajuste = true
  }

  return acceptee
}

// Supprime une ligne de coupe ; chaque Lot fusionné va à l'Acquéreur de sa plus grande partie
export function supprimerLigne(bien: Bien, index: number): void {
  const ligne = scenarioCourant(bien).lignes[index]
  const tenement = tenementsDuBien(bien).find((t) => t.cle === ligne?.tenement)
  if (!tenement) {
    return
  }

  const lignes = scenarioCourant(bien).lignes.filter((l) => l.tenement === ligne.tenement)
  const rang = lignes.indexOf(ligne)
  const surfaces = new Map<string, number>()
  for (const m of morceaux(tenement.parcelles, lignes, SANS_PRIX)) {
    surfaces.set(m.signature, (surfaces.get(m.signature) ?? 0) + aire(m.geometrie))
  }

  const fusion = new Map<string, { acquereur: string; surface: number }>()
  for (const a of scenarioCourant(bien).attributions.filter((a) => a.tenement === ligne.tenement)) {
    const signature = a.signature.slice(0, rang) + a.signature.slice(rang + 1)
    const surface = surfaces.get(a.signature) ?? 0
    if (surface > (fusion.get(signature)?.surface ?? -1)) {
      fusion.set(signature, { acquereur: a.acquereur, surface })
    }
  }

  scenarioCourant(bien).lignes = scenarioCourant(bien).lignes.filter((_, i) => i !== index)
  scenarioCourant(bien).attributions = [
    ...scenarioCourant(bien).attributions.filter((a) => a.tenement !== ligne.tenement),
    ...[...fusion].map(([signature, { acquereur }]) => ({ tenement: ligne.tenement, signature, acquereur })),
  ]
  scenarioCourant(bien).ajuste = true
}

export function reattribuer(bien: Bien, tenement: string, signature: string, acquereur: string): void {
  scenarioCourant(bien).attributions = [
    ...scenarioCourant(bien).attributions.filter((a) => a.tenement !== tenement || a.signature !== signature),
    { tenement, signature, acquereur },
  ]
  scenarioCourant(bien).ajuste = true
}
