<template>
  <div class="settings">
    <el-card>
      <template #header>Manager 连接设置</template>
      <el-form v-if="form" :model="form" label-width="160px" style="max-width: 560px">
        <el-form-item label="Manager 地址 (host)">
          <el-input v-model="form.host" />
        </el-form-item>
        <el-form-item label="Manager 端口 (UDP)">
          <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item label="服务器公网地址 (IPv4)">
          <el-input v-model="form.server_host" placeholder="客户端连接用，例如 1.2.3.4 或 example.com" />
        </el-form-item>
        <el-form-item label="服务器公网地址 (IPv6)">
          <el-input v-model="form.server_host_v6" placeholder="选填，例如 2001:db8::1，留空则不生成 IPv6 分享链接" />
        </el-form-item>
        <el-form-item label="轮询间隔 (ms)">
          <el-input-number v-model="form.poll_interval_ms" :min="1000" :step="1000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Reconcile 间隔 (ms)">
          <el-input-number v-model="form.reconcile_interval_ms" :min="5000" :step="5000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="ssmanager 可执行文件">
          <el-input v-model="form.binary_path" />
        </el-form-item>
        <el-form-item label="启动参数">
          <el-input v-model="form.binary_args" />
          <div class="form-hint">
            默认 <code>-s 0.0.0.0</code> 只监听 IPv4。服务器有可用公网 IPv6 的话，把
            <code>-s 0.0.0.0</code> 改成 <code>-s ::</code> 可以让同一个 ssserver 同时监听
            v4 和 v6（Linux 下双栈绑定）；改完点保存并重启 ssmanager 进程生效。前提是这台机器
            内核没有禁用 IPv6（<code>ip -6 addr</code> 至少能看到 <code>::1</code>），否则绑定
            <code>::</code> 会直接失败，连 IPv4 也起不来。
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="savingConfig" @click="saveConfig">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>
        <div class="process-header">
          <span>ssmanager 进程</span>
          <el-tag :type="processStatus?.running ? 'success' : 'info'">
            {{ processStatus?.running ? `运行中 (pid ${processStatus.pid})` : '未运行' }}
          </el-tag>
        </div>
      </template>
      <el-space style="margin-bottom: 12px">
        <el-button :disabled="processStatus?.running" @click="doProcessAction('start')">启动</el-button>
        <el-button :disabled="!processStatus?.running" @click="doProcessAction('stop')">停止</el-button>
        <el-button @click="doProcessAction('restart')">重启</el-button>
      </el-space>
      <pre class="logs">{{ logs.join('\n') }}</pre>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>修改密码</template>
      <el-form :model="pwForm" label-width="120px" style="max-width: 420px">
        <el-form-item label="当前密码">
          <el-input v-model="pwForm.currentPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="savingPw" @click="changePassword">修改</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <ApiTokensCard />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import http from '../api/http.js';
import { useDashboardStore } from '../stores/dashboard.js';
import ApiTokensCard from '../components/ApiTokensCard.vue';

const dashboard = useDashboardStore();
const form = ref(null);
const savingConfig = ref(false);
const processStatus = ref(null);
const logs = ref([]);
const pwForm = reactive({ currentPassword: '', newPassword: '' });
const savingPw = ref(false);
let timer = null;

async function loadConfig() {
  const { data } = await http.get('/settings/manager');
  form.value = data;
}

async function saveConfig() {
  savingConfig.value = true;
  try {
    const { data } = await http.put('/settings/manager', form.value);
    form.value = data;
    ElMessage.success('已保存');
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '保存失败');
  } finally {
    savingConfig.value = false;
  }
}

async function refreshProcess() {
  processStatus.value = await dashboard.fetchProcessStatus();
  logs.value = await dashboard.fetchProcessLogs(200);
}

async function doProcessAction(action) {
  try {
    if (action === 'start') await dashboard.startProcess();
    if (action === 'stop') await dashboard.stopProcess();
    if (action === 'restart') await dashboard.restartProcess();
    ElMessage.success('操作已发送');
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '操作失败');
  }
  await refreshProcess();
}

async function changePassword() {
  savingPw.value = true;
  try {
    await http.put('/settings/password', pwForm);
    pwForm.currentPassword = '';
    pwForm.newPassword = '';
    ElMessage.success('密码已修改');
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '修改失败');
  } finally {
    savingPw.value = false;
  }
}

onMounted(() => {
  loadConfig();
  refreshProcess();
  timer = setInterval(refreshProcess, 5000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<style scoped>
.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  margin-top: 4px;
}
.form-hint code {
  background: var(--el-fill-color-light);
  padding: 1px 4px;
  border-radius: 3px;
}
.process-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logs {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  max-height: 260px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
