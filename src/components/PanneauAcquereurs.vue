<script setup lang="ts">
import { ref } from 'vue'
import {
  acquereursOrdonnes,
  ajouterAcquereur,
  fixerObjectif,
  fixerOrdre,
  fixerTolerance,
  renommerAcquereur,
  scenarioCourant,
  scenariosAvecLots,
  supprimerAcquereur,
  verrouiller,
  type Bien,
  type BilanTenement,
  type Objectif,
} from '../moteur/bien'
import { lancerDecoupage, type BilanScenario } from '../moteur/decoupage'
import { euros, hectares, nombreSaisi } from '../format'

const props = defineProps<{ bien: Bien; bilan: BilanScenario; tenements: BilanTenement[] }>()
const nouveau = ref('')

function ajouter() {
  if (nouveau.value.trim()) {
    ajouterAcquereur(props.bien, nouveau.value.trim())
    nouveau.value = ''
  }
}

function objectif(id: string, e: Event) {
  const valeur = nombreSaisi(e)
  if (valeur !== null && valeur >= 0) {
    fixerObjectif(props.bien, id, { unite: scenarioCourant(props.bien).objectifs[id]?.unite ?? 'ha', valeur })
  }
}

function unite(id: string, e: Event) {
  const unite = (e.target as HTMLSelectElement).value as Objectif['unite']
  fixerObjectif(props.bien, id, { unite, valeur: scenarioCourant(props.bien).objectifs[id]?.valeur ?? 0 })
}

function lancer() {
  if (!scenarioCourant(props.bien).ajuste || confirm('Relancer le Découpage automatique efface vos ajustements manuels des lignes et des attributions. Continuer ?')) {
    lancerDecoupage(props.bien)
  }
}

function tolerance(e: Event) {
  const valeur = nombreSaisi(e)
  if (valeur !== null && valeur >= 0) {
    fixerTolerance(props.bien, valeur / 100)
  }
}

function enUnite(valeur: number, unite: Objectif['unite']): string {
  return unite === 'ha' ? hectares(valeur * 10000) : euros(valeur)
}

// Écart à l'Objectif, signé, dans l'unité de l'Objectif
function ecart(id: string): string {
  const { objectif, ecart } = bilanDe(id)!
  if (!objectif || ecart === null) {
    return ''
  }

  return (ecart > 0 ? '+' : '') + (objectif.unite === 'ha' ? hectares(ecart) : euros(ecart))
}

function supprimer(id: string, nom: string) {
  const effaces = scenariosAvecLots(props.bien, id).map((s) => `« ${s.nom} »`)
  const consequence = effaces.length ? ` Le Découpage sera effacé dans : ${effaces.join(', ')}.` : ''
  if (confirm(`Supprimer ${nom} ?${consequence}`)) {
    supprimerAcquereur(props.bien, id)
  }
}

// Glisser-déposer des lignes pour fixer l'ordre des Acquéreurs dans les bandes
let glisse: string | null = null

function saisir(id: string) {
  glisse = id
}

function deposer(cible: string) {
  if (!glisse || glisse === cible) {
    return
  }

  const ordre = acquereursOrdonnes(props.bien).map((a) => a.id).filter((id) => id !== glisse)
  ordre.splice(ordre.indexOf(cible), 0, glisse)
  fixerOrdre(props.bien, ordre)
}

const bilanDe = (id: string) => props.bilan.acquereurs.find((a) => a.id === id)
const acquereur = (id: string | null) => props.bien.acquereurs.find((a) => a.id === id)
</script>

