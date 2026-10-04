<script setup lang="ts">
import { computed, ref } from 'vue'

// orientation : direction d'avancée des bandes en degrés (0 = est, 90 = nord), null = automatique
const props = defineProps<{ orientation: number | null }>()
const emit = defineEmits<{ change: [orientation: number | null] }>()
const cadran = ref<HTMLDivElement>()
// Angle suivi pendant le glissé : il n'est transmis qu'au lâcher, pour que le geste soit une seule étape à annuler
const glisse = ref<number | null>(null)
const orientation = computed(() => glisse.value ?? props.orientation)

function angleDu(e: PointerEvent): number {
  const r = cadran.value!.getBoundingClientRect()
  const degres = (Math.atan2(r.top + r.height / 2 - e.clientY, e.clientX - r.left - r.width / 2) * 180) / Math.PI
  return Math.round((degres + 360) % 360)
}

function debut(e: PointerEvent) {
  cadran.value!.setPointerCapture(e.pointerId)
  glisse.value = angleDu(e)
}

function deplacement(e: PointerEvent) {
  if (glisse.value !== null) {
    glisse.value = angleDu(e)
  }
}

function fin() {
  if (glisse.value !== null) {
    emit('change', glisse.value)
    glisse.value = null
  }
}
</script>

<template>
  <div class="boussole">
    <div
      ref="cadran"
      class="cadran"
      title="Faites tourner la flèche pour choisir le sens d'avancée des bandes"
      @pointerdown="debut"
      @pointermove="deplacement"
      @pointerup="fin"
    >
      <!-- En mode Auto, chaque Tènement suit son grand côté : aucune direction unique à montrer -->
      <svg v-if="orientation !== null" viewBox="-50 -50 100 100" :style="{ transform: `rotate(${-orientation}deg)` }">
        <line x1="-34" y1="0" x2="30" y2="0" />
        <polygon points="40,0 24,-10 24,10" />
      </svg>
    </div>
    <div class="legende">
      <template v-if="orientation === null">Auto</template>
      <template v-else>
        {{ orientation }}° <button type="button" @click="emit('change', null)">Auto</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.boussole {
  position: absolute;
  left: 10px;
  bottom: 10px;
  background: white;
  border-radius: var(--rayon);
  box-shadow: var(--ombre);
  padding: 8px;
  text-align: center;
  font-size: 12px;
}
.cadran {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid var(--bordure);
  background: var(--fond-doux);
  cursor: grab;
  touch-action: none;
}
.legende {
  margin-top: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
}
.legende button {
  height: 22px;
  padding: 0 6px;
  font-size: 12px;
}
svg {
  width: 100%;
  height: 100%;
}
line {
  stroke: var(--texte);
  stroke-width: 6;
}
polygon {
  fill: var(--texte);
}
</style>
