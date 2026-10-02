<script setup lang="ts">
import { ref } from 'vue'
import {
  ajouterAcquereur,
  fixerObjectif,
  fixerTolerance,
  renommerAcquereur,
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
    fixerObjectif(props.bien, id, { unite: props.bien.scenario.objectifs[id]?.unite ?? 'ha', valeur })
  }
}

function unite(id: string, e: Event) {
  const unite = (e.target as HTMLSelectElement).value as Objectif['unite']
  fixerObjectif(props.bien, id, { unite, valeur: props.bien.scenario.objectifs[id]?.valeur ?? 0 })
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

function supprimer(id: string, nom: string) {
  if (confirm(`Supprimer ${nom} ? Le Découpage sera effacé.`)) {
    supprimerAcquereur(props.bien, id)
  }
}

const bilanDe = (id: string) => props.bilan.acquereurs.find((a) => a.id === id)
</script>

<template>
  <section>
    <h2>Acquéreurs</h2>
    <table v-if="bien.acquereurs.length">
      <thead>
        <tr><th></th><th>Nom</th><th colspan="2">Objectif</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="a in bien.acquereurs" :key="a.id">
          <td><span class="pastille" :style="{ background: a.couleur }"></span></td>
          <td><input :value="a.nom" @change="renommerAcquereur(bien, a.id, ($event.target as HTMLInputElement).value)" /></td>
          <td>
            <input
              type="number"
              min="0"
              step="any"
              class="nombre"
              :value="bien.scenario.objectifs[a.id]?.valeur"
              @change="objectif(a.id, $event)"
            />
          </td>
          <td>
            <select :value="bien.scenario.objectifs[a.id]?.unite ?? 'ha'" @change="unite(a.id, $event)">
              <option value="ha">ha</option>
              <option value="eur">€</option>
            </select>
          </td>
          <td><button type="button" title="Supprimer" @click="supprimer(a.id, a.nom)">✕</button></td>
        </tr>
      </tbody>
    </table>
    <form @submit.prevent="ajouter">
      <input v-model="nouveau" placeholder="Nom de l'Acquéreur" />
      <button>Ajouter</button>
    </form>

    <details v-if="tenements.length">
      <summary>Réglages du Découpage</summary>
      <label class="reglage">
        Tolérance pour attribuer un Tènement entier (%)
        <input type="number" min="0" step="any" :value="bien.scenario.tolerance * 100" @change="tolerance" />
      </label>
      <label v-for="(t, i) in tenements" :key="t.cle" class="reglage">
        Tènement {{ i + 1 }} ({{ hectares(t.contenance) }})
        <select
          :value="bien.scenario.verrouillages[t.cle] ?? ''"
          @change="verrouiller(bien, t.cle, ($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">Automatique</option>
          <option v-for="a in bien.acquereurs" :key="a.id" :value="a.id">🔒 {{ a.nom }}</option>
        </select>
      </label>
    </details>
    <p>
      <button type="button" :disabled="!bien.parcelles.length || !bien.acquereurs.length" @click="lancerDecoupage(bien)">
        Lancer le Découpage automatique
      </button>
    </p>

    <table v-if="bilan.lots.some((l) => l.acquereur)" class="bilan">
      <thead>
        <tr><th>Acquéreur</th><th>Surface cadastrale</th><th>Surface mesurée</th><th>Coût</th><th>Objectif</th></tr>
      </thead>
      <tbody>
        <tr v-for="a in bien.acquereurs" :key="a.id">
          <td><span class="pastille" :style="{ background: a.couleur }"></span> {{ a.nom }}</td>
          <td class="nombre">{{ hectares(bilanDe(a.id)!.surfaceCadastrale) }}</td>
          <td class="nombre">{{ hectares(bilanDe(a.id)!.surfaceMesuree) }}</td>
          <td class="nombre">{{ bilanDe(a.id)!.cout === null ? '—' : euros(bilanDe(a.id)!.cout!) }}</td>
          <td class="nombre">
            <template v-if="bilanDe(a.id)!.objectif">
              {{ enUnite(bilanDe(a.id)!.objectif!.valeur, bilanDe(a.id)!.objectif!.unite) }}
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <ul v-if="bilan.avertissements.length" class="avertissements">
      <li v-for="(a, i) in bilan.avertissements" :key="i">{{ a }}</li>
    </ul>
  </section>
</template>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  text-align: left;
  padding: 2px 4px;
}
td input {
  width: 100%;
  box-sizing: border-box;
}
.nombre {
  text-align: right;
}
.pastille {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  vertical-align: middle;
}
.bilan {
  margin-top: 8px;
}
.reglage {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  margin: 4px 0;
}
.reglage input {
  width: 80px;
  text-align: right;
}
.avertissements {
  color: #a15c00;
  font-size: 13px;
  padding-left: 18px;
}
</style>
