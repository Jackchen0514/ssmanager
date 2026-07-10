<template>
  <div class="port-detail">
    <el-page-header @back="$router.push('/ports')" :content="port ? `节点 ${port.server_port}` : ''" />

    <el-card v-if="port" style="margin-top: 16px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="端口号">{{ port.server_port }}</el-descriptions-item>
        <el-descriptions-item label="加密方式">{{ port.method }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ port.remark || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="port.enabled ? 'success' : 'info'">{{ port.enabled ? '已启用' : '已禁用' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="累计流量">{{ formatBytes(port.total_bytes) }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ port.created_at }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card v-if="port" style="margin-top: 16px">
      <template #header>
        <div class="conn-stat-header">
          <span>当前连接</span>
          <el-tag size="small" type="info">{{ port.enabled ? '每 5 秒刷新' : '节点已禁用' }}</el-tag>
        </div>
      </template>
      <el-row :gutter="16">
        <el-col :span="8">
          <StatTile label="TCP 连接数" :value="connStat ? connStat.tcpConnCount : '-'" />
        </el-col>
        <el-col :span="8">
          <StatTile label="UDP 会话数" :value="connStat ? connStat.udpAssocCount : '-'" />
        </el-col>
        <el-col :span="8">
          <StatTile label="在线 IP 数" :value="connStat ? connStat.onlineIpCount : '-'" />
        </el-col>
      </el-row>
      <p v-if="connStat && connStat.onlineIps.length" class="online-ips">
        在线 IP：{{ connStat.onlineIps.join('、') }}
      </p>
      <p class="form-hint">需 ssmanager ≥ v1.23.9（Jackchen0514/shadowsocks-rust 分支）才会返回真实数据，否则始终为 0</p>
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
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { usePortsStore } from '../stores/ports.js';
import TrafficChart from '../components/TrafficChart.vue';
import StatTile from '../components/StatTile.vue';
import { formatBytes } from '../utils/format.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const store = usePortsStore();
const port = ref(null);
const trafficSeries = ref([]);
const days = ref(7);
const connStat = ref(null);
let connStatTimer = null;

async function loadTraffic() {
  trafficSeries.value = await store.fetchTraffic(props.id, days.value);
}

async function loadConnStat() {
  connStat.value = await store.fetchConnStat(props.id).catch(() => null);
}

onMounted(async () => {
  if (!store.ports.length) await store.fetchPorts();
  port.value = store.ports.find((p) => String(p.id) === String(props.id));
  await loadTraffic();
  await loadConnStat();
  connStatTimer = setInterval(loadConnStat, 5000);
});
onBeforeUnmount(() => clearInterval(connStatTimer));
</script>

<style scoped>
.conn-stat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.online-ips {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 12px 0 0;
}
</style>
