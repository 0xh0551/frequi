<script setup lang="ts">
// ── Incident-embargo banner (noches build, 2026-09-04) ─────────────────────
// Owner: «من هیچ جایی امبارگو و دلیلش و زمان رفعش رو متوجه نمیشم». The fleet's
// incident-learning loop silently vetoes every organic entry while an embargo is
// active (only activity-floor trades pass, scaled by floor_mult). Quant_research's
// scripts/publish_embargo_ui.py drops /embargo_state.json next to this build every
// 5 min (same pattern as agent_exits.json); freqtrade serves any file in the
// installed-UI dir, so a plain fetch works on every bot.
interface EmbargoCf {
  cf_pnl: number | null;
  n_cf_trades: number | null;
  n_vetoed_signals: number | null;
  actual_pnl: number | null;
  embargo_benefit: number | null;
  cf_by_bot: Record<string, number>;
  uncovered_bots: string[];
  sources: { shadow?: number; log?: number };
}
interface EmbargoHistory {
  since: string | null;
  until: string | null;
  verdict: string | null;
  trades_opened_during: number | null;
  floor_trades_during: number | null;
  pnl_opened_during: number | null;
  counterfactual?: EmbargoCf | null;
}
interface EmbargoUi {
  active: boolean;
  stale: boolean;
  last_checked: string | null;
  headline_fa: string;
  effect_fa?: string;
  since?: string;
  until?: string;
  last_match?: string;
  remaining_h?: number;
  elapsed_h?: number;
  extensions?: number;
  ttl_h?: number;
  floor_mult?: number;
  cause_class?: string;
  cause_fa?: string;
  hits_fa?: string[];
  bleeding?: {
    pnl: number | null;
    window_h: number | null;
    bots_negative: number | null;
    threshold: number | null;
    n_trades: number | null;
  };
  incident?: {
    id: string;
    start: string | null;
    end: string | null;
    fleet_pnl: number | null;
    n_trades: number | null;
    n_bots_losing: number | null;
    per_bot: Record<string, number> | null;
  } | null;
  counterfactual?: EmbargoCf | null;
  cf_generated_at?: string | null;
  cf_totals?: { n_windows: number; cf_pnl: number; actual_pnl: number; embargo_benefit: number; n_cf_trades: number } | null;
  history: EmbargoHistory[];
}
interface EmbargoPayload {
  generated_at: string;
  ui: EmbargoUi;
}

const payload = ref<EmbargoPayload | null>(null);
const expanded = ref(false);
const dismissedUntil = ref<string | null>(null);
let timer: number | undefined;

async function load() {
  try {
    const res = await fetch('/embargo_state.json', { cache: 'no-store' });
    if (res.ok) payload.value = await res.json();
  } catch {
    /* file not published on this deployment — banner simply hides */
  }
}

onMounted(() => {
  try {
    dismissedUntil.value = localStorage.getItem('noches.embargo.dismissedUntil');
  } catch {
    /* storage unavailable */
  }
  load();
  timer = window.setInterval(load, 60_000);
});
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});

const ui = computed(() => payload.value?.ui ?? null);

// Tehran wall-clock for the owner; the raw ISO stays in the details block.
const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};
const fmtNum = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString('fa-IR', { maximumFractionDigits: digits });
const remainingText = computed(() => {
  const h = ui.value?.remaining_h;
  if (h === undefined || h === null) return '';
  if (h < 1) return `${fmtNum(Math.round(h * 60), 0)} دقیقه`;
  return `${fmtNum(h, 1)} ساعت`;
});

