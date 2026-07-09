<template>
  <el-dialog :model-value="modelValue" title="分享" width="380px" @update:model-value="$emit('update:modelValue', $event)">
    <div v-if="!serverHost" class="hint">
      尚未在「设置」中配置服务器公网地址，无法生成分享链接。
    </div>
    <div v-else class="share">
      <img :src="qrDataUrl" alt="QR code" class="share__qr" />
      <el-input :model-value="ssUrl" readonly>
        <template #append>
          <el-button @click="copy">复制</el-button>
        </template>
      </el-input>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import QRCode from 'qrcode';
import { ElMessage } from 'element-plus';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  port: { type: Object, default: null },
  serverHost: { type: String, default: '' },
});
defineEmits(['update:modelValue']);

const qrDataUrl = ref('');

const ssUrl = computed(() => {
  if (!props.port || !props.serverHost) return '';
  const userInfo = btoa(`${props.port.method}:${props.port.password}`);
  const tag = props.port.remark ? `#${encodeURIComponent(props.port.remark)}` : '';
  return `ss://${userInfo}@${props.serverHost}:${props.port.server_port}${tag}`;
});

watch(
  () => [props.modelValue, ssUrl.value],
  async ([open]) => {
    if (open && ssUrl.value) {
      qrDataUrl.value = await QRCode.toDataURL(ssUrl.value, { width: 220, margin: 1 });
    }
  },
  { immediate: true }
);

function copy() {
  navigator.clipboard.writeText(ssUrl.value);
  ElMessage.success('已复制到剪贴板');
}
</script>

<style scoped>
.share {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.share__qr {
  width: 220px;
  height: 220px;
}
.hint {
  color: var(--el-text-color-secondary);
}
</style>
