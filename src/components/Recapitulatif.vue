<script setup lang="ts">
import { computed } from "vue";
import {
  acquereursOrdonnes,
  scenarioCourant,
  type Bien,
  type BilanBien,
} from "../moteur/bien";
import type { BilanScenario } from "../moteur/decoupage";
import { euros, hectares } from "../format";

const props = defineProps<{
  bien: Bien;
  bilan: BilanBien;
  scenario: BilanScenario;
}>();

const lignes = computed(() =>
  acquereursOrdonnes(props.bien).map((a) => {
    const b = props.scenario.acquereurs.find((x) => x.id === a.id)!;
    let ecart = "";
    if (b.objectif && b.ecart !== null) {
      ecart = b.objectif.unite === "ha" ? hectares(b.ecart) : euros(b.ecart);
    }

    return {
      ...a,
      ...b,
      ecart,
      nbLots: props.scenario.lots.filter((l) => l.acquereur === a.id).length,
    };
  }),
);
const totalCout = computed(() =>
  props.scenario.acquereurs.some((a) => a.cout !== null)
    ? props.scenario.acquereurs.reduce((t, a) => t + (a.cout ?? 0), 0)
    : null,
);
</script>

<template>
  <section class="recap">
    <h1>GéoSoulte — {{ scenarioCourant(bien).nom }}</h1>
    <p class="indicatif">
      Simulation purement indicative : ni plan de géomètre, ni document
      officiel.
    </p>
    <p>
      Bien de {{ bilan.parcelles.length }} Parcelle(s),
      {{ bilan.tenements.length }} Tènement(s) — Contenance
      {{ hectares(bilan.contenance) }}, Surface mesurée
      {{ hectares(bilan.surfaceMesuree) }}.
    </p>
    <table>
      <thead>
        <tr>
          <th>Acquéreur</th>
          <th>Lots</th>
          <th>Surface cadastrale</th>
          <th>Surface mesurée</th>
          <th>Coût</th>
          <th>Écart à l'Objectif</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in lignes" :key="l.id">
          <td>
            <span class="pastille" :style="{ background: l.couleur }"></span>
            {{ l.nom }}
          </td>
          <td>{{ l.nbLots }}</td>
          <td>{{ hectares(l.surfaceCadastrale) }}</td>
          <td>{{ hectares(l.surfaceMesuree) }}</td>
          <td>{{ l.cout === null ? "—" : euros(l.cout) }}</td>
          <td>{{ l.ecart }}</td>
        </tr>
      </tbody>
      <tfoot v-if="totalCout !== null">
        <tr>
          <td colspan="4">Total</td>
          <td>{{ euros(totalCout) }}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <ul v-if="scenario.avertissements.length">
      <li v-for="(a, i) in scenario.avertissements" :key="i">{{ a }}</li>
    </ul>
  </section>
</template>

<style scoped>
.recap {
  display: none;
  padding: 0 4mm;
}
h1 {
  font-size: 18pt;
}
.indicatif {
  font-style: italic;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  border: 1px solid #999;
  padding: 2px 6px;
  text-align: right;
}
th:first-child,
td:first-child {
  text-align: left;
}
.pastille {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
@media print {
  .recap {
    display: block;
  }
}
</style>