// The inactive line can be hidden for the current embargo cycle; an active
// embargo is never hidden — that is the whole point of the banner.
const showInactive = computed(() => {
  if (!ui.value || ui.value.active) return false;
  const key = ui.value.last_checked ?? '';
  return dismissedUntil.value !== key;
});
function dismissInactive() {
  const key = ui.value?.last_checked ?? '';
  dismissedUntil.value = key;
  try {
    localStorage.setItem('noches.embargo.dismissedUntil', key);
  } catch {
    /* ignore */
  }
}
const money = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}$`;
};
const cfBots = (cf: EmbargoCf | null | undefined) =>
  cf ? Object.entries(cf.cf_by_bot).map(([b, v]) => `${b} ${money(v)}`).join(' · ') : '';
const verdictFa = (v: string | null) =>
  v === 'stress_materialised'
    ? 'استرس رخ داد'
    : v === 'false_alarm'
      ? 'هشدار اشتباه'
      : (v ?? '—');
</script>

<template>
  <div v-if="ui && ui.active" dir="rtl" class="w-full text-right">
    <div class="border-b border-amber-500/60 bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
      <div class="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-sm">
        <span class="font-bold">🛑 {{ ui.headline_fa }}</span>
        <span>
          از <b>{{ fmt(ui.since) }}</b> تا <b>{{ fmt(ui.until) }}</b>
          <span v-if="remainingText">(⏳ {{ remainingText }} مانده)</span>
          <span v-if="ui.extensions"> · {{ fmtNum(ui.extensions, 0) }} بار تمدید</span>
          <span v-if="ui.counterfactual" :title="cfBots(ui.counterfactual)">
            · تا الان اگر embargo نبود: <b>{{ money(ui.counterfactual.cf_pnl) }}</b>
            ({{ fmtNum(ui.counterfactual.n_cf_trades, 0) }} ورودِ وتوشده) در برابر واقعی
            <b>{{ money(ui.counterfactual.actual_pnl) }}</b>
          </span>
          <span v-if="ui.stale" class="font-semibold text-red-700 dark:text-red-300">
            · ⚠️ ارزیابِ ساعتی به‌روز نشده ({{ fmt(ui.last_checked) }})
          </span>
        </span>
        <button
          class="ms-auto rounded border border-amber-600/50 px-2 py-0.5 text-xs hover:bg-amber-200 dark:hover:bg-amber-900"
          type="button"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'بستن جزئیات' : 'چرا؟ جزئیات' }}
        </button>
      </div>
      <div v-if="expanded" class="mx-auto max-w-screen-2xl border-t border-amber-500/30 px-3 py-2 text-xs leading-6">
        <div class="grid gap-x-8 gap-y-2 md:grid-cols-2">
          <div>
            <div class="font-semibold">چرا فعال شد</div>
            <ul class="list-disc ps-5">
              <li v-for="h in ui.hits_fa" :key="h">{{ h }}</li>
              <li v-if="ui.bleeding && ui.bleeding.pnl !== null">
                خونریزی ناوگان در شروع: <b>{{ fmtNum(ui.bleeding.pnl, 1) }}$</b> در
                {{ fmtNum(ui.bleeding.window_h, 0) }} ساعت ({{ fmtNum(ui.bleeding.n_trades, 0) }} ترید،
                {{ fmtNum(ui.bleeding.bots_negative, 0) }} بات منفی؛ آستانه {{ fmtNum(ui.bleeding.threshold, 1) }}$)
              </li>
              <li v-if="ui.incident">
                حادثهٔ مرجع: {{ fmt(ui.incident.start) }} تا {{ fmt(ui.incident.end) }}،
                زیان ناوگان <b>{{ fmtNum(ui.incident.fleet_pnl, 1) }}$</b> در
                {{ fmtNum(ui.incident.n_trades, 0) }} ترید ({{ fmtNum(ui.incident.n_bots_losing, 0) }} بات بازنده)
              </li>
            </ul>
            <div class="mt-1 text-neutral-700 dark:text-neutral-300">{{ ui.effect_fa }}</div>
            <div class="mt-1 text-neutral-600 dark:text-neutral-400">
              آخرین مطابقت: {{ fmt(ui.last_match) }} · آخرین ارزیابی: {{ fmt(ui.last_checked) }} ·
              TTL از آخرین مطابقت: {{ fmtNum(ui.ttl_h, 0) }} ساعت
            </div>
          </div>
          <div>
            <div class="font-semibold">کارنامهٔ embargoهای قبلی</div>
            <table class="w-full text-start">
              <thead>
                <tr class="text-neutral-600 dark:text-neutral-400">
                  <th class="text-start font-normal">از</th>
                  <th class="text-start font-normal">تا</th>
                  <th class="text-start font-normal">حکم</th>
                  <th class="text-start font-normal">ترید در آن (کف)</th>
                  <th class="text-start font-normal">سود واقعی</th>
                  <th class="text-start font-normal">اگر embargo نبود</th>
                  <th class="text-start font-normal">سودِ embargo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="h in ui.history" :key="h.since ?? ''">
                  <td>{{ fmt(h.since) }}</td>
                  <td>{{ fmt(h.until) }}</td>
                  <td>{{ verdictFa(h.verdict) }}</td>
                  <td>{{ fmtNum(h.trades_opened_during, 0) }} ({{ fmtNum(h.floor_trades_during, 0) }})</td>
                  <td>{{ money(h.pnl_opened_during) }}</td>
                  <td :title="cfBots(h.counterfactual)">
                    {{ money(h.counterfactual?.cf_pnl) }}
                    <span v-if="h.counterfactual" class="text-neutral-500">({{ fmtNum(h.counterfactual.n_cf_trades, 0) }})</span>
                  </td>
                  <td
                    :class="(h.counterfactual?.embargo_benefit ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'"
                  >
                    {{ money(h.counterfactual?.embargo_benefit) }}
                  </td>
                </tr>
                <tr v-if="ui.counterfactual" class="font-semibold">
                  <td>{{ fmt(ui.since) }}</td>
                  <td>فعال</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{{ money(ui.counterfactual.actual_pnl) }}</td>
                  <td :title="cfBots(ui.counterfactual)">
                    {{ money(ui.counterfactual.cf_pnl) }}
                    <span class="text-neutral-500">({{ fmtNum(ui.counterfactual.n_cf_trades, 0) }})</span>
                  </td>
                  <td :class="(ui.counterfactual.embargo_benefit ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'">
                    {{ money(ui.counterfactual.embargo_benefit) }}
                  </td>
                </tr>
                <tr v-if="ui.cf_totals" class="border-t border-amber-500/40 font-bold">
                  <td colspan="4">جمع {{ fmtNum(ui.cf_totals.n_windows, 0) }} embargo</td>
                  <td>{{ money(ui.cf_totals.actual_pnl) }}</td>
                  <td>{{ money(ui.cf_totals.cf_pnl) }} <span class="text-neutral-500">({{ fmtNum(ui.cf_totals.n_cf_trades, 0) }})</span></td>
                  <td :class="(ui.cf_totals.embargo_benefit ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'">
                    {{ money(ui.cf_totals.embargo_benefit) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="mt-1 text-neutral-600 dark:text-neutral-400">
              «اگر embargo نبود» = بازپخشِ ورودهای وتوشده روی کندل‌های ۱۵ دقیقه (ورود در بستهٔ کندلِ سیگنال، استاپ ۰٫۷۵×نوسان روزانه، نگه‌داری = میانهٔ بات، کارمزد ۱۲bps).
              «سودِ embargo» = واقعی − اگر‌نبود؛ سبز یعنی embargo پول نگه داشت.
              <span v-if="ui.counterfactual && ui.counterfactual.uncovered_bots.length">
                ⚠️ بدون پوشش (سیگنال ثبت‌نشده تا ۰۹-۰۴): {{ ui.counterfactual.uncovered_bots.join('، ') }}.
              </span>
              <br />منبع: outputs/embargo_state.json (ارزیابی ساعتی :۰۷) · counterfactual ساعتی :۱۲ · انتشار UI هر ۵ دقیقه
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div
    v-else-if="showInactive"
    dir="rtl"
    class="w-full border-b border-emerald-500/30 bg-emerald-50 px-3 py-0.5 text-right text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
  >
    ✅ {{ ui?.headline_fa }} · آخرین ارزیابی {{ fmt(ui?.last_checked) }}
    <span v-if="ui?.stale" class="font-semibold text-red-700 dark:text-red-300">· ⚠️ ارزیابِ ساعتی به‌روز نشده</span>
    <button class="ms-3 underline" type="button" @click="dismissInactive">پنهان</button>
  </div>
</template>
