// Sauvegarde du Bien dans le navigateur ; le stockage peut être indisponible (navigation privée, quota)
import type { Bien } from './moteur/bien'
import { exporter, importer } from './moteur/export'

const CLE = 'geosoulte'

export function chargerSauvegarde(): Bien | null {
  try {
    const json = localStorage.getItem(CLE)
    return json ? importer(json) : null
  } catch {
    return null
  }
}

export function sauvegarder(bien: Bien): void {
  try {
    localStorage.setItem(CLE, exporter(bien))
  } catch {
    // Sans stockage, l'app reste utilisable : seul l'export fichier conserve le travail
  }
}
