<script setup lang="ts">
definePage({
  meta: {
    allowAnonymous: true,
  },
});
</script>

<template>
  <div class="mt-5">
    <div class="flex justify-center">
      <BotList class="max-w-xl" />
    </div>
    <USeparator class="my-5" />
    <AppIcon class="mx-auto my-5 block h-64 w-64 sm:h-80 sm:w-80" />

    <h1 class="mb-4 text-2xl font-bold sm:text-4xl">
      <AppText full class="text-2xl! sm:text-4xl!" />
    </h1>
    <p>Select a bot to monitor its trades, charts and performance.</p>
    <USeparator class="my-5" />

    <p class="text-sm text-neutral-500 dark:text-neutral-400">
      Runs on the Freqtrade engine -
      <a
        class="text-primary cursor-pointer underline"
        href="https://www.freqtrade.io/en/latest/"
        target="_blank"
        rel="noopener"
      >
        engine documentation</a
      >.
    </p>
  </div>
</template>
