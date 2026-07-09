<template>
  <div class="traffic-chart">
    <div v-if="title" class="traffic-chart__title">{{ title }}</div>
    <div ref="elRef" class="traffic-chart__canvas"></div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { formatBytes } from '../utils/format.js';

const props = defineProps({
  series: { type: Array, required: true }, // [{ day: 'YYYY-MM-DD', bytes: number }]
  title: { type: String, default: '' },
});

const elRef = ref(null);
let chart = null;
let mediaQuery = null;

const tokens = {
  light: {
    text: '#0b0b0b',
    muted: '#898781',
    grid: '#e1e0d9',
    line: '#2a78d6',
    area: 'rgba(42, 120, 214, 0.10)',
    tooltipBg: '#fcfcfb',
  },
  dark: {
    text: '#ffffff',
    muted: '#898781',
    grid: '#2c2c2a',
    line: '#3987e5',
    area: 'rgba(57, 135, 229, 0.14)',
    tooltipBg: '#1a1a19',
  },
};

function isDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function render() {
  if (!chart) return;
  const t = isDark() ? tokens.dark : tokens.light;

  chart.setOption({
    grid: { left: 48, right: 16, top: 16, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.tooltipBg,
      borderColor: t.grid,
      textStyle: { color: t.text },
      axisPointer: { type: 'line', lineStyle: { color: t.grid } },
      valueFormatter: (v) => formatBytes(v),
    },
    xAxis: {
      type: 'category',
      data: props.series.map((s) => s.day.slice(5)),
      axisLine: { lineStyle: { color: t.grid } },
      axisTick: { show: false },
      axisLabel: { color: t.muted },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: t.grid, type: 'solid' } },
      axisLabel: { color: t.muted, formatter: (v) => formatBytes(v) },
    },
    series: [
      {
        type: 'line',
        data: props.series.map((s) => s.bytes),
        smooth: false,
        symbol: 'circle',
        symbolSize: 8,
        showSymbol: false,
        lineStyle: { width: 2, color: t.line },
        itemStyle: { color: t.line, borderColor: t.tooltipBg, borderWidth: 2 },
        areaStyle: { color: t.area },
      },
    ],
  });
}

onMounted(() => {
  chart = echarts.init(elRef.value);
  render();

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', render);

  const resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(elRef.value);
  onBeforeUnmount(() => resizeObserver.disconnect());
});

watch(() => props.series, render, { deep: true });

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', render);
  chart?.dispose();
});
</script>

<style scoped>
.traffic-chart__title {
  font-size: 13px;
  color: var(--el-text-color-secondary, #52514e);
  margin-bottom: 4px;
}
.traffic-chart__canvas {
  width: 100%;
  height: 260px;
}
</style>
