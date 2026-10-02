<script setup lang="ts">
import { ref } from 'vue'

// orientation : direction d'avancée des bandes en degrés (0 = est, 90 = nord), null = automatique
const props = defineProps<{ orientation: number | null }>()
const emit = defineEmits<{ change: [orientation: number | null] }>()
const cadran = ref<HTMLDivElement>()
let glisse = false

function angleDu(e: PointerEvent): number {
  const r = cadran.value!.getBoundingClientRect()
  const degres = (Math.atan2(r.top + r.height / 2 - e.clientY, e.clientX - r.left - r.width / 2) * 180) / Math.PI
  return Math.round((degres + 360) % 360)
}

function debut(e: PointerEvent) {
  glisse = true
  cadran.value!.setPointerCapture(e.pointerId)
  emit('change', angleDu(e))
}

function deplacement(e: PointerEvent) {
  if (glisse) {
    emit('change', angleDu(e))
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
      @pointerup="glisse = false"
    >
      <svg viewBox="-50 -50 100 100" :style="{ transform: `rotate(${-(props.orientation ?? 0)}deg)` }">
        <line x1="-34" y1="0" x2="30" y2="0" />
        <polygon points="40,0 24,-10 24,10" />
      </svg>
    </div>
    <div class="legende">
      <template v-if="props.orientation === null">Auto</template>
      <template v-else>
        {{ props.orientation }}° <button type="button" @click="emit('change', null)">Auto</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.boussole {
  position: absolute;
  left: 8px;
  bottom: 8px;
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 4px;
  text-align: center;
  font-size: 12px;
}
.cadran {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid #999;
  cursor: grab;
  touch-action: none;
}
svg {
  width: 100%;
  height: 100%;
}
line {
  stroke: #222;
  stroke-width: 6;
}
polygon {
  fill: #222;
}
</style>
