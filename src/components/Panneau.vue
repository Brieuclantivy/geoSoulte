<script setup lang="ts">
// Panneau de la colonne latérale, repliable d'un clic sur son titre ; l'état replié/déplié est mémorisé d'une
// visite à l'autre, seulement s'il diffère de l'état par défaut (qui peut ainsi changer pour tous)
const props = defineProps<{ titre: string; replie?: boolean }>()

const CLE = 'geosoulte-panneaux'

function etats(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? '{}') ?? {}
  } catch {
    // Stockage indisponible ou illisible : états par défaut
    return {}
  }
}

const defaut = !props.replie
const ouvert = etats()[props.titre] ?? defaut

// Aussi appelé au montage d'un panneau ouvert, sans effet puisqu'il est alors dans son état par défaut ou mémorisé
function basculer(e: Event) {
  const nouveaux = etats()
  const open = (e.target as HTMLDetailsElement).open
  if (open === defaut) {
    delete nouveaux[props.titre]
  } else {
    nouveaux[props.titre] = open
  }

  try {
    localStorage.setItem(CLE, JSON.stringify(nouveaux))
  } catch {
    // Sans stockage, l'état n'est pas retenu
  }
}
</script>

<template>
  <section>
    <details class="panneau" :open="ouvert" @toggle="basculer">
      <summary><h2>{{ titre }}</h2></summary>
      <slot />
    </details>
  </section>
</template>

<style scoped>
.panneau {
  margin: 0;
}
.panneau > summary {
  color: inherit;
}
.panneau[open] > summary {
  margin-bottom: 10px;
}
.panneau > summary h2 {
  display: inline;
}
</style>
