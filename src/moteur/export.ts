import { creerBien, scenarioVide, type Bien, type Scenario } from './bien'

// Version du format d'export ; à incrémenter (avec une migration) quand la structure du Bien change.
// Version 1 : un seul Scénario (champ `scenario`) ; version 2 : plusieurs Scénarios.
const VERSION = 2

export function exporter(bien: Bien): string {
  return JSON.stringify({ version: VERSION, bien })
}

export function importer(json: string): Bien {
  const donnees = JSON.parse(json)
  if (![1, VERSION].includes(donnees?.version) || !Array.isArray(donnees.bien?.parcelles)) {
    throw new Error("Ce fichier n'est pas un export geoSoulte valide")
  }

  const { scenario, ...bien } = donnees.bien
  if (donnees.version === 1) {
    bien.scenarios = [{ ...scenario, id: 's1', nom: 'Scénario 1' }]
    bien.courant = 's1'
  }

  // Les champs absents des exports antérieurs prennent leur valeur par défaut
  return {
    ...creerBien(),
    ...bien,
    scenarios: bien.scenarios.map((s: Scenario) => ({ ...scenarioVide(s.id, s.nom), ...s })),
  }
}
