<template>
  <el-card style="margin-top: 16px">
    <template #header>
      <div class="tokens-header">
        <span>API Token</span>
        <el-button size="small" type="primary" @click="openCreate">生成新 Token</el-button>
      </div>
    </template>
    <p class="hint">
      第三方可以用 <code>Authorization: Bearer &lt;token&gt;</code> 调用面板现有的所有 API（节点管理、状态查询等），权限等同于管理员登录，请像对待密码一样保管好；泄露后请立即撤销。
    </p>
    <el-table :data="tokens" v-loading="loading" style="width: 100%" empty-text="还没有创建过 Token">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="Token 前缀" width="170">
        <template #default="{ row }"><code>{{ row.token_prefix }}…</code></template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="最后使用" width="170">
        <template #default="{ row }">{{ row.last_used_at ? formatDateTime(row.last_used_at) : '从未使用' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-popconfirm title="确定撤销该 Token？撤销后无法恢复" @confirm="revoke(row)">
            <template #reference>
              <el-button link type="danger">撤销</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="createOpen" title="生成新 Token" width="420px">
    <el-form label-width="80px">
      <el-form-item label="名称">
        <el-input v-model="newName" placeholder="例如：monitoring-script" @keyup.enter="doCreate" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createOpen = false">取消</el-button>
      <el-button type="primary" :loading="creating" @click="doCreate">生成</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="revealOpen" title="Token 已生成" width="520px" :close-on-click-modal="false" :show-close="false">
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="请立即复制保存，关闭本窗口后将无法再次查看完整 Token"
      style="margin-bottom: 12px"
    />
    <el-input :model-value="createdToken" readonly>
      <template #append>
        <el-button @click="copyToken">复制</el-button>
      </template>
    </el-input>
    <template #footer>
      <el-button type="primary" @click="revealOpen = false">我已保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import http from '../api/http.js';
import { formatDateTime } from '../utils/format.js';

const tokens = ref([]);
const loading = ref(false);
const createOpen = ref(false);
const newName = ref('');
const creating = ref(false);
const revealOpen = ref(false);
const createdToken = ref('');

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get('/tokens');
    tokens.value = data;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  newName.value = '';
  createOpen.value = true;
}

async function doCreate() {
  if (!newName.value.trim()) {
    ElMessage.error('请输入名称');
    return;
  }
  creating.value = true;
  try {
    const { data } = await http.post('/tokens', { name: newName.value.trim() });
    createdToken.value = data.token;
    createOpen.value = false;
    revealOpen.value = true;
    await load();
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '生成失败');
  } finally {
    creating.value = false;
  }
}

async function revoke(row) {
  try {
    await http.delete(`/tokens/${row.id}`);
    ElMessage.success('已撤销');
    await load();
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '撤销失败');
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(createdToken.value);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败，请手动选中复制');
  }
}

onMounted(load);
</script>

<style scoped>
.tokens-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  margin: 0 0 12px;
}
</style>
