<script setup lang="ts">
defineProps<{
  /** Keep the descriptor at every width - for headings, where there is room. */
  full?: boolean;
}>();
</script>

<template>
  <span class="text-nowrap text-xl font-semibold tracking-tight">
    <span class="text-primary">noches</span>
    <!-- In the nav bar the descriptor drops below sm: the mark plus the name
         already identify the surface, and keeping it would overflow the bar. -->
    <span
      class="ms-1.5 font-normal text-neutral-500 dark:text-neutral-400"
      :class="full ? 'inline' : 'hidden sm:inline'"
      >Trading&nbsp;Bots</span
    >
  </span>
</template>
