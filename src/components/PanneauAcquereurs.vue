<script setup lang="ts">
import { ref } from 'vue'
import { ajouterAcquereur, fixerObjectif, renommerAcquereur, supprimerAcquereur, type Bien } from '../moteur/bien'
import { lancerDecoupage, type BilanScenario } from '../moteur/decoupage'
import { hectares } from '../format'

const props = defineProps<{ bien: Bien; bilan: BilanScenario }>()
const nouveau = ref('')

function ajouter() {
  if (nouveau.value.trim()) {
    ajouterAcquereur(props.bien, nouveau.value.trim())
    nouveau.value = ''
  }
}

function objectif(id: string, e: Event) {
  const valeur = (e.target as HTMLInputElement).valueAsNumber
  if (!Number.isNaN(valeur) && valeur >= 0) {
    fixerObjectif(props.bien, id, { unite: 'ha', valeur })
  }
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
        <tr><th></th><th>Nom</th><th>Objectif (ha)</th><th></th></tr>
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
          <td><button type="button" title="Supprimer" @click="supprimer(a.id, a.nom)">✕</button></td>
        </tr>
      </tbody>
    </table>
    <form @submit.prevent="ajouter">
      <input v-model="nouveau" placeholder="Nom de l'Acquéreur" />
      <button>Ajouter</button>
    </form>

    <p>
      <button type="button" :disabled="!bien.parcelles.length || !bien.acquereurs.length" @click="lancerDecoupage(bien)">
        Lancer le Découpage automatique
      </button>
    </p>

    <table v-if="bilan.lots.some((l) => l.acquereur)" class="bilan">
      <thead>
        <tr><th>Acquéreur</th><th>Surface cadastrale / Objectif</th><th>Surface mesurée</th></tr>
      </thead>
      <tbody>
        <tr v-for="a in bien.acquereurs" :key="a.id">
          <td><span class="pastille" :style="{ background: a.couleur }"></span> {{ a.nom }}</td>
          <td class="nombre">
            {{ hectares(bilanDe(a.id)!.surfaceCadastrale) }}
            <template v-if="bilanDe(a.id)!.objectif !== null"> / {{ hectares(bilanDe(a.id)!.objectif!) }}</template>
          </td>
          <td class="nombre">{{ hectares(bilanDe(a.id)!.surfaceMesuree) }}</td>
        </tr>
      </tbody>
    </table>
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
</style>
