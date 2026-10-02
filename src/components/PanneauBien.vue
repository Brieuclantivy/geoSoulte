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
    <form @submit.prevent="chercher">
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
        <tr><th>Parcelle</th><th>Tènement</th><th>Contenance</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="p in bilan.parcelles" :key="p.id">
          <td>{{ p.id }}</td>
          <td>{{ p.tenement + 1 }}</td>
          <td class="nombre">{{ hectares(p.contenance) }}</td>
          <td><button type="button" title="Retirer" @click="emit('retirer', p.id)">✕</button></td>
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
  padding: 0;
}
.communes button {
  background: none;
  border: none;
  color: #0645ad;
  cursor: pointer;
  padding: 2px 0;
}
.aide {
  color: #666;
  font-size: 14px;
}
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
.nombre {
  text-align: right;
}
dl {
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 12px;
  font-size: 14px;
}
dd {
  margin: 0;
  text-align: right;
}
</style>
