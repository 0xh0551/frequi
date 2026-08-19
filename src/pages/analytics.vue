<script setup lang="ts">
import { summarizeExcursions } from '@/utils/mfe';

const botStore = useBotStore();

const summary = computed(() => summarizeExcursions(botStore.activeBot?.closedTrades ?? []));

const asPercent = (value: number | null, digits = 1) =>
  value === null ? '—' : `${(value * 100).toFixed(digits)}%`;

/**
 * Capture is a ratio of two moves, so it reads naturally as a percentage, but
 * it is not bounded by 100: a trade can exit above its recorded high on a gap.
 */
const captureLabel = computed(() => asPercent(summary.value.captureRatio, 0));

const headlineHint = computed(() => {
  const ratio = summary.value.captureRatio;
  if (ratio === null) return 'No closed trade has moved in its favour yet.';
  if (ratio < 0) return 'Trades are closing below where they opened, on average.';
  if (ratio < 0.35) return 'Most of the favourable move is being handed back before the exit.';
  if (ratio < 0.7) return 'Roughly half of the favourable move is being kept.';
  return 'Exits are landing close to the favourable extreme.';
});

const tiles = computed(() => [
  {
    label: 'Median per trade',
    value: asPercent(summary.value.medianCapture, 0),
    hint: 'Middle trade, so one outlier cannot flatter the headline.',
  },
  {
    label: 'Average best move',
    value: asPercent(summary.value.avgMfe, 2),
    hint: 'How far price ran in the trade’s favour.',
  },
  {
    label: 'Average worst move',
    value: summary.value.avgMae === null ? '—' : `-${asPercent(summary.value.avgMae, 2)}`,
    hint: 'How far price ran against it before the exit.',
  },
  {
    label: 'Trades measured',
    value: `${summary.value.analyzed}`,
    hint:
      summary.value.skipped > 0
        ? `${summary.value.skipped} skipped — the bot recorded no high/low for them.`
        : 'Every closed trade had usable high/low rates.',
  },
]);

onMounted(() => {
  botStore.activeBot?.getTrades();
});
</script>

<template>
  <div class="mx-auto max-w-6xl p-4 text-start">
    <header class="mb-4">
      <h1 class="text-2xl font-bold">Trade analytics</h1>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ botStore.activeBot?.botName ?? 'No bot selected' }} — closed trades only.
      </p>
    </header>

    <section
      class="mb-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      aria-labelledby="capture-headline"
    >
      <h2 id="capture-headline" class="text-sm text-neutral-500 dark:text-neutral-400">
        Share of the favourable move that was actually realised
      </h2>
      <p class="text-primary my-1 text-5xl font-bold tabular-nums">{{ captureLabel }}</p>
      <p class="text-sm text-neutral-600 dark:text-neutral-300">{{ headlineHint }}</p>
      <p
        v-if="summary.captureRatio !== null"
        class="mt-2 text-sm text-neutral-500 dark:text-neutral-400"
      >
        Across {{ summary.winners }} profitable and {{ summary.losers }} losing exits,
        {{ asPercent(summary.givenBackShare, 0) }} of the available move was given back before the
        exit.
      </p>
    </section>

    <section class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="tile in tiles"
        :key="tile.label"
        class="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
      >
        <div class="text-sm text-neutral-500 dark:text-neutral-400">{{ tile.label }}</div>
        <div class="text-2xl font-semibold tabular-nums">{{ tile.value }}</div>
        <div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{{ tile.hint }}</div>
      </div>
    </section>

    <section class="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      <div class="h-[420px] w-full">
        <MfeCaptureChart :excursions="summary.trades" :show-title="false" />
      </div>
      <p class="px-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        Each mark is one closed trade. The dashed diagonal is a perfect exit — the further a mark
        sits below it, the more of the move was given back. Figures are price moves, so leverage and
        fees do not distort the comparison.
      </p>
    </section>
  </div>
</template>
