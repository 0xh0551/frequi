<script setup lang="ts">
const botStore = useBotStore();

/**
 * The mark's single gold dot breathes only while the selected bot is reachable
 * *and* actually trading. Motion here reports state - it is not decoration, so
 * an idle or unreachable bot leaves the dot dark and still.
 */
const isLive = computed(
  () =>
    botStore.activeBot?.isBotOnline === true && botStore.activeBot?.botState?.state === 'running',
);
</script>

<template>
  <svg
    viewBox="132 234 732 533"
    role="img"
    :aria-label="isLive ? 'noches Trading Bots - trading' : 'noches Trading Bots - idle'"
    class="text-neutral-900 dark:text-neutral-50"
  >
    <!-- Dot-matrix mark: scattered signal locking into an ordered grid. -->
    <g fill="currentColor">
      <!-- Inner columns carry the mark; they read at full ink weight. -->
      <circle cx="396.39" cy="300.75" r="43.6" />
      <circle cx="396.39" cy="505.12" r="43.6" />
      <circle cx="396.39" cy="707.9" r="43.6" />
      <circle cx="605.1" cy="300.75" r="43.6" />
      <circle cx="605.1" cy="505.12" r="43.6" />
      <circle cx="605.1" cy="707.9" r="43.6" />
      <!-- Outer columns sit back, so the grid has depth rather than flatness. -->
      <g opacity="0.42">
        <circle cx="192.15" cy="505.12" r="43.6" />
        <circle cx="192.15" cy="701.64" r="43.6" />
        <circle cx="804.96" cy="293.92" r="43.6" />
        <circle cx="804.96" cy="498.28" r="43.6" />
        <circle cx="804.96" cy="701.06" r="43.6" />
      </g>
    </g>
    <circle
      cx="192.15"
      cy="300.75"
      r="43.6"
      class="noches-status-dot"
      :class="isLive ? 'is-live fill-brand-500 dark:fill-brand-400' : 'fill-current opacity-40'"
    />
  </svg>
</template>

<style scoped>
.noches-status-dot {
  transform-box: fill-box;
  transform-origin: center;
  transition:
    fill 300ms ease-out,
    opacity 300ms ease-out;
}

.is-live {
  animation: noches-breathe 2400ms cubic-bezier(0.33, 1, 0.68, 1) infinite;
}

/* Slow enough to read as a heartbeat rather than a strobe. */
@keyframes noches-breathe {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.78);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-live {
    animation: none;
  }
}
</style>
