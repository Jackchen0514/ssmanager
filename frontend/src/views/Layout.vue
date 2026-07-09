<template>
  <el-container class="layout">
    <el-aside width="200px" class="layout__aside">
      <div class="layout__brand">SS 面板</div>
      <el-menu :default-active="$route.path" router class="layout__menu">
        <el-menu-item index="/dashboard">
          <span>概览</span>
        </el-menu-item>
        <el-menu-item index="/ports">
          <span>端口管理</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <span>设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="layout__header">
        <span>{{ auth.username }}</span>
        <el-button link @click="logout">退出登录</el-button>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const router = useRouter();

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.layout {
  height: 100vh;
}
.layout__aside {
  border-right: 1px solid var(--el-border-color);
}
.layout__brand {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 16px;
}
.layout__menu {
  border-right: none;
}
.layout__header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border-bottom: 1px solid var(--el-border-color);
}
</style>
