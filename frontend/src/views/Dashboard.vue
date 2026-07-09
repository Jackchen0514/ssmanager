<template>
  <div class="dashboard">
    <el-row :gutter="16">
      <el-col :span="6">
        <el-card><StatTile label="端口总数" :value="summary?.portCount ?? '-'" /></el-card>
      </el-col>
      <el-col :span="6">
        <el-card><StatTile label="已启用端口" :value="summary?.enabledCount ?? '-'" /></el-card>
      </el-col>
      <el-col :span="6">
        <el-card><StatTile label="今日流量" :value="formatBytes(summary?.todayBytes)" /></el-card>
      </el-col>
      <el-col :span="6">
        <el-card><StatTile label="累计流量" :value="formatBytes(summary?.totalBytes)" /></el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <el-card>
          <div class="status-row">
            <span>ssmanager 连通性</span>
            <el-tag :type="summary?.managerConnected ? 'success' : 'danger'">
              {{ summary?.managerConnected ? '已连接' : '未连接' }}
            </el-tag>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <div class="status-row">
            <span>ssmanager 进程</span>
            <el-tag :type="summary?.process?.running ? 'success' : 'info'">
              {{ summary?.process?.running ? `运行中 (pid ${summary.process.pid})` : '未运行' }}
            </el-tag>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card style="margin-top: 16px">
      <TrafficChart title="近 7 日总流量" :series="trafficSeries" />
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useDashboardStore } from '../stores/dashboard.js';
import StatTile from '../components/StatTile.vue';
import TrafficChart from '../components/TrafficChart.vue';
import { formatBytes } from '../utils/format.js';

const store = useDashboardStore();
const summary = ref(null);
const trafficSeries = ref([]);
let timer = null;

async function refresh() {
  await store.fetchSummary();
  summary.value = store.summary;
  trafficSeries.value = await store.fetchTraffic(7);
}

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 10000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<style scoped>
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
