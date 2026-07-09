<template>
  <div class="ports">
    <div class="ports__toolbar">
      <el-button type="primary" @click="openCreate">新增端口</el-button>
    </div>

    <el-table :data="store.ports" v-loading="store.loading" style="width: 100%">
      <el-table-column prop="server_port" label="端口" width="90" />
      <el-table-column prop="remark" label="备注" min-width="120" />
      <el-table-column prop="method" label="加密方式" width="180" />
      <el-table-column label="流量" width="180">
        <template #default="{ row }">
          {{ formatBytes(row.total_bytes) }}<span v-if="row.traffic_limit_bytes"> / {{ formatBytes(row.traffic_limit_bytes) }}</span>
          <el-tag v-if="row.limit_exceeded" type="danger" size="small" style="margin-left: 6px">已超限</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="过期时间" width="180">
        <template #default="{ row }">
          {{ row.expires_at ? formatDateTime(row.expires_at) : '永不过期' }}
          <el-tag v-if="row.expired" type="danger" size="small" style="margin-left: 6px">已过期</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-switch :model-value="!!row.enabled" @change="() => onToggle(row)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300">
        <template #default="{ row }">
          <el-button link @click="$router.push(`/ports/${row.id}`)">详情</el-button>
          <el-button link @click="openShare(row)">分享</el-button>
          <el-button link @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确定清零该端口的流量统计？" @confirm="onResetTraffic(row)">
            <template #reference>
              <el-button link>重置流量</el-button>
            </template>
          </el-popconfirm>
          <el-popconfirm title="确定删除该端口？" @confirm="store.deletePort(row.id)">
            <template #reference>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <PortFormDialog v-model="dialogOpen" :port="editingPort" :save-fn="onSave" />
    <ShareDialog v-model="shareOpen" :port="sharingPort" :server-host="serverHost" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { usePortsStore } from '../stores/ports.js';
import PortFormDialog from '../components/PortFormDialog.vue';
import ShareDialog from '../components/ShareDialog.vue';
import { formatBytes, formatDateTime } from '../utils/format.js';
import http from '../api/http.js';

const store = usePortsStore();
const dialogOpen = ref(false);
const editingPort = ref(null);
const shareOpen = ref(false);
const sharingPort = ref(null);
const serverHost = ref('');

onMounted(async () => {
  await store.fetchPorts();
  const { data } = await http.get('/settings/manager');
  serverHost.value = data.server_host;
});

function openCreate() {
  editingPort.value = null;
  dialogOpen.value = true;
}
function openEdit(row) {
  editingPort.value = row;
  dialogOpen.value = true;
}
function openShare(row) {
  sharingPort.value = row;
  shareOpen.value = true;
}
async function onSave(formData) {
  if (editingPort.value) {
    await store.updatePort(editingPort.value.id, formData);
  } else {
    await store.createPort(formData);
  }
}
async function onToggle(row) {
  try {
    await store.togglePort(row.id);
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '操作失败');
  }
}
async function onResetTraffic(row) {
  try {
    await store.resetTraffic(row.id);
    ElMessage.success('流量已重置');
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '重置失败');
  }
}
</script>

<style scoped>
.ports__toolbar {
  margin-bottom: 12px;
}
</style>
