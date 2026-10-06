import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../layout/Layout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '工作台', icon: 'Odometer', roles: ['admin', 'operator', 'farmer', 'warehouse', 'aftersales'] } },
      { path: 'products', name: 'Products', component: () => import('../views/Products.vue'), meta: { title: '商品与批次', icon: 'Goods', roles: ['admin', 'operator', 'farmer'] } },
      { path: 'selections', name: 'Selections', component: () => import('../views/Selections.vue'), meta: { title: '选品质检', icon: 'Stamp', roles: ['admin', 'operator'] } },
      { path: 'livestreams', name: 'Livestreams', component: () => import('../views/Livestreams.vue'), meta: { title: '直播排期', icon: 'VideoCamera', roles: ['admin', 'operator'] } },
      { path: 'inventory', name: 'Inventory', component: () => import('../views/Inventory.vue'), meta: { title: '库存锁定', icon: 'Lock', roles: ['admin', 'operator', 'warehouse'] } },
      { path: 'orders', name: 'Orders', component: () => import('../views/Orders.vue'), meta: { title: '订单管理', icon: 'Tickets', roles: ['admin', 'operator'] } },
      { path: 'shipping', name: 'Shipping', component: () => import('../views/Shipping.vue'), meta: { title: '发货任务', icon: 'Van', roles: ['admin', 'warehouse'] } },
      { path: 'aftersales', name: 'Aftersales', component: () => import('../views/Aftersales.vue'), meta: { title: '售后工单', icon: 'Service', roles: ['admin', 'operator', 'aftersales'] } },
      { path: 'defect-alerts', name: 'DefectAlerts', component: () => import('../views/DefectAlerts.vue'), meta: { title: '坏果预警', icon: 'AlarmClock', roles: ['admin', 'operator', 'aftersales', 'warehouse'] } },
      { path: 'settlements', name: 'Settlements', component: () => import('../views/Settlements.vue'), meta: { title: '农户结算', icon: 'Wallet', roles: ['admin', 'operator', 'farmer'] } },
      { path: 'risks', name: 'Risks', component: () => import('../views/Risks.vue'), meta: { title: '风险中心', icon: 'Warning', roles: ['admin', 'operator', 'warehouse', 'aftersales'] } },
      { path: 'notices', name: 'Notices', component: () => import('../views/Notices.vue'), meta: { title: '品牌公告', icon: 'Bell', roles: ['admin', 'operator'] } },
      { path: 'analytics', name: 'Analytics', component: () => import('../views/Analytics.vue'), meta: { title: '复盘分析', icon: 'DataAnalysis', roles: ['admin', 'operator', 'aftersales'] } },
      { path: 'chain/:batchId', name: 'BatchChain', component: () => import('../views/BatchChain.vue'), meta: { title: '批次链路', icon: 'Connection', roles: ['admin', 'operator', 'farmer', 'warehouse', 'aftersales'] } },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (to.meta.public) return true;
  if (!token) return '/login';
  if (to.meta.roles && user && user.role !== 'admin' && !to.meta.roles.includes(user.role)) {
    return '/dashboard';
  }
  return true;
});

export default router;
