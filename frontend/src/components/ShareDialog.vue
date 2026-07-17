<template>
  <el-dialog :model-value="modelValue" title="分享" width="380px" @update:model-value="$emit('update:modelValue', $event)">
    <div v-if="!links.length" class="hint">
      尚未在「设置」中配置服务器公网地址，无法生成分享链接。
    </div>
    <el-tabs v-else-if="links.length > 1" v-model="activeTab">
      <el-tab-pane v-for="link in links" :key="link.key" :label="link.label" :name="link.key">
        <div class="share">
          <img :src="qrDataUrls[link.key]" alt="QR code" class="share__qr" />
          <el-input :model-value="link.url" readonly>
            <template #append>
              <el-button @click="copy(link.url)">复制</el-button>
            </template>
          </el-input>
        </div>
      </el-tab-pane>
    </el-tabs>
    <div v-else class="share">
      <img :src="qrDataUrls[links[0].key]" alt="QR code" class="share__qr" />
      <el-input :model-value="links[0].url" readonly>
        <template #append>
          <el-button @click="copy(links[0].url)">复制</el-button>
        </template>
      </el-input>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import QRCode from 'qrcode';
import { ElMessage } from 'element-plus';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  port: { type: Object, default: null },
  serverHost: { type: String, default: '' },
  serverHostV6: { type: String, default: '' },
});
defineEmits(['update:modelValue']);

const activeTab = ref('v4');
const qrDataUrls = reactive({});

// ss:// authority is host:port. A bare IPv6 literal must be bracketed
// ("[2001:db8::1]:8388") to stay unambiguous with the port separator;
// domain names and already-bracketed hosts are left untouched.
function formatHost(host) {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}

function buildSsUrl(host) {
  if (!props.port || !host) return '';
  const userInfo = btoa(`${props.port.method}:${props.port.password}`);
  const tag = props.port.remark ? `#${encodeURIComponent(props.port.remark)}` : '';
  return `ss://${userInfo}@${formatHost(host)}:${props.port.server_port}${tag}`;
}

const links = computed(() => {
  const result = [];
  const v4Url = buildSsUrl(props.serverHost);
  if (v4Url) result.push({ key: 'v4', label: 'IPv4', url: v4Url });
  const v6Url = buildSsUrl(props.serverHostV6);
  if (v6Url) result.push({ key: 'v6', label: 'IPv6', url: v6Url });
  return result;
});

watch(
  () => [props.modelValue, links.value],
  async ([open]) => {
    if (!open) return;
    for (const link of links.value) {
      qrDataUrls[link.key] = await QRCode.toDataURL(link.url, { width: 220, margin: 1 });
    }
  },
  { immediate: true, deep: true }
);

function copy(url) {
  navigator.clipboard.writeText(url);
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
