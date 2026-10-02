<script setup lang="ts">
import { fixerPrix, type Bien } from '../moteur/bien'
import { euros, nombreSaisi } from '../format'

const props = defineProps<{ bien: Bien; ecartAvantRecalage: number | null }>()

function total(e: Event) {
  fixerPrix(props.bien, { ...props.bien.prix, total: nombreSaisi(e) })
}

function defaut(e: Event) {
  fixerPrix(props.bien, { ...props.bien.prix, parHectareDefaut: nombreSaisi(e) })
}

function parHectare(id: string, e: Event) {
  const parHectare = { ...props.bien.prix.parHectare }
  const valeur = nombreSaisi(e)
  if (valeur === null) {
    delete parHectare[id]
  } else {
    parHectare[id] = valeur
  }

  fixerPrix(props.bien, { ...props.bien.prix, parHectare })
}
</script>

<template>
  <section>
    <h2>Prix</h2>
    <label>
      Prix total du Bien (€)
      <input type="number" min="0" step="any" :value="bien.prix.total" @change="total" />
    </label>
    <label>
      Prix à l'hectare par défaut (€/ha)
      <input type="number" min="0" step="any" :value="bien.prix.parHectareDefaut" @change="defaut" />
    </label>
    <details v-if="bien.parcelles.length">
      <summary>Prix à l'hectare par Parcelle</summary>
      <label v-for="p in bien.parcelles" :key="p.id">
        {{ p.id }}
        <input
          type="number"
          min="0"
          step="any"
          :placeholder="bien.prix.parHectareDefaut?.toString() ?? ''"
          :value="bien.prix.parHectare[p.id]"
          @change="parHectare(p.id, $event)"
        />
      </label>
    </details>
    <p v-if="ecartAvantRecalage !== null" class="aide">
      Écart entre le prix total et les prix à l'hectare : {{ euros(ecartAvantRecalage) }} — les prix à l'hectare sont
      recalés pour que la somme des Coûts fasse le prix total.
    </p>
  </section>
</template>

<style scoped>
label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}
input {
  width: 120px;
}
</style>
