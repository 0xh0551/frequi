<script setup lang="ts">
import ECharts from 'vue-echarts';
import type { EChartsOption } from 'echarts';

import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';

import type { UnderwaterSeries } from '@/utils/tradeAnalytics';

use([
  LineChart,

  CanvasRenderer,

  DataZoomComponent,
  GridComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
]);

const props = withDefaults(
  defineProps<{
    series: UnderwaterSeries;
    stakeCurrency: string;
    showTitle?: boolean;
  }>(),
  { showTitle: true },
);

const settingsStore = useSettingsStore();
const colorStore = useColorStore();

const points = computed(() =>
  props.series.points.map((p) => [p.timestamp, +p.drawdown.toFixed(4)]),
);

const chartOptions = computed((): EChartsOption => {
  return {
    title: {
      text: 'Drawdown from realised peak',
      left: 'center',
      show: props.showTitle,
    },
    backgroundColor: 'rgba(0, 0, 0, 0)',
    dataZoom: [{ type: 'inside', xAxisIndex: 0 }],
    grid: { left: 64, right: 24, top: props.showTitle ? 48 : 20, bottom: 40 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (params) => {
        const first = (Array.isArray(params) ? params[0] : params) as {
          dataIndex?: number;
        };
        const point =
          first.dataIndex === undefined ? undefined : props.series.points[first.dataIndex];
        if (!point) return '';
        const when = timestampms(point.timestamp);
        return (
          `${when}<br />` +
          `Below peak: <b>${point.drawdown.toFixed(2)} ${props.stakeCurrency}</b><br />` +
          `Cumulative: <b>${point.cumulative.toFixed(2)} ${props.stakeCurrency}</b>`
        );
      },
    },
    xAxis: {
      type: 'time',
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      // Unit lives in the caption and tooltip - an axis name here collides
      // with the header row on narrow panels.
      // The interesting region is below zero; capping the top at 0 stops
      // ECharts donating half the panel to empty space above the surface.
      max: 0,
      axisLabel: { formatter: (value: number) => `${value}` },
      splitLine: { show: true, lineStyle: { opacity: 0.25 } },
    },
    series: [
      {
        name: 'Drawdown',
        type: 'line',
        data: points.value,
        showSymbol: false,
        lineStyle: { width: 2, color: colorStore.colorLoss },
        // The filled area is what makes "time spent underwater" legible -
        // the eye integrates the red surface, not the line.
        areaStyle: { color: colorStore.colorLoss, opacity: 0.25 },
        markPoint: {
          symbol: 'pin',
          symbolSize: 36,
          itemStyle: { color: colorStore.colorLoss },
          label: {
            formatter: () => props.series.maxDrawdown.toFixed(0),
            color: '#ffffff',
            fontSize: 10,
          },
          data:
            props.series.maxDrawdownEnd !== null
              ? [
                  {
                    name: 'Max drawdown',
                    coord: [props.series.maxDrawdownEnd, props.series.maxDrawdown],
                  },
                ]
              : [],
        },
      },
    ],
  };
});
</script>

<template>
  <ECharts
    v-if="series.points.length > 1"
    :option="chartOptions"
    :theme="settingsStore.chartTheme"
    autoresize
  />
  <div v-else class="text-muted flex h-full items-center justify-center text-sm">
    Not enough closed trades to draw a drawdown curve.
  </div>
</template>
