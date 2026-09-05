<script setup lang="ts">
// noches 2026-09-05: «مواجههٔ بات با بازار» (گزارش لاگ وضعیت) داخل قالب FreqUI.
// صفحه یک HTML ایستا در frequi-dist است که /bot_state_report.json را می‌خواند؛ این‌جا در iframe
// هم‌origin نمایش داده می‌شود و باتِ فعال با ?bot= پاس می‌شود.
const botStore = useBotStore();
const src = computed(
  () => `/bot_state.html?bot=${encodeURIComponent(botStore.activeBot?.botName || '')}`,
);
</script>

<template>
  <div class="h-full w-full">
    <iframe
      :src="src"
      title="Bot state"
      class="w-full h-full border-0 block"
      style="min-height: calc(100vh - 3.5rem)"
    ></iframe>
  </div>
</template>
