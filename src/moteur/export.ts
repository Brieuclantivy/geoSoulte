import { creerBien, type Bien } from './bien'

// Version du format d'export ; à incrémenter (avec une migration) quand la structure du Bien change
const VERSION = 1

export function exporter(bien: Bien): string {
  return JSON.stringify({ version: VERSION, bien })
}

export function importer(json: string): Bien {
  const donnees = JSON.parse(json)
  if (donnees?.version !== VERSION || !Array.isArray(donnees.bien?.parcelles)) {
    throw new Error("Ce fichier n'est pas un export geoSoulte valide")
  }

  // Les champs absents des exports antérieurs prennent leur valeur par défaut
  const defaut = creerBien()
  return { ...defaut, ...donnees.bien, scenario: { ...defaut.scenario, ...donnees.bien.scenario } }
}
