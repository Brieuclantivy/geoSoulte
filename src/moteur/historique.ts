import type { Bien } from './bien'
import { exporter, importer } from './export'

// Historique des états du Bien pour Annuler / Rétablir, en mémoire seulement. Chaque état est un export du Bien,
// avec ce même export sans le Scénario courant : changer de Scénario n'est pas une étape mais met à jour l'état
// courant, si bien qu'annuler ramène sur le Scénario où l'action annulée a été faite.
interface Etat {
  export: string
  contenu: string
}

export interface Historique {
  etats: Etat[]
  // Index de l'état courant ; les états suivants peuvent être rétablis
  position: number
  // Nombre maximal d'étapes annulables
  limite: number
}

function etat(bien: Bien): Etat {
  return { export: exporter(bien), contenu: exporter({ ...bien, courant: '' }) }
}

export function creerHistorique(bien: Bien, limite = 50): Historique {
  return { etats: [etat(bien)], position: 0, limite }
}

// Note l'état du Bien après une action. Un état identique à l'état courant (par exemple celui qu'on vient de
// restaurer) n'est pas une étape.
export function enregistrer(historique: Historique, bien: Bien): void {
  const nouveau = etat(bien)
  const courant = historique.etats[historique.position]
  if (nouveau.export === courant.export) {
    return
  }

  if (nouveau.contenu === courant.contenu) {
    historique.etats[historique.position] = nouveau
    return
  }

  historique.etats.splice(historique.position + 1, Infinity, nouveau)
  historique.etats.splice(0, historique.etats.length - historique.limite - 1)
  historique.position = historique.etats.length - 1
}

export function peutAnnuler(historique: Historique): boolean {
  return historique.position > 0
}

export function peutRetablir(historique: Historique): boolean {
  return historique.position < historique.etats.length - 1
}

// État du Bien avant la dernière action, ou null s'il n'y a rien à annuler
export function annuler(historique: Historique): Bien | null {
  if (!peutAnnuler(historique)) {
    return null
  }

  historique.position--
  return importer(historique.etats[historique.position].export)
}

// État du Bien après l'action annulée, ou null s'il n'y a rien à rétablir
export function retablir(historique: Historique): Bien | null {
  if (!peutRetablir(historique)) {
    return null
  }

  historique.position++
  return importer(historique.etats[historique.position].export)
}
