<script setup lang="ts">
import { summarizeExcursions } from '@/utils/mfe';
import {
  underwaterSeries,
  exitReasonStats,
  directionStats,
  durationStats,
  entryHourStats,
} from '@/utils/tradeAnalytics';

const botStore = useBotStore();

const closedTrades = computed(() => botStore.activeBot?.closedTrades ?? []);
const stakeCurrency = computed(() => botStore.activeBot?.stakeCurrency || 'USDT');

const summary = computed(() => summarizeExcursions(closedTrades.value));
const underwater = computed(() => underwaterSeries(closedTrades.value));
const byExitReason = computed(() => exitReasonStats(closedTrades.value));
const byDirection = computed(() => directionStats(closedTrades.value));
const byDuration = computed(() => durationStats(closedTrades.value));
const byEntryHour = computed(() => entryHourStats(closedTrades.value));

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

const formatHold = (hours: number | null) => {
  if (hours === null) return '—';
  return hours >= 48 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`;
};

const directionTiles = computed(() =>
  byDirection.value.map((stat) => ({
    ...stat,
    rows: [
      ['Trades', `${stat.count}`],
      ['Net', `${stat.netAbs.toFixed(2)} ${stakeCurrency.value}`],
      ['Win rate', asPercent(stat.winRate, 0)],
      ['MFE capture', asPercent(stat.capture, 0)],
      ['Avg hold', formatHold(stat.avgDurationH)],
    ] as [string, string][],
  })),
);

const maxDrawdownLabel = computed(() => {
  if (underwater.value.maxDrawdown >= 0) return null;
  const span =
    underwater.value.maxDrawdownStart !== null && underwater.value.maxDrawdownEnd !== null
      ? ` (${timestampms(underwater.value.maxDrawdownStart)} → ${timestampms(
          underwater.value.maxDrawdownEnd,
        )})`
      : '';
  return `${underwater.value.maxDrawdown.toFixed(2)} ${stakeCurrency.value}${span}`;
});

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

    <!-- ── Capture ──────────────────────────────────────────────────── -->
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

    <section class="mb-4 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      <div class="h-[420px] w-full">
        <MfeCaptureChart :excursions="summary.trades" :show-title="false" />
      </div>
      <p class="px-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        Each mark is one closed trade. The dashed diagonal is a perfect exit — the further a mark
        sits below it, the more of the move was given back. Figures are price moves, so leverage and
        fees do not distort the comparison.
      </p>
    </section>

    <!-- ── Drawdown ─────────────────────────────────────────────────── -->
    <section class="mb-4 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      <div class="flex flex-wrap items-baseline justify-between gap-2 px-2 pt-1">
        <h2 class="font-semibold">Drawdown</h2>
        <p v-if="maxDrawdownLabel" class="text-sm text-neutral-500 dark:text-neutral-400">
          Deepest: <span class="tabular-nums">{{ maxDrawdownLabel }}</span>
        </p>
      </div>
      <div class="h-[260px] w-full">
        <UnderwaterChart :series="underwater" :stake-currency="stakeCurrency" :show-title="false" />
      </div>
      <p class="px-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        Realised profit's distance below its own best point, in {{ stakeCurrency }}. Long red
        stretches mean the bot spends its life recovering rather than compounding.
      </p>
    </section>

    <!-- ── Exit mix ─────────────────────────────────────────────────── -->
    <section class="mb-4 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      <h2 class="px-2 pt-1 font-semibold">Net profit by exit reason</h2>
      <div class="h-[280px] w-full">
        <GroupStatChart
          :stats="byExitReason"
          :stake-currency="stakeCurrency"
          show-counts
          rotate-labels
        />
      </div>
      <p class="px-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        Which exits earn and which ones bleed. Hover a bar for win rate, average profit and how much
        of the favourable move that exit type captures.
      </p>
    </section>

    <!-- ── Behaviour ────────────────────────────────────────────────── -->
    <section class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
        <h2 class="px-2 pt-1 font-semibold">Net profit by holding time</h2>
        <div class="h-[240px] w-full">
          <GroupStatChart :stats="byDuration" :stake-currency="stakeCurrency" show-counts />
        </div>
        <p class="px-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
          Where the money is made across hold durations — and where trades go to die.
        </p>
      </div>
      <div class="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
        <h2 class="px-2 pt-1 font-semibold">Net profit by entry hour (UTC)</h2>
        <div class="h-[240px] w-full">
          <GroupStatChart :stats="byEntryHour" :stake-currency="stakeCurrency" />
        </div>
        <p class="px-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
          The entry-timing fingerprint. Consistent red hours are a session the strategy should
          probably sit out.
        </p>
      </div>
    </section>

    <!-- ── Direction ────────────────────────────────────────────────── -->
    <section class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div
        v-for="stat in directionTiles"
        :key="stat.key"
        class="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
      >
        <div class="mb-2 flex items-baseline justify-between">
          <h2 class="font-semibold">{{ stat.label }}</h2>
          <span
            class="text-lg font-semibold tabular-nums"
            :style="{ color: stat.netAbs >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }"
          >
            {{ stat.netAbs >= 0 ? '+' : '' }}{{ stat.netAbs.toFixed(2) }} {{ stakeCurrency }}
          </span>
        </div>
        <dl v-if="stat.count > 0" class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <template v-for="[label, value] in stat.rows" :key="label">
            <dt class="text-neutral-500 dark:text-neutral-400">{{ label }}</dt>
            <dd class="text-end tabular-nums">{{ value }}</dd>
          </template>
        </dl>
        <p v-else class="text-sm text-neutral-500 dark:text-neutral-400">
          No {{ stat.label.toLowerCase() }} trades yet.
        </p>
      </div>
    </section>
  </div>
</template>
