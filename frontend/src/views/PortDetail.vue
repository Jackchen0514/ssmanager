<template>
  <div class="port-detail">
    <el-page-header @back="$router.push('/ports')" :content="port ? `端口 ${port.server_port}` : ''" />

    <el-card v-if="port" style="margin-top: 16px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="端口">{{ port.server_port }}</el-descriptions-item>
        <el-descriptions-item label="加密方式">{{ port.method }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ port.remark || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="port.enabled ? 'success' : 'info'">{{ port.enabled ? '已启用' : '已禁用' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="累计流量">{{ formatBytes(port.total_bytes) }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ port.created_at }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card style="margin-top: 16px">
      <el-radio-group v-model="days" size="small" @change="loadTraffic" style="margin-bottom: 12px">
        <el-radio-button :value="7">7 天</el-radio-button>
        <el-radio-button :value="30">30 天</el-radio-button>
      </el-radio-group>
      <TrafficChart :series="trafficSeries" />
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { usePortsStore } from '../stores/ports.js';
import TrafficChart from '../components/TrafficChart.vue';
import { formatBytes } from '../utils/format.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const store = usePortsStore();
const port = ref(null);
const trafficSeries = ref([]);
const days = ref(7);

async function loadTraffic() {
  trafficSeries.value = await store.fetchTraffic(props.id, days.value);
}

onMounted(async () => {
  if (!store.ports.length) await store.fetchPorts();
  port.value = store.ports.find((p) => String(p.id) === String(props.id));
  await loadTraffic();
});
</script>
