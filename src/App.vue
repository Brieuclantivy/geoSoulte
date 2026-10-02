<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Carte from './components/Carte.vue'
import PanneauBien from './components/PanneauBien.vue'
import { parcelleEn, type Commune } from './cadastre'
import { ajouterParcelle, bilanBien, creerBien, retirerParcelle } from './moteur/bien'

const bien = reactive(creerBien())
const bilan = computed(() => bilanBien(bien))
const carte = ref<InstanceType<typeof Carte>>()
const chargement = ref(false)

function centrer(commune: Commune) {
  carte.value?.centrerSur(...commune.centre)
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
    </aside>
    <main>
      <Carte ref="carte" :bien="bien" :bilan="bilan" @clic="clic" />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100%;
}
aside {
  width: 360px;
  overflow-y: auto;
  padding: 8px 12px;
  box-sizing: border-box;
  border-right: 1px solid #ccc;
}
main {
  flex: 1;
}
</style>
