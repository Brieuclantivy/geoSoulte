<script setup lang="ts">
import {
  choisirScenario,
  creerScenario,
  dupliquerScenario,
  renommerScenario,
  scenarioCourant,
  supprimerScenario,
  type Bien,
} from '../moteur/bien'
import Panneau from './Panneau.vue'

const props = defineProps<{ bien: Bien }>()

function nouveau() {
  choisirScenario(props.bien, creerScenario(props.bien, `Scénario ${props.bien.scenarios.length + 1}`))
}

function dupliquer() {
  choisirScenario(props.bien, dupliquerScenario(props.bien))
}

function supprimer() {
  const scenario = scenarioCourant(props.bien)
  if (confirm(`Supprimer le Scénario « ${scenario.nom} » ?`)) {
    supprimerScenario(props.bien, scenario.id)
  }
}
</script>

<template>
  <Panneau titre="Scénario" replie>
    <div class="ligne">
      <select :value="bien.courant" @change="choisirScenario(bien, ($event.target as HTMLSelectElement).value)">
        <option v-for="s in bien.scenarios" :key="s.id" :value="s.id">{{ s.nom }}</option>
      </select>
      <input
        :value="scenarioCourant(bien).nom"
        title="Nom du Scénario"
        @change="renommerScenario(bien, bien.courant, ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="ligne">
      <button type="button" @click="nouveau">Nouveau</button>
      <button type="button" @click="dupliquer">Dupliquer</button>
      <button type="button" :disabled="bien.scenarios.length <= 1" @click="supprimer">Supprimer</button>
    </div>
  </Panneau>
</template>

<style scoped>
.ligne {
  display: flex;
  gap: 6px;
  margin: 6px 0;
}
.ligne select,
.ligne input {
  flex: 1;
  min-width: 0;
}
</style>
