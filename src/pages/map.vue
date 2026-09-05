<script setup lang="ts">
// noches 2026-09-05: نقشهٔ سه‌بعدی ناوگان داخل قالب FreqUI (زیر همان هدر).
// صفحهٔ خودِ نقشه یک HTML ایستا در frequi-dist است (fleet-ops آن را منتشر می‌کند)؛ این‌جا
// فقط در یک iframe هم‌origin نمایش داده می‌شود و باتِ فعال با ?bot= پاس می‌شود.
const botStore = useBotStore();
const src = computed(
  () => `/fleet_mindmap.html?bot=${encodeURIComponent(botStore.activeBot?.botName || '')}`,
);
</script>

<template>
  <div class="h-full w-full">
    <iframe
      :src="src"
      title="Fleet map"
      class="w-full h-full border-0 block"
      style="min-height: calc(100vh - 3.5rem)"
    ></iframe>
  </div>
</template>
