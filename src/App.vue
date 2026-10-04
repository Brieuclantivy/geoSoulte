<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import Carte from "./components/Carte.vue";
import PanneauBien from "./components/PanneauBien.vue";
import PanneauFichier from "./components/PanneauFichier.vue";
import PanneauAcquereurs from "./components/PanneauAcquereurs.vue";
import PanneauPrix from "./components/PanneauPrix.vue";
import PanneauScenarios from "./components/PanneauScenarios.vue";
import Recapitulatif from "./components/Recapitulatif.vue";
import Guide from "./components/Guide.vue";
import { parcelleEn, type Commune } from "./cadastre";
import { hectares } from "./format";
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
import { bilanScenario, modifierLignes, type ModificationLigne } from "./moteur/decoupage";
import { empriseVoies, type Troncon } from "./moteur/acces";
import {
  annuler,
  creerHistorique,
  enregistrer,
  peutAnnuler,
  peutRetablir,
  retablir,
} from "./moteur/historique";
import { chargerSauvegarde, sauvegarder } from "./persistance";
import { tronconsDans } from "./voies";

const bien = reactive(chargerSauvegarde() ?? creerBien());
const historique = reactive(creerHistorique(bien));
// Vue regroupe les changements d'un même tick : une action, même faite de plusieurs modifications, est une étape
watch(
  bien,
  () => {
    sauvegarder(bien);
    enregistrer(historique, bien);
  },
  { deep: true },
);
const bilan = computed(() => bilanBien(bien));

// Tronçons de route autour du Bien, pour signaler les Lots enclavés (null tant qu'ils ne sont pas chargés, ou si
// le chargement a échoué) ; rechargés seulement quand le Bien sort de l'emprise déjà chargée
type Emprise = [number, number, number, number];
const voies = shallowRef<Troncon[] | null>(null);
let voiesChargees: { emprise: Emprise; troncons: Troncon[] } | null = null;
let requeteVoies = 0;
const contient = (a: Emprise, b: Emprise) =>
  a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];
watch(
  () => empriseVoies(bien.parcelles),
  async (emprise) => {
    const numero = ++requeteVoies;
    if (emprise && voiesChargees && contient(voiesChargees.emprise, emprise)) {
      voies.value = voiesChargees.troncons;
      return;
    }

    voies.value = null;
    if (!emprise) {
      return;
    }

    try {
      const troncons = await tronconsDans(emprise);
      // Une requête plus récente a pu être lancée entre-temps
      if (numero === requeteVoies) {
        voiesChargees = { emprise, troncons };
        voies.value = troncons;
      }
    } catch (err) {
      // L'accès reste « non vérifié » dans le bilan
      console.warn(err);
    }
  },
  { immediate: true },
);

// Aperçu des lignes de coupe en cours de déplacement (non encore appliqué au Bien)
const apercu = ref<ModificationLigne[] | null>(null);
const scenario = computed(() => {
  if (apercu.value) {
    const copie = {
      ...bien,
      scenarios: bien.scenarios.map((s) =>
        s.id === bien.courant ? { ...s } : s,
      ),
    };
    if (modifierLignes(copie, apercu.value)) {
      return bilanScenario(copie, voies.value);
    }
  }

  return bilanScenario(bien, voies.value);
});

function lignes(modifications: ModificationLigne[], final: boolean) {
  if (final) {
    apercu.value = null;
    modifierLignes(bien, modifications);
  } else {
    apercu.value = modifications;
  }
}
const carte = ref<InstanceType<typeof Carte>>();
const guide = ref<InstanceType<typeof Guide>>();
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

// L'état restauré remplace le Bien comme un import ; l'historique le reconnaît comme son état courant, sans
// créer d'étape
function restaurer(etat: Bien | null) {
  if (etat) {
    remplacer(etat);
  }
}

// Ctrl+Z (Cmd+Z sur Mac) annule, Ctrl+Maj+Z ou Ctrl+Y rétablit. Dans un champ de texte, l'annulation native du
// navigateur s'applique
function raccourci(e: KeyboardEvent) {
  if (
    !(e.ctrlKey || e.metaKey) ||
    (e.target as Element).closest(
      "textarea, [contenteditable], input:not([type=checkbox], [type=radio], [type=file])",
    )
  ) {
    return;
  }

  const touche = e.key.toLowerCase();
  if (touche === "z" && !e.shiftKey) {
    e.preventDefault();
    restaurer(annuler(historique));
  } else if (touche === "z" || touche === "y") {
    e.preventDefault();
    restaurer(retablir(historique));
  }
}
onMounted(() => window.addEventListener("keydown", raccourci));
onUnmounted(() => window.removeEventListener("keydown", raccourci));

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
        `Ajouter la Parcelle ${parcelle.id} (${hectares(parcelle.contenance)}) au Bien ?`,
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
        <div class="actions">
          <button type="button" @click="guide?.ouvrir()">? Aide</button>
          <button type="button" @click="imprimer">
            Imprimer le récapitulatif
          </button>
        </div>
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
        :voies="voies"
        :peut-annuler="peutAnnuler(historique)"
        :peut-retablir="peutRetablir(historique)"
        @ajouter="ajouter"
        @annuler="restaurer(annuler(historique))"
        @lignes="lignes"
        @retablir="restaurer(retablir(historique))"
        @retirer="retirer"
      />
      <Recapitulatif :bien="bien" :bilan="bilan" :scenario="scenario" />
    </main>
    <Guide ref="guide" />
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
.actions {
  display: flex;
  gap: 6px;
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
