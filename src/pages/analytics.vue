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

// ── Agent exit actuator (nightly exit_tuner in Quant_research) ─────────────
// The tuner drops a UI copy of agent_exits.json next to this build; freqtrade
// serves any file in the installed-UI dir, so a plain fetch works on every bot.
interface AgentBotRec {
  diagnosis: string | null;
  tp_long_pct: number | null;
  tp_short_pct: number | null;
  n: number;
  why: string | null;
  epoch: string | null;
  actual_pnl: number | null;
  sim_pnl: number | null;
  raw_improvement: number | null;
  split_half_improvement: [number, number] | null;
  hit_share: number | null;
  mfe_mean: number | null;
  stop_geometry: Record<string, number | string | null> | null;
  pair_flags: { pair: string; n: number; pnl: number; mfe_mean: number }[] | null;
}
interface AgentExits {
  generated_at: string;
  aliases: Record<string, string>;
  bots: Record<string, AgentBotRec>;
}

const agentExits = ref<AgentExits | null>(null);
onMounted(async () => {
  try {
    const res = await fetch('/agent_exits.json', { cache: 'no-store' });
    if (res.ok) agentExits.value = await res.json();
  } catch {
    /* fleet file not published on this deployment — panel simply hides */
  }
});

const activeFleetKey = computed(() => {
  const names = [botStore.activeBot?.botName, botStore.activeBot?.botState?.bot_name];
  const aliases = agentExits.value?.aliases ?? {};
  for (const n of names) {
    if (n && aliases[n]) return aliases[n];
    if (n && agentExits.value?.bots[n]) return n;
  }
  return null;
});

const agentRows = computed(() => {
  const bots = agentExits.value?.bots ?? {};
  return Object.entries(bots)
    .map(([bot, r]) => ({ bot, ...r, active: bot === activeFleetKey.value }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.bot.localeCompare(b.bot));
});

const activeAgentRec = computed(() =>
  activeFleetKey.value ? (agentExits.value?.bots[activeFleetKey.value] ?? null) : null,
);

const asTp = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
const asUsd = (v: number | null | undefined) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}$`;
const diagnosisHint: Record<string, string> = {
  exit_problem: 'money was on the table; exits gave it back → actuator TP, not sizing cuts',
  entry_problem: 'favourable moves never materialise → sizing / selection is the lever',
  mixed: 'small MFE and weak capture — no single lever',
  healthy: 'keep as is',
  insufficient: 'not enough closed trades yet',
};

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

    <!-- ── Agent exit actuator ──────────────────────────────────────── -->
    <section
      v-if="agentExits"
      class="mb-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      aria-labelledby="agent-exit-headline"
    >
      <h2 id="agent-exit-headline" class="font-semibold">Agent exit actuator</h2>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Nightly counterfactual on each bot's own MFE decides an evidence-based take-profit
        (price space). Guards: n≥8, ≥$20 improvement, stable across halves. Updated
        {{ agentExits.generated_at.slice(0, 16) }} UTC.
      </p>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full min-w-[560px] text-sm">
          <thead class="text-start text-neutral-500 dark:text-neutral-400">
            <tr class="border-b border-neutral-200 text-start dark:border-neutral-800">
              <th class="py-1 text-start">Bot</th>
              <th class="text-start">Diagnosis</th>
              <th class="text-end">TP long / short</th>
              <th class="text-end">Actual → sim (window)</th>
              <th class="text-end">n</th>
              <th class="text-start">Why / guard</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in agentRows"
              :key="row.bot"
              class="border-b border-neutral-100 dark:border-neutral-900"
              :class="row.active ? 'bg-primary/5 font-medium' : ''"
            >
              <td class="py-1">{{ row.bot }}{{ row.active ? ' ◀' : '' }}</td>
              <td>{{ row.diagnosis ?? '—' }}</td>
              <td class="text-end tabular-nums">{{ asTp(row.tp_long_pct) }} / {{ asTp(row.tp_short_pct) }}</td>
              <td class="text-end tabular-nums">
                {{ asUsd(row.actual_pnl) }} → {{ asUsd(row.sim_pnl) }}
              </td>
              <td class="text-end tabular-nums">{{ row.n }}</td>
              <td class="max-w-[220px] truncate" :title="row.why ?? ''">{{ row.why ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="activeAgentRec" class="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div class="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <h3 class="mb-1 font-semibold">This bot's diagnosis</h3>
          <p>
            <span class="font-medium">{{ activeAgentRec.diagnosis }}</span>
            — {{ diagnosisHint[activeAgentRec.diagnosis ?? ''] ?? '' }}
          </p>
          <p class="mt-1 text-neutral-500 dark:text-neutral-400">
            mean MFE {{ asTp(activeAgentRec.mfe_mean) }} · TP hit share
            {{ activeAgentRec.hit_share == null ? '—' : (activeAgentRec.hit_share * 100).toFixed(0) + '%' }}
            · halves {{ activeAgentRec.split_half_improvement?.map((x) => asUsd(x)).join(' / ') ?? '—' }}
            · since {{ activeAgentRec.epoch ?? '—' }}
          </p>
        </div>
        <div class="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <h3 class="mb-1 font-semibold">Stop geometry (diagnostic)</h3>
          <p>{{ activeAgentRec.stop_geometry?.read ?? 'no stop info' }}</p>
          <p class="mt-1 text-neutral-500 dark:text-neutral-400">
            stop exits {{ activeAgentRec.stop_geometry?.stop_exit_share ?? '—' }} of trades ·
            {{ activeAgentRec.stop_geometry?.stop_exits_gave_back_first ?? '—' }} stop-outs were in
            profit (≥1%) first ({{ asUsd(activeAgentRec.stop_geometry?.stop_exits_gave_back_usd as number) }})
          </p>
          <p
            v-if="activeAgentRec.pair_flags && activeAgentRec.pair_flags.length"
            class="mt-1 text-neutral-500 dark:text-neutral-400"
          >
            big-MFE / negative-capture pairs:
            {{ activeAgentRec.pair_flags.map((f) => `${f.pair} (${asUsd(f.pnl)})`).join(', ') }}
          </p>
        </div>
      </div>
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
