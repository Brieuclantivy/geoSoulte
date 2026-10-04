import { describe, expect, test } from 'vitest'
import {
  ajouterAcquereur,
  ajouterParcelle,
  bilanBien,
  choisirScenario,
  creerBien,
  dupliquerScenario,
  fixerObjectif,
  fixerPrix,
  retirerParcelle,
  scenarioCourant,
  type Bien,
} from './bien'
import { bilanScenario, lancerDecoupage, reattribuer, supprimerLigne } from './decoupage'
import { exporter } from './export'
import { annuler, creerHistorique, enregistrer, peutAnnuler, peutRetablir, retablir, type Historique } from './historique'
import { rectangle } from './fixtures'

// Reproduit App.vue : chaque changement du Bien est enregistré, et un état restauré remplace le Bien comme un import
function action(historique: Historique, bien: Bien, faire: () => void) {
  faire()
  enregistrer(historique, bien)
}

function restaurer(historique: Historique, bien: Bien, etat: Bien | null) {
  if (etat) {
    Object.assign(bien, etat)
    enregistrer(historique, bien)
  }
}

function bienDecoupe(): Bien {
  const bien = creerBien()
  ajouterParcelle(bien, rectangle('A', 0, 0, 300, 500))
  ajouterParcelle(bien, rectangle('B', 300, 0, 300, 500))
  fixerPrix(bien, { total: 300000, parHectareDefaut: null, parHectare: {} })
  fixerObjectif(bien, ajouterAcquereur(bien, 'Paul'), { unite: 'ha', valeur: 10 })
  fixerObjectif(bien, ajouterAcquereur(bien, 'Marie'), { unite: 'ha', valeur: 20 })
  lancerDecoupage(bien)
  return bien
}

