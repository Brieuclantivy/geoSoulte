export function hectares(m2: number): string {
  return (m2 / 10000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha'
}

export function euros(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

// Nombre saisi dans un <input type="number">, ou null si le champ est vide ou invalide
export function nombreSaisi(e: Event): number | null {
  const valeur = (e.target as HTMLInputElement).valueAsNumber
  return Number.isNaN(valeur) ? null : valeur
}