<template>
  <section>
    <h2>Acquéreurs</h2>
    <table v-if="bien.acquereurs.length">
      <thead>
        <tr><th></th><th>Nom</th><th colspan="2">Objectif</th><th></th></tr>
      </thead>
      <tbody>
        <tr
          v-for="a in acquereursOrdonnes(bien)"
          :key="a.id"
          @dragover.prevent
          @drop="deposer(a.id)"
        >
          <td class="poignee" title="Glisser pour changer l'ordre des bandes" draggable="true" @dragstart="saisir(a.id)">
            ⠿ <span class="pastille" :style="{ background: a.couleur }"></span>
          </td>
          <td><input :value="a.nom" @change="renommerAcquereur(bien, a.id, ($event.target as HTMLInputElement).value)" /></td>
          <td>
            <input
              type="number"
              min="0"
              step="any"
              class="nombre"
              :value="scenarioCourant(bien).objectifs[a.id]?.valeur"
              @change="objectif(a.id, $event)"
            />
          </td>
          <td>
            <select :value="scenarioCourant(bien).objectifs[a.id]?.unite ?? 'ha'" @change="unite(a.id, $event)">
              <option value="ha">ha</option>
              <option value="eur">€</option>
            </select>
          </td>
          <td><button type="button" class="icone" title="Supprimer" @click="supprimer(a.id, a.nom)">✕</button></td>
        </tr>
      </tbody>
    </table>
    <form class="saisie" @submit.prevent="ajouter">
      <input v-model="nouveau" placeholder="Nom de l'Acquéreur" />
      <button>Ajouter</button>
    </form>

    <details v-if="tenements.length">
      <summary>Réglages du Découpage</summary>
      <label class="reglage">
        Tolérance pour attribuer un Tènement entier (%)
        <input type="number" min="0" step="any" :value="scenarioCourant(bien).tolerance * 100" @change="tolerance" />
      </label>
      <label v-for="(t, i) in tenements" :key="t.cle" class="reglage">
        Tènement {{ i + 1 }} ({{ hectares(t.contenance) }})
        <select
          :value="scenarioCourant(bien).verrouillages[t.cle] ?? ''"
          @change="verrouiller(bien, t.cle, ($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">Automatique</option>
          <option v-for="a in bien.acquereurs" :key="a.id" :value="a.id">🔒 {{ a.nom }}</option>
        </select>
      </label>
    </details>
    <p>
      <button type="button" class="principal" :disabled="!bien.parcelles.length || !bien.acquereurs.length" @click="lancer">
        Lancer le Découpage automatique
      </button>
    </p>

    <table v-if="scenarioCourant(bien).decoupe" class="bilan">
      <thead>
        <tr><th>Acquéreur</th><th class="nombre">Surface cadastrale</th><th class="nombre">Surface mesurée</th><th class="nombre">Coût</th><th class="nombre">Objectif</th><th class="nombre">Écart</th></tr>
      </thead>
      <tbody>
        <tr v-for="a in acquereursOrdonnes(bien)" :key="a.id">
          <td><span class="pastille" :style="{ background: a.couleur }"></span> {{ a.nom }}</td>
          <td class="nombre">{{ hectares(bilanDe(a.id)!.surfaceCadastrale) }}</td>
          <td class="nombre">{{ hectares(bilanDe(a.id)!.surfaceMesuree) }}</td>
          <td class="nombre">{{ bilanDe(a.id)!.cout === null ? '—' : euros(bilanDe(a.id)!.cout!) }}</td>
          <td class="nombre">
            <template v-if="bilanDe(a.id)!.objectif">
              {{ enUnite(bilanDe(a.id)!.objectif!.valeur, bilanDe(a.id)!.objectif!.unite) }}
            </template>
          </td>
          <td class="nombre">{{ ecart(a.id) }}</td>
        </tr>
      </tbody>
    </table>
    <details v-if="scenarioCourant(bien).decoupe">
      <summary>Bilan par Lot ({{ bilan.lots.length }})</summary>
      <table>
        <thead>
          <tr><th>Acquéreur</th><th class="nombre">Surface mesurée</th><th class="nombre">Surface cadastrale</th><th class="nombre">Coût</th></tr>
        </thead>
        <tbody>
          <tr v-for="l in bilan.lots" :key="l.tenement + l.signature">
            <td>
              <template v-if="acquereur(l.acquereur)">
                <span class="pastille" :style="{ background: acquereur(l.acquereur)!.couleur }"></span>
                {{ acquereur(l.acquereur)!.nom }}
              </template>
              <template v-else>Non attribué</template>
            </td>
            <td class="nombre">{{ hectares(l.surfaceMesuree) }}</td>
            <td class="nombre">{{ hectares(l.surfaceCadastrale) }}</td>
            <td class="nombre">{{ l.cout === null ? '—' : euros(l.cout) }}</td>
          </tr>
        </tbody>
      </table>
    </details>
    <p v-if="scenarioCourant(bien).lignes.length" class="aide">
      Ajustez les lignes de coupe sur la carte : glissez un sommet, tirez le milieu d'un segment pour ajouter un
      sommet, Alt+clic pour en supprimer un. Cliquez sur un Lot pour le réattribuer, sur une ligne pour la supprimer.
      Une ligne dont une extrémité est dans le Bien reste un brouillon (orange) qui ne coupe rien, tant que vous
      ne l'avez pas prolongée au-dehors ou fermée (cliquez dessus pour relier ses extrémités).
    </p>
    <ul v-if="bilan.avertissements.length" class="avertissements">
      <li v-for="(a, i) in bilan.avertissements" :key="i">{{ a }}</li>
    </ul>
  </section>
</template>

<style scoped>
td input {
  width: 100%;
}
td input[type='number'] {
  width: 90px;
}
td select {
  padding: 0 4px;
}
.poignee {
  cursor: grab;
  white-space: nowrap;
  color: var(--discret);
}
.saisie {
  margin-top: 8px;
}
.bilan {
  margin-top: 12px;
}
.reglage {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}
.reglage input {
  width: 80px;
}
.avertissements {
  margin: 8px 0 0;
  padding: 8px 10px 8px 26px;
  color: var(--alerte);
  font-size: 13px;
  background: #fff8e6;
  border-radius: var(--rayon);
}
</style>
