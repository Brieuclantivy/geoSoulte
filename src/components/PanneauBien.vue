<script setup lang="ts">
import { ref } from 'vue'
import { rechercherCommunes, type Commune } from '../cadastre'
import type { BilanBien } from '../moteur/bien'
import { hectares } from '../format'

defineProps<{ bilan: BilanBien; chargement: boolean }>()
const emit = defineEmits<{ commune: [commune: Commune]; retirer: [id: string] }>()

const recherche = ref('')
const communes = ref<Commune[]>([])

async function chercher() {
  communes.value = recherche.value.trim() ? await rechercherCommunes(recherche.value.trim()) : []
}

function choisir(commune: Commune) {
  communes.value = []
  recherche.value = commune.nom
  emit('commune', commune)
}
</script>

<template>
  <section>
    <h2>Bien</h2>
    <form class="saisie" @submit.prevent="chercher">
      <input v-model="recherche" placeholder="Rechercher une commune" />
      <button>Chercher</button>
    </form>
    <ul v-if="communes.length" class="communes">
      <li v-for="c in communes" :key="c.code">
        <button type="button" @click="choisir(c)">{{ c.nom }} ({{ c.departement }})</button>
      </li>
    </ul>

    <p v-if="!bilan.parcelles.length" class="aide">Cliquez sur une Parcelle de la carte pour l'ajouter au Bien.</p>
    <p v-if="chargement" class="aide">Chargement de la Parcelle…</p>

    <table v-if="bilan.parcelles.length">
      <thead>
        <tr><th>Parcelle</th><th>Tènement</th><th class="nombre">Contenance</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="p in bilan.parcelles" :key="p.id">
          <td>{{ p.id }}</td>
          <td>{{ p.tenement + 1 }}</td>
          <td class="nombre">{{ hectares(p.contenance) }}</td>
          <td class="nombre"><button type="button" class="icone" title="Retirer" @click="emit('retirer', p.id)">✕</button></td>
        </tr>
      </tbody>
    </table>

    <dl v-if="bilan.parcelles.length">
      <dt>Tènements</dt>
      <dd>{{ bilan.tenements.length }}</dd>
      <dt>Contenance</dt>
      <dd>{{ hectares(bilan.contenance) }}</dd>
      <dt>Surface mesurée</dt>
      <dd>{{ hectares(bilan.surfaceMesuree) }}</dd>
      <dt>Écart</dt>
      <dd>{{ hectares(bilan.ecart) }}</dd>
    </dl>
  </section>
</template>

<style scoped>
.communes {
  list-style: none;
  margin: 6px 0 0;
  padding: 4px;
  border: 1px solid var(--bordure);
  border-radius: var(--rayon);
}
.communes button {
  width: 100%;
  height: auto;
  padding: 4px 6px;
  border: none;
  background: none;
}
.communes button:hover {
  background: var(--fond-doux);
}
table {
  margin-top: 12px;
}
dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  margin: 12px 0 0;
  padding: 8px 10px;
  background: var(--fond-doux);
  border-radius: var(--rayon);
}
dt {
  color: var(--discret);
}
dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
