<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Carte from './components/Carte.vue'
import PanneauBien from './components/PanneauBien.vue'
import PanneauFichier from './components/PanneauFichier.vue'
import PanneauAcquereurs from './components/PanneauAcquereurs.vue'
import PanneauPrix from './components/PanneauPrix.vue'
import { parcelleEn, type Commune } from './cadastre'
import { ajouterParcelle, bilanBien, creerBien, retirerParcelle, type Bien } from './moteur/bien'
import { bilanScenario, modifierLigne } from './moteur/decoupage'
import { chargerSauvegarde, sauvegarder } from './persistance'

const bien = reactive(chargerSauvegarde() ?? creerBien())
watch(bien, () => sauvegarder(bien), { deep: true })
const bilan = computed(() => bilanBien(bien))
// Aperçu d'une ligne de coupe en cours de déplacement (non encore appliqué au Bien)
const apercu = ref<{ index: number; points: number[][] } | null>(null)
const scenario = computed(() => {
  if (apercu.value) {
    const copie = { ...bien, scenario: { ...bien.scenario } }
    if (modifierLigne(copie, apercu.value.index, apercu.value.points)) {
      return bilanScenario(copie)
    }
  }

  return bilanScenario(bien)
})

function ligne(index: number, points: number[][], final: boolean) {
  if (final) {
    apercu.value = null
    modifierLigne(bien, index, points)
  } else {
    apercu.value = { index, points }
  }
}
const carte = ref<InstanceType<typeof Carte>>()
const chargement = ref(false)

function centrer(commune: Commune) {
  carte.value?.centrerSur(...commune.centre)
}

function remplacer(nouveau: Bien) {
  Object.assign(bien, nouveau)
}

async function clic(lon: number, lat: number, idParcelle: string | null) {
  if (idParcelle) {
    retirerParcelle(bien, idParcelle)
    return
  }

  chargement.value = true
  try {
    const parcelle = await parcelleEn(lon, lat)
    if (parcelle) {
      ajouterParcelle(bien, parcelle)
    }
  } finally {
    chargement.value = false
  }
}
</script>

<template>
  <div class="app">
    <aside>
      <PanneauBien :bilan="bilan" :chargement="chargement" @commune="centrer" @retirer="(id) => retirerParcelle(bien, id)" />
      <PanneauPrix :bien="bien" :ecart-avant-recalage="scenario.ecartAvantRecalage" />
      <PanneauAcquereurs :bien="bien" :bilan="scenario" :tenements="bilan.tenements" />
      <PanneauFichier :bien="bien" @importe="remplacer" />
    </aside>
    <main>
      <Carte ref="carte" :bien="bien" :bilan="bilan" :scenario="scenario" @clic="clic" @ligne="ligne" />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100%;
}
aside {
  width: 440px;
  overflow-y: auto;
  padding: 8px 12px;
  box-sizing: border-box;
  border-right: 1px solid #ccc;
}
main {
  flex: 1;
}
</style>
