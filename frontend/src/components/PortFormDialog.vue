<template>
  <el-dialog :model-value="modelValue" :title="isEdit ? '编辑端口' : '新增端口'" width="480px" @update:model-value="$emit('update:modelValue', $event)">
    <el-form :model="form" label-width="90px">
      <el-form-item label="端口号">
        <el-input-number v-model="form.server_port" :min="1" :max="65535" :disabled="isEdit" style="width: 100%" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password">
          <template #append>
            <el-button @click="form.password = randomPassword()">随机</el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item label="加密方式">
        <el-select v-model="form.method" style="width: 100%">
          <el-option v-for="m in methods" :key="m" :label="m" :value="m" />
        </el-select>
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
const form = reactive({
  server_port: randomPort(),
  password: randomPassword(),
  method: 'aes-256-gcm',
  remark: '',
  enabled: true,
});

function randomPort() {
  return 20000 + Math.floor(Math.random() * 30000);
}
function randomPassword() {
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36)).join('').slice(0, 16);
}

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
      });
    } else {
      Object.assign(form, {
        server_port: randomPort(),
        password: randomPassword(),
        method: 'aes-256-gcm',
        remark: '',
        enabled: true,
      });
    }
  }
);

async function onSave() {
  saving.value = true;
  try {
    await props.saveFn({ ...form });
    emit('saved');
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(err.response?.data?.error ?? '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>
