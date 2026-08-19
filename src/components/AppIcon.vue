<script setup lang="ts">
const botStore = useBotStore();

/**
 * Both eyes are always lit - the bot is never asleep. The right one winks only
 * while the selected bot is reachable *and* actually trading, so the motion
 * reports state rather than decorating: an idle or unreachable bot simply
 * holds both eyes open and still.
 */
const isLive = computed(
  () =>
    botStore.activeBot?.isBotOnline === true && botStore.activeBot?.botState?.state === 'running',
);
</script>

<template>
  <svg
    viewBox="130 230 740 540"
    role="img"
    :aria-label="isLive ? 'noches Trading Bots - trading' : 'noches Trading Bots - idle'"
    class="noches-mark [--noches-accent:#FFAE85] [--noches-body:#1B3A8F] dark:[--noches-accent:#FFC9A8] dark:[--noches-body:#3A62D8]"
  >
    <g fill="currentColor">
      <!-- Outer columns sit back, so the grid has depth rather than flatness. -->
      <g opacity="0.42">
        <circle cx="192.15" cy="300.75" r="43.6" />
        <circle cx="192.15" cy="505.12" r="43.6" />
        <circle cx="192.15" cy="701.64" r="43.6" />
        <circle cx="804.96" cy="293.92" r="43.6" />
        <circle cx="804.96" cy="498.28" r="43.6" />
        <circle cx="804.96" cy="701.06" r="43.6" />
      </g>
      <rect x="352.79" y="257.15" width="295.92" height="291.57" rx="74" />
      <!-- The two inner dots of the bottom row stay, and read as shoulders. -->
      <circle cx="396.39" cy="707.9" r="43.6" />
      <circle cx="605.1" cy="707.9" r="43.6" />
    </g>

    <!-- Face: painted on the head rather than cut out of it, so no hairline of
         the page background shows along the edges at small sizes. -->
    <g class="noches-face">
      <circle cx="447" cy="372" r="37" />
      <circle cx="555" cy="372" r="37" class="noches-wink" :class="{ 'is-live': isLive }" />
      <path
        d="M424 464 Q497 512 578 436"
        fill="none"
        stroke="currentColor"
        stroke-width="26"
        stroke-linecap="round"
      />
    </g>
  </svg>
</template>

<style scoped>
/* The mark carries its own palette rather than reading the brand ramp: its
   body needs more contrast headroom against the app surface than a text
   accent does, and the peach exists only here. The two colours are set as
   utilities on the element (not here) so the `dark:` variant can flip them -
   a `:global(.dark)` rule in a scoped block loses its descendant part and
   silently stops matching. Measured against the surfaces the mark actually
   sits on:
     light  body #1B3A8F on white   10.25:1   peach #FFAE85 on body  5.68:1
     dark   body #3A62D8 on #0C0F1B  3.56:1   peach #FFC9A8 on body  3.62:1
   Both themes clear the 3:1 bar for non-text contrast. */
.noches-mark {
  color: var(--noches-body);
}

.noches-face {
  fill: var(--noches-accent);
  color: var(--noches-accent);
}

.noches-wink {
  transform-box: fill-box;
  transform-origin: center;
}

.is-live {
  animation: noches-wink 3400ms ease-in-out infinite;
}

/* A blink, not a strobe: the eye is open for most of the cycle. */
@keyframes noches-wink {
  0%,
  84%,
  100% {
    transform: scaleY(1);
  }
  89% {
    transform: scaleY(0.07);
  }
  94% {
    transform: scaleY(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-live {
    animation: none;
  }
}
</style>
