<script setup lang="ts">
import { onMounted, ref } from 'vue'

// Guide pas à pas : ouvert d'office à la première visite, puis depuis le bouton Aide
const CLE = 'geosoulte-guide-vu'

const etapes = [
  {
    titre: 'Bienvenue dans GéoSoulte',
    texte: [
      'GéoSoulte simule le découpage d’un ensemble de Parcelles cadastrales entre plusieurs Acquéreurs, pour voir ce que chacun obtient et ce qu’il paie.',
      'Le parcours tient en quelques étapes : composer le Bien, indiquer le prix, ajouter les Acquéreurs, lancer le Découpage, puis l’ajuster à la main.',
    ],
  },
  {
    titre: '1. Composer le Bien',
    texte: [
      'Dans le panneau « Bien », cherchez la commune : la carte s’y centre.',
      'Zoomez jusqu’aux Parcelles, puis faites un clic droit (ou un appui long au doigt) sur chacune et choisissez « Ajouter au Bien ». Les Parcelles qui se touchent forment un Tènement.',
    ],
    astuce: 'Le plan cadastral, l’orthophoto et les cultures (RPG) s’affichent ou se masquent dans l’encart « Fonds » de la carte.',
  },
  {
    titre: '2. Indiquer le prix',
    texte: [
      'Dans le panneau « Prix », saisissez le prix total du Bien et/ou un prix à l’hectare. Un prix différent par Parcelle est possible.',
      'Sans prix, le découpage fonctionne quand même, mais aucun Coût n’est calculé.',
    ],
  },
  {
    titre: '3. Ajouter les Acquéreurs',
    texte: [
      'Dans le panneau « Acquéreurs », ajoutez chaque personne et, si vous le souhaitez, donnez-lui un Objectif, en hectares ou en euros. Sans aucun Objectif, le Bien est partagé à parts égales.',
      'L’ordre de la liste (à changer en glissant ⠿) est l’ordre des bandes ; la boussole de la carte règle leur sens.',
    ],
  },
  {
    titre: '4. Lancer le Découpage',
    texte: [
      'Cliquez sur « Lancer le Découpage automatique » : le Bien est coupé en Lots, un par couleur d’Acquéreur.',
      'Le tableau en dessous compare, pour chacun, la surface et le Coût obtenus à son Objectif.',
    ],
  },
  {
    titre: '5. Ajuster à la main',
    texte: [
      'Glissez les sommets des lignes de coupe, ou tirez le milieu d’un segment pour en ajouter un. « Tracer une ligne de coupe » ou « Tracer une zone » ajoute vos propres découpes.',
      'Clic droit (ou appui long) sur un Lot pour le donner à un autre Acquéreur, sur une ligne pour la supprimer. Au survol, la surface et la valeur s’affichent.',
    ],
    astuce: 'Une fausse manœuvre ? ↶ (Ctrl+Z) annule la dernière action, ↷ (Ctrl+Maj+Z) la rétablit.',
  },
  {
    titre: '6. Comparer et conserver',
    texte: [
      'Les Scénarios permettent d’essayer plusieurs découpages du même Bien (« Dupliquer » repart du Scénario actuel).',
      'Votre travail est sauvegardé dans ce navigateur. « Exporter » en fait un fichier à partager, « Imprimer le récapitulatif » une page à remettre.',
    ],
  },
]

const dialogue = ref<HTMLDialogElement>()
const etape = ref(0)

function ouvrir() {
  etape.value = 0
  dialogue.value?.showModal()
}

function fermer() {
  dialogue.value?.close()
}

function vu() {
  try {
    localStorage.setItem(CLE, '1')
  } catch {
    // Sans stockage, le guide se rouvrira à la prochaine visite
  }
}

onMounted(() => {
  try {
    if (localStorage.getItem(CLE)) {
      return
    }
  } catch {
    // Stockage indisponible : on montre le guide
  }

  ouvrir()
})

defineExpose({ ouvrir })
</script>

<template>
  <dialog ref="dialogue" class="guide" @close="vu">
    <h2>{{ etapes[etape].titre }}</h2>
    <p v-for="(t, i) in etapes[etape].texte" :key="i">{{ t }}</p>
    <p v-if="etapes[etape].astuce" class="aide">{{ etapes[etape].astuce }}</p>
    <div class="points">
      <button
        v-for="(e, i) in etapes"
        :key="i"
        type="button"
        :class="{ actif: i === etape }"
        :title="e.titre"
        @click="etape = i"
      ></button>
    </div>
    <div class="actions">
      <button type="button" class="passer" @click="fermer">Fermer</button>
      <button type="button" :disabled="etape === 0" @click="etape--">Précédent</button>
      <button v-if="etape < etapes.length - 1" type="button" class="principal" @click="etape++">Suivant</button>
      <button v-else type="button" class="principal" @click="fermer">C’est parti</button>
    </div>
  </dialog>
</template>

<style scoped>
.guide {
  width: min(480px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 20px 24px;
  border: none;
  border-radius: var(--rayon);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}
.guide::backdrop {
  background: rgba(0, 0, 0, 0.35);
}
.points {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin: 16px 0;
}
.points button {
  width: 10px;
  height: 10px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bordure);
}
.points button.actif {
  background: var(--accent);
}
.actions {
  display: flex;
  gap: 6px;
}
.passer {
  margin-right: auto;
}
</style>
