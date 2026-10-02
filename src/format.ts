export function hectares(m2: number): string {
  return (m2 / 10000).toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' ha'
}
