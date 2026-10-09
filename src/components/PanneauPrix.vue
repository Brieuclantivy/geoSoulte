<script setup lang="ts">
import { computed, reactive } from 'vue'
import { fixerPrix, type Bien } from '../moteur/bien'
import { horsCouvertureDvf, statistiquesDvf, type StatistiquesDvf } from '../moteur/dvf'
import { ventesDvf } from '../dvf'
import { euros, nombreSaisi } from '../format'
import Panneau from './Panneau.vue'

const props = defineProps<{ bien: Bien; ecartAvantRecalage: number | null }>()

type ReferenceDvf =
  | { etat: 'chargement' }
  | { etat: 'erreur' }
  | { etat: 'ok'; nom: string | null; stats: StatistiquesDvf }

// Prix de référence par commune (code INSEE) ; recalculés à chaque chargement, jamais enregistrés
const references = reactive(new Map<string, ReferenceDvf>())

// Communes du Bien : le code INSEE est en tête de l'identifiant de Parcelle
const communes = computed(() => [...new Set(props.bien.parcelles.map((p) => p.id.slice(0, 5)))])

// Communes couvertes par DVF dont les ventes ne sont ni chargées ni en cours de chargement
const aCharger = computed(() =>
  communes.value.filter((c) => !horsCouvertureDvf(c) && (!references.has(c) || references.get(c)!.etat === 'erreur')),
)

async function chargerReference(insee: string) {
  references.set(insee, { etat: 'chargement' })
  try {
    const { nom, lignes } = await ventesDvf(insee)
    references.set(insee, { etat: 'ok', nom, stats: statistiquesDvf(lignes) })
  } catch {
    references.set(insee, { etat: 'erreur' })
  }
}

function stats(insee: string): StatistiquesDvf | null {
  const r = references.get(insee)
  return r?.etat === 'ok' ? r.stats : null
}

function titre(insee: string): string {
  const r = references.get(insee)
  return r?.etat === 'ok' && r.nom ? `${r.nom} (${insee})` : `Commune ${insee}`
}

function utiliser(mediane: number) {
  fixerPrix(props.bien, { ...props.bien.prix, parHectareDefaut: Math.round(mediane) })
}

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
  <Panneau titre="Prix">
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
    <details v-if="communes.length">
      <summary>Prix de référence (DVF)</summary>
      <p class="aide">
        Ventes de terres non bâties enregistrées dans les Demandes de valeurs foncières : pas une estimation. Peu de
        ventes = peu fiable (médiane affichée à partir de 3 ventes).
      </p>
      <button v-if="aCharger.length" type="button" @click="aCharger.forEach(chargerReference)">
        Charger les ventes DVF
      </button>
      <div v-for="insee in communes" :key="insee">
        <h3>{{ titre(insee) }}</h3>
        <p v-if="horsCouvertureDvf(insee)" class="aide">
          Hors couverture DVF : les ventes de l'Alsace-Moselle et de Mayotte ne sont pas publiées.
        </p>
        <p v-else-if="references.get(insee)?.etat === 'chargement'" class="aide">Chargement des ventes…</p>
        <p v-else-if="references.get(insee)?.etat === 'erreur'" class="aide">
          Ventes DVF indisponibles pour le moment ; réessayez plus tard.
        </p>
        <template v-else-if="stats(insee)">
          <p v-if="!stats(insee)!.annees" class="aide">Aucune vente de terre non bâtie.</p>
          <template v-else>
            <p class="aide">Ventes de {{ stats(insee)!.annees![0] }} à {{ stats(insee)!.annees![1] }}, en €/ha.</p>
            <table>
              <thead>
                <tr>
                  <th>Nature</th>
                  <th class="nombre">Ventes</th>
                  <th class="nombre">Médiane</th>
                  <th class="nombre">Quartiles</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in stats(insee)!.cultures" :key="c.culture">
                  <td>{{ c.culture }}</td>
                  <td class="nombre">{{ c.ventes }}</td>
                  <template v-if="c.prix">
                    <td class="nombre">{{ euros(c.prix.mediane) }}</td>
                    <td class="nombre">{{ euros(c.prix.q1) }} – {{ euros(c.prix.q3) }}</td>
                    <td>
                      <button
                        type="button"
                        class="utiliser"
                        title="Utiliser la médiane comme prix à l'hectare par défaut"
                        @click="utiliser(c.prix.mediane)"
                      >
                        Utiliser
                      </button>
                    </td>
                  </template>
                  <td v-else colspan="3" class="aide">Données insuffisantes</td>
                </tr>
              </tbody>
            </table>
          </template>
        </template>
      </div>
    </details>
    <p v-if="ecartAvantRecalage !== null" class="aide">
      Écart entre le prix total et les prix à l'hectare : {{ euros(ecartAvantRecalage) }} — les prix à l'hectare sont
      recalés pour que la somme des Coûts fasse le prix total.
    </p>
  </Panneau>
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
h3 {
  margin: 10px 0 4px;
  font-size: 13px;
}
button.utiliser {
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
}
</style>
