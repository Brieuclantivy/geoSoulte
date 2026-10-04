<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import Carte from "./components/Carte.vue";
import PanneauBien from "./components/PanneauBien.vue";
import PanneauFichier from "./components/PanneauFichier.vue";
import PanneauAcquereurs from "./components/PanneauAcquereurs.vue";
import PanneauPrix from "./components/PanneauPrix.vue";
import PanneauScenarios from "./components/PanneauScenarios.vue";
import Recapitulatif from "./components/Recapitulatif.vue";
import { parcelleEn, type Commune } from "./cadastre";
import {
  ajouterParcelle,
  bilanBien,
  creerBien,
  retirerParcelle,
  scenariosTouchesParAjout,
  scenariosTouchesParRetrait,
  type Bien,
  type Scenario,
} from "./moteur/bien";
import { bilanScenario, modifierLigne } from "./moteur/decoupage";
import { chargerSauvegarde, sauvegarder } from "./persistance";

const bien = reactive(chargerSauvegarde() ?? creerBien());
watch(bien, () => sauvegarder(bien), { deep: true });
const bilan = computed(() => bilanBien(bien));
// Aperçu d'une ligne de coupe en cours de déplacement (non encore appliqué au Bien)
const apercu = ref<{ index: number; points: number[][] } | null>(null);
const scenario = computed(() => {
  if (apercu.value) {
    const copie = {
      ...bien,
      scenarios: bien.scenarios.map((s) =>
        s.id === bien.courant ? { ...s } : s,
      ),
    };
    if (modifierLigne(copie, apercu.value.index, apercu.value.points)) {
      return bilanScenario(copie);
    }
  }

  return bilanScenario(bien);
});

function ligne(index: number, points: number[][], final: boolean) {
  if (final) {
    apercu.value = null;
    modifierLigne(bien, index, points);
  } else {
    apercu.value = { index, points };
  }
}
const carte = ref<InstanceType<typeof Carte>>();
const chargement = ref(false);

function centrer(commune: Commune) {
  carte.value?.centrerSur(...commune.centre);
}

function imprimer() {
  window.print();
}

function remplacer(nouveau: Bien) {
  Object.assign(bien, nouveau);
}

// Changer les Parcelles efface le Découpage du Tènement concerné dans tous les Scénarios : on ne demande
// confirmation que s'il y a un Découpage à perdre
function confirmer(question: string, touches: Scenario[]): boolean {
  if (!touches.length) {
    return true;
  }

  const noms = touches.map((s) => `« ${s.nom} »`).join(", ");
  return confirm(
    `${question} Le Découpage de son Tènement sera effacé dans : ${noms}.`,
  );
}

function retirer(id: string) {
  if (
    confirmer(
      `Retirer la Parcelle ${id} du Bien ?`,
      scenariosTouchesParRetrait(bien, id),
    )
  ) {
    retirerParcelle(bien, id);
  }
}

async function ajouter(lon: number, lat: number) {
  chargement.value = true;
  try {
    const parcelle = await parcelleEn(lon, lat);
    if (
      parcelle &&
      confirmer(
        `Ajouter la Parcelle ${parcelle.id} au Bien ?`,
        scenariosTouchesParAjout(bien, parcelle),
      )
    ) {
      ajouterParcelle(bien, parcelle);
    }
  } finally {
    chargement.value = false;
  }
}
</script>

<template>
  <div class="app">
    <aside>
      <header>
        <h1>GéoSoulte</h1>
        <button type="button" @click="imprimer">
          Imprimer le récapitulatif
        </button>
        <p class="indicatif">
          Simulation purement indicative : ni plan de géomètre, ni document
          officiel.
        </p>
      </header>
      <PanneauBien
        :bilan="bilan"
        :chargement="chargement"
        @commune="centrer"
        @retirer="retirer"
      />
      <PanneauPrix
        :bien="bien"
        :ecart-avant-recalage="scenario.ecartAvantRecalage"
      />
      <PanneauAcquereurs
        :bien="bien"
        :bilan="scenario"
        :tenements="bilan.tenements"
      />
      <PanneauScenarios :bien="bien" />
      <PanneauFichier :bien="bien" @importe="remplacer" />
    </aside>
    <main>
      <Carte
        ref="carte"
        :bien="bien"
        :bilan="bilan"
        :scenario="scenario"
        @ajouter="ajouter"
        @ligne="ligne"
        @retirer="retirer"
      />
      <Recapitulatif :bien="bien" :bilan="bilan" :scenario="scenario" />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100%;
}
aside {
  width: 460px;
  overflow-y: auto;
  padding: 0 20px;
  box-sizing: border-box;
  border-right: 1px solid var(--bordure);
}
main {
  flex: 1;
}
header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 4px 8px;
  padding: 16px 0 14px;
}
h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.indicatif {
  margin: 0;
  width: 100%;
  font-size: 12px;
  color: var(--alerte);
}
aside > section {
  padding: 16px 0;
  border-top: 1px solid var(--bordure);
}

/* Téléphone : la carte au-dessus, les panneaux en dessous */
@media (max-width: 700px) {
  .app {
    flex-direction: column-reverse;
    height: auto;
  }
  aside {
    width: 100%;
    border-right: none;
  }
  /* Les tableaux larges (bilan) défilent dans leur section plutôt que la page entière */
  aside > section {
    overflow-x: auto;
  }
  main {
    height: 60vh;
    flex: none;
  }
}

@media print {
  aside {
    display: none;
  }
  .app {
    display: block;
    height: auto;
  }
  main {
    height: 13cm;
  }
}
</style>
