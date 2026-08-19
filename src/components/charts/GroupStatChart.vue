<script setup lang="ts">
import ECharts from 'vue-echarts';
import type { EChartsOption } from 'echarts';

import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart } from 'echarts/charts';
import { GridComponent, TitleComponent, TooltipComponent } from 'echarts/components';

import type { GroupStat } from '@/utils/tradeAnalytics';

use([BarChart, CanvasRenderer, GridComponent, TitleComponent, TooltipComponent]);

/**
 * One bar per group, height = net realised profit. Shared by the exit-reason,
 * holding-time and entry-hour sections so all behavioural views read alike.
 *
 * Win/loss is encoded by colour AND by the sign of the bar itself (direction
 * from the zero line), so the profit/loss pair's weak colourblind separation
 * is never the only cue.
 */
const props = withDefaults(
  defineProps<{
    stats: GroupStat[];
    stakeCurrency: string;
    /** Show n=x on top of each bar - readable for <=8 bars, noise for 24. */
    showCounts?: boolean;
    rotateLabels?: boolean;
  }>(),
  { showCounts: false, rotateLabels: false },
);

const settingsStore = useSettingsStore();
const colorStore = useColorStore();

const hasData = computed(() => props.stats.some((s) => s.count > 0));

function tooltipFor(stat: GroupStat): string {
  const rows: [string, string][] = [
    ['Trades', `${stat.count}`],
    ['Net', `${stat.netAbs.toFixed(2)} ${props.stakeCurrency}`],
    ['Win rate', `${(stat.winRate * 100).toFixed(0)}%`],
    ['Avg profit', `${(stat.avgRatio * 100).toFixed(2)}%`],
  ];
  if (stat.capture !== null) rows.push(['MFE capture', `${(stat.capture * 100).toFixed(0)}%`]);
  if (stat.avgDurationH !== null) {
    const hours = stat.avgDurationH;
    rows.push(['Avg hold', hours >= 48 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`]);
  }
  const body = rows.map(([label, value]) => `${label}: <b>${value}</b>`).join('<br />');
  return `<b>${stat.label}</b><br />${body}`;
}

const chartOptions = computed((): EChartsOption => {
  return {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    grid: { left: 56, right: 12, top: 24, bottom: props.rotateLabels ? 48 : 28 },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const point = params as { dataIndex?: number };
        const stat = point.dataIndex === undefined ? undefined : props.stats[point.dataIndex];
        return stat ? tooltipFor(stat) : '';
      },
    },
    xAxis: {
      type: 'category',
      data: props.stats.map((s) => s.label),
      axisLabel: {
        interval: props.stats.length > 12 ? 1 : 0,
        rotate: props.rotateLabels ? 40 : 0,
        fontSize: 10,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: props.stakeCurrency,
      splitLine: { show: true, lineStyle: { opacity: 0.25 } },
    },
    series: [
      {
        type: 'bar',
        data: props.stats.map((s) => ({
          value: +s.netAbs.toFixed(4),
          itemStyle: {
            color: s.netAbs >= 0 ? colorStore.colorProfit : colorStore.colorLoss,
            opacity: s.count === 0 ? 0.15 : 0.85,
            borderRadius: s.netAbs >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
          },
        })),
        barMaxWidth: 28,
        label: {
          show: props.showCounts,
          position: 'top',
          formatter: (params) => {
            const stat = props.stats[params.dataIndex ?? -1];
            return stat && stat.count > 0 ? `n=${stat.count}` : '';
          },
          fontSize: 10,
          opacity: 0.7,
        },
      },
    ],
  };
});
</script>

<template>
  <ECharts v-if="hasData" :option="chartOptions" :theme="settingsStore.chartTheme" autoresize />
  <div v-else class="text-muted flex h-full items-center justify-center text-sm">
    No closed trades in this view yet.
  </div>
</template>
