<template>
  <div class="stat-tile">
    <div class="stat-tile__label">{{ label }}</div>
    <div class="stat-tile__value">{{ value }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
});
</script>

<style scoped>
.stat-tile__label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.stat-tile__value {
  font-size: 26px;
  font-weight: 600;
  margin-top: 4px;
}
</style>
