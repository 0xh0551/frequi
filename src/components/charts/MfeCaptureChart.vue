<script setup lang="ts">
import ECharts from 'vue-echarts';
import type { EChartsOption } from 'echarts';

import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ScatterChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';

import type { TradeExcursion } from '@/utils/mfe';

use([
  ScatterChart,
  LineChart,

  CanvasRenderer,

  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
]);

const props = withDefaults(
  defineProps<{
    excursions: TradeExcursion[];
    showTitle?: boolean;
  }>(),
  { showTitle: true },
);

const settingsStore = useSettingsStore();
const colorStore = useColorStore();

const SERIES_KEPT = 'Profitable exit';
const SERIES_LOST = 'Losing exit';
const SERIES_IDEAL = 'Full capture';

const pct = (value: number) => value * 100;

/**
 * Winners and losers are split into two series so each can carry its own
 * marker shape. Profit green and loss red sit at ΔE ~6 under deuteranopia,
 * which is only legible with a second, non-colour cue - hence circle vs
 * diamond rather than colour alone.
 */
const keptTrades = computed(() => props.excursions.filter((t) => t.realized > 0));
const lostTrades = computed(() => props.excursions.filter((t) => t.realized <= 0));

const toPoints = (trades: TradeExcursion[]) => trades.map((t) => [pct(t.mfe), pct(t.realized)]);

/** The y = x diagonal: everything that was on the table was taken off it. */
const idealLine = computed(() => {
  const maxMfe = props.excursions.reduce((acc, t) => Math.max(acc, pct(t.mfe)), 0);
  const limit = maxMfe > 0 ? maxMfe : 1;
  return [
    [0, 0],
    [limit, limit],
  ];
});

function tooltipFor(excursion: TradeExcursion): string {
  const rows: [string, string][] = [
    ['Best move', `${pct(excursion.mfe).toFixed(2)}%`],
    ['Realised', `${pct(excursion.realized).toFixed(2)}%`],
    ['Worst move', `-${pct(excursion.mae).toFixed(2)}%`],
    [
      'Captured',
      excursion.capture === null ? 'n/a' : `${(excursion.capture * 100).toFixed(0)}% of the move`,
    ],
  ];
  if (excursion.exitReason) rows.push(['Exit', excursion.exitReason]);

  const body = rows.map(([label, value]) => `${label}: <b>${value}</b>`).join('<br />');
  const direction = excursion.isShort ? 'short' : 'long';
  return `<b>${excursion.pair}</b> #${excursion.tradeId} (${direction})<br />${body}`;
}

const chartOptions = computed((): EChartsOption => {
  return {
    title: {
      text: 'Captured vs. available move',
      left: 'center',
      show: props.showTitle,
    },
    backgroundColor: 'rgba(0, 0, 0, 0)',
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'inside', yAxisIndex: 0 },
    ],
    grid: { left: 60, right: 24, top: props.showTitle ? 56 : 24, bottom: 76 },
    legend: {
      bottom: 0,
      data: [SERIES_KEPT, SERIES_LOST, SERIES_IDEAL],
    },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        // The excursion cannot ride along inside `data` (ECharts only types
        // numbers there), so look it back up by series and index.
        const point = params as { dataIndex?: number; seriesName?: string };
        const source = point.seriesName === SERIES_KEPT ? keptTrades.value : lostTrades.value;
        const excursion = point.dataIndex === undefined ? undefined : source[point.dataIndex];
        return excursion ? tooltipFor(excursion) : (point.seriesName ?? '');
      },
    },
    xAxis: {
      type: 'value',
      name: 'Move available (%)',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: { formatter: '{value}%' },
      splitLine: { show: true, lineStyle: { opacity: 0.25 } },
    },
    yAxis: {
      type: 'value',
      name: 'Move realised (%)',
      nameLocation: 'middle',
      nameGap: 42,
      axisLabel: { formatter: '{value}%' },
      splitLine: { show: true, lineStyle: { opacity: 0.25 } },
    },
    series: [
      {
        name: SERIES_IDEAL,
        type: 'line',
        data: idealLine.value,
        showSymbol: false,
        silent: true,
        lineStyle: { type: 'dashed', width: 2, opacity: 0.5 },
        itemStyle: { color: '#9aa4b2' },
        // Break-even: points below this line closed red even though the trade
        // had moved in their favour first.
        markLine: {
          silent: true,
          symbol: 'none',
          label: { formatter: 'break-even', position: 'insideEndTop' },
          lineStyle: { type: 'dotted', opacity: 0.45 },
          data: [{ yAxis: 0 }],
        },
      },
      {
        name: SERIES_KEPT,
        type: 'scatter',
        data: toPoints(keptTrades.value),
        symbol: 'circle',
        symbolSize: 9,
        itemStyle: { color: colorStore.colorProfit, opacity: 0.75 },
      },
      {
        name: SERIES_LOST,
        type: 'scatter',
        data: toPoints(lostTrades.value),
        symbol: 'diamond',
        symbolSize: 10,
        itemStyle: { color: colorStore.colorLoss, opacity: 0.75 },
      },
    ],
  };
});
</script>

<template>
  <ECharts
    v-if="excursions.length > 0"
    :option="chartOptions"
    :theme="settingsStore.chartTheme"
    autoresize
  />
  <div v-else class="text-muted flex h-full items-center justify-center text-sm">
    No closed trades with recorded high/low rates yet.
  </div>
</template>
