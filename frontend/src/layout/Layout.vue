<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <el-icon :size="24" color="#67c23a"><Platform /></el-icon>
        <div>
          <div class="logo-title">县域农品直播</div>
          <div class="logo-sub">选品·质检·发货·售后</div>
        </div>
      </div>
      <el-menu :default-active="$route.path" router background-color="#1d2b1f" text-color="#b8cbb5" active-text-color="#a0d911">
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="crumb">{{ $route.meta.title || '工作台' }}</div>
        <div class="user">
          <el-tag size="small" effect="plain" type="success">{{ auth.roleName }}</el-tag>
          <span class="name">{{ auth.user?.name }}</span>
          <el-button link type="danger" @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const allMenus = [
  { path: '/dashboard', title: '工作台', icon: 'Odometer', roles: ['admin', 'operator', 'farmer', 'warehouse', 'aftersales'] },
  { path: '/products', title: '商品与批次', icon: 'Goods', roles: ['admin', 'operator', 'farmer'] },
  { path: '/selections', title: '选品质检', icon: 'Stamp', roles: ['admin', 'operator'] },
  { path: '/livestreams', title: '直播排期', icon: 'VideoCamera', roles: ['admin', 'operator'] },
  { path: '/inventory', title: '库存锁定', icon: 'Lock', roles: ['admin', 'operator', 'warehouse'] },
  { path: '/orders', title: '订单管理', icon: 'Tickets', roles: ['admin', 'operator'] },
  { path: '/shipping', title: '发货任务', icon: 'Van', roles: ['admin', 'warehouse'] },
  { path: '/aftersales', title: '售后工单', icon: 'Service', roles: ['admin', 'operator', 'aftersales'] },
  { path: '/settlements', title: '农户结算', icon: 'Wallet', roles: ['admin', 'operator', 'farmer'] },
  { path: '/risks', title: '风险中心', icon: 'Warning', roles: ['admin', 'operator', 'warehouse', 'aftersales'] },
  { path: '/defect-alerts', title: '坏果预警', icon: 'AlarmClock', roles: ['admin', 'operator', 'warehouse', 'aftersales'] },
  { path: '/notices', title: '品牌公告', icon: 'Bell', roles: ['admin', 'operator'] },
  { path: '/analytics', title: '复盘分析', icon: 'DataAnalysis', roles: ['admin', 'operator', 'aftersales'] },
];

const menus = computed(() =>
  allMenus.filter((m) => auth.role === 'admin' || m.roles.includes(auth.role)),
);

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.layout { min-height: 100vh; }
.aside { background: #1d2b1f; }
.logo { display: flex; align-items: center; gap: 10px; padding: 18px 16px; }
.logo-title { color: #fff; font-weight: 700; font-size: 16px; }
.logo-sub { color: #7d9a78; font-size: 11px; margin-top: 2px; }
.aside :deep(.el-menu) { border-right: none; }
.header { background: #fff; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e8ecef; }
.crumb { font-size: 16px; font-weight: 600; color: #303133; }
.user { display: flex; align-items: center; gap: 10px; }
.name { font-size: 14px; color: #606266; }
.main { background: #f5f7fa; padding: 16px; }
</style>
