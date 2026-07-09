<template>
  <el-dialog :model-value="modelValue" :title="isEdit ? '编辑端口' : '新增端口'" width="480px" @update:model-value="$emit('update:modelValue', $event)">
    <el-form :model="form" label-width="90px">
      <el-form-item label="端口号">
        <el-input-number v-model="form.server_port" :min="1" :max="65535" :disabled="isEdit" style="width: 100%" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password">
          <template #append>
            <el-button @click="form.password = randomPassword(form.method)">随机</el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item label="加密方式">
        <el-select v-model="form.method" style="width: 100%" @change="form.password = randomPassword(form.method)">
          <el-option v-for="m in methods" :key="m" :label="m" :value="m" />
        </el-select>
      </el-form-item>
      <el-form-item label="流量限制">
        <el-input-number v-model="form.trafficLimitGb" :min="0" :precision="2" :step="10" style="width: 100%" />
        <div class="form-hint">
          单位 GB，0 表示不限；超过限额会自动禁用该端口
          <template v-if="isEdit">（已用 {{ formatBytes(props.port?.total_bytes) }}）</template>
        </div>
      </el-form-item>
      <el-form-item label="过期时间">
        <el-date-picker
          v-model="form.expiresAt"
          type="datetime"
          placeholder="留空表示永不过期"
          style="width: 100%"
          :disabled-date="isPastDate"
        />
        <div class="form-hint">到期后会自动禁用该端口</div>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" placeholder="例如：给张三用" />
      </el-form-item>
      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { formatBytes } from '../utils/format.js';

const GB = 1024 ** 3;

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  port: { type: Object, default: null },
  saveFn: { type: Function, required: true }, // (formData) => Promise
});
const emit = defineEmits(['update:modelValue', 'saved']);

const methods = [
  'aes-256-gcm',
  'aes-128-gcm',
  'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305',
  '2022-blake3-aes-256-gcm',
];

const isEdit = ref(false);
const saving = ref(false);

function randomPort() {
  return 20000 + Math.floor(Math.random() * 30000);
}

function isPastDate(date) {
  return date.getTime() < Date.now() - 86400000;
}

// shadowsocks-2022 methods (SIP022) don't derive a key from an arbitrary
// passphrase like the classic AEAD ciphers do — the password field must
// literally be a base64-encoded key of the method's exact byte length, or
// the server rejects the port as "invalid server".
const KEY_BYTES_2022 = {
  '2022-blake3-aes-128-gcm': 16,
  '2022-blake3-aes-256-gcm': 32,
  '2022-blake3-chacha20-poly1305': 32,
};
function randomPassword(method) {
  const keyBytes = KEY_BYTES_2022[method];
  if (keyBytes) {
    return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(keyBytes))));
  }
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36)).join('').slice(0, 16);
}

const form = reactive({
  server_port: randomPort(),
  password: randomPassword('aes-256-gcm'),
  method: 'aes-256-gcm',
  remark: '',
  enabled: true,
  trafficLimitGb: 0,
  expiresAt: null,
});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    isEdit.value = !!props.port;
    if (props.port) {
      Object.assign(form, {
        server_port: props.port.server_port,
        password: props.port.password,
        method: props.port.method,
        remark: props.port.remark ?? '',
        enabled: !!props.port.enabled,
        trafficLimitGb: (props.port.traffic_limit_bytes ?? 0) / GB,
        expiresAt: props.port.expires_at ? new Date(props.port.expires_at) : null,
      });
    } else {
      Object.assign(form, {
        server_port: randomPort(),
        password: randomPassword('aes-256-gcm'),
        method: 'aes-256-gcm',
        remark: '',
        enabled: true,
        trafficLimitGb: 0,
        expiresAt: null,
      });
    }
  }
);

async function onSave() {
  saving.value = true;
  try {
    const { trafficLimitGb, expiresAt, ...rest } = form;
    await props.saveFn({
      ...rest,
      traffic_limit_bytes: Math.round(trafficLimitGb * GB),
      expires_at: expiresAt instanceof Date ? expiresAt.toISOString() : null,
    });
    emit('saved');
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  margin-top: 4px;
}
</style>