describe('Annuler / Rétablir', () => {
  test('annule puis rétablit les actions dans l’ordre', () => {
    const bien = creerBien()
    const historique = creerHistorique(bien)
    action(historique, bien, () => ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100)))
    action(historique, bien, () => ajouterParcelle(bien, rectangle('B', 300, 0, 100, 100)))

    restaurer(historique, bien, annuler(historique))
    expect(bien.parcelles.map((p) => p.id)).toEqual(['A'])
    restaurer(historique, bien, annuler(historique))
    expect(bien.parcelles).toEqual([])
    expect(peutAnnuler(historique)).toBe(false)

    restaurer(historique, bien, retablir(historique))
    expect(bien.parcelles.map((p) => p.id)).toEqual(['A'])
    restaurer(historique, bien, retablir(historique))
    expect(bien.parcelles.map((p) => p.id)).toEqual(['A', 'B'])
    expect(peutRetablir(historique)).toBe(false)
  })

  test('une nouvelle action après une annulation vide le rétablissement', () => {
    const bien = creerBien()
    const historique = creerHistorique(bien)
    action(historique, bien, () => ajouterParcelle(bien, rectangle('A', 0, 0, 100, 100)))
    action(historique, bien, () => ajouterParcelle(bien, rectangle('B', 300, 0, 100, 100)))
    restaurer(historique, bien, annuler(historique))

    action(historique, bien, () => ajouterParcelle(bien, rectangle('C', 600, 0, 100, 100)))

    expect(peutRetablir(historique)).toBe(false)
    expect(retablir(historique)).toBeNull()
    restaurer(historique, bien, annuler(historique))
    expect(bien.parcelles.map((p) => p.id)).toEqual(['A'])
  })

  test('au-delà de la limite, les étapes les plus anciennes sont oubliées', () => {
    const bien = creerBien()
    const historique = creerHistorique(bien, 3)
    for (const id of ['A', 'B', 'C', 'D', 'E']) {
      action(historique, bien, () => ajouterParcelle(bien, rectangle(id, id.charCodeAt(0) * 200, 0, 100, 100)))
    }

    let annulations = 0
    while (peutAnnuler(historique)) {
      restaurer(historique, bien, annuler(historique))
      annulations++
    }

    expect(annulations).toBe(3)
    expect(bien.parcelles.map((p) => p.id)).toEqual(['A', 'B'])
  })

  test('annuler ou rétablir sans historique ne fait rien', () => {
    const bien = creerBien()
    const historique = creerHistorique(bien)

    expect(annuler(historique)).toBeNull()
    expect(retablir(historique)).toBeNull()
    expect(peutAnnuler(historique)).toBe(false)
    expect(peutRetablir(historique)).toBe(false)
  })

  test('annuler puis rétablir redonne le même Bien et le même bilan', () => {
    const bien = bienDecoupe()
    const historique = creerHistorique(bien)
    const avant = exporter(bien)
    const bilans = [bilanBien(bien), bilanScenario(bien)]
    const { tenement, signature } = bilanScenario(bien).lots[0]
    const marie = bien.acquereurs[1].id
    action(historique, bien, () => reattribuer(bien, tenement, signature, marie))
    const apres = exporter(bien)
    const bilansApres = [bilanBien(bien), bilanScenario(bien)]

    restaurer(historique, bien, annuler(historique))
    expect(exporter(bien)).toBe(avant)
    expect([bilanBien(bien), bilanScenario(bien)]).toEqual(bilans)

    restaurer(historique, bien, retablir(historique))
    expect(exporter(bien)).toBe(apres)
    expect([bilanBien(bien), bilanScenario(bien)]).toEqual(bilansApres)
  })

  test('chaque action s’annule : ligne supprimée, Découpage relancé, Parcelle retirée, prix, Objectif', () => {
    const bien = bienDecoupe()
    const historique = creerHistorique(bien)
    const paul = bien.acquereurs[0].id
    const actions = [
      () => supprimerLigne(bien, 0),
      () => lancerDecoupage(bien),
      () => retirerParcelle(bien, 'B'),
      () => fixerPrix(bien, { total: 500000, parHectareDefaut: null, parHectare: {} }),
      () => fixerObjectif(bien, paul, { unite: 'eur', valeur: 100000 }),
    ]
    const etats = [exporter(bien)]
    for (const faire of actions) {
      action(historique, bien, faire)
      etats.push(exporter(bien))
    }

    for (let i = actions.length - 1; i >= 0; i--) {
      restaurer(historique, bien, annuler(historique))
      expect(exporter(bien)).toBe(etats[i])
    }
    for (let i = 1; i <= actions.length; i++) {
      restaurer(historique, bien, retablir(historique))
      expect(exporter(bien)).toBe(etats[i])
    }
  })

  test('annuler une désattribution rend le Lot à son Acquéreur', () => {
    const bien = bienDecoupe()
    const historique = creerHistorique(bien)
    const { tenement, signature, acquereur } = bilanScenario(bien).lots[0]
    action(historique, bien, () => reattribuer(bien, tenement, signature, null))
    expect(bilanScenario(bien).lots[0].acquereur).toBeNull()

    restaurer(historique, bien, annuler(historique))

    expect(bilanScenario(bien).lots[0].acquereur).toBe(acquereur)
  })

  test('restaurer un état ne crée pas d’étape', () => {
    const bien = bienDecoupe()
    const historique = creerHistorique(bien)
    action(historique, bien, () => choisirScenario(bien, dupliquerScenario(bien)))
    action(historique, bien, () => supprimerLigne(bien, 0))

    restaurer(historique, bien, annuler(historique))

    expect(peutRetablir(historique)).toBe(true)
    expect(historique.etats).toHaveLength(3)
  })

  test('changer de Scénario n’est pas une étape ; annuler ramène sur le Scénario de l’action annulée', () => {
    const bien = bienDecoupe()
    const premier = bien.courant
    const second = dupliquerScenario(bien)
    const historique = creerHistorique(bien)
    action(historique, bien, () => supprimerLigne(bien, 0))
    action(historique, bien, () => choisirScenario(bien, second))
    expect(historique.etats).toHaveLength(2)

    restaurer(historique, bien, annuler(historique))

    expect(bien.courant).toBe(premier)
    expect(scenarioCourant(bien).lignes).toHaveLength(bien.scenarios[1].lignes.length)
    expect(peutAnnuler(historique)).toBe(false)
  })
})
