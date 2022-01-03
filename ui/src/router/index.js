import Vue from 'vue'
import VueRouter from 'vue-router'
import Home from '../views/Home.vue'
import auth_state from '@/state'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: {
      requiresAuth: true,
    }
  },
  {
    path: '/help',
    name: 'Help',
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import(/* webpackChunkName: "help" */ '../views/Help.vue'),
    meta: {
      requiresAuth: false,
    }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import(/* webpackChunkName: "login" */ '../views/Login.vue'),
    meta: {
      requiresAuth: false,
    }
  },
  {
    path: '/forgot',
    name: 'Forgot',
    component: () => import(/* webpackChunkName: "forgot" */ '../views/Forgot.vue'),
    meta: {
      requiresAuth: false,
    }
  },
  {
    path: '/detail-view',
    name: 'DetailView',
    component: () => import(/* webpackChunkName: "detailview" */ '../views/DetailView.vue'),
    meta: {
      requiresAuth: true,
    }
  },
  {
    path: '/myaccount',
    name: 'Account',
    component: () => import(/* webpackChunkName: "account" */ '../views/account/Account.vue'),
    meta: {
      requiresAuth: true,
    }
  },
  {
    path: '/myaccount/password',
    name: 'Password',
    component: () => import(/* webpackChunkName: "password" */ '../views/account/Password.vue'),
    meta: {
      requiresAuth: true,
    }
  },
  {
    path: '/purchase',
    component: () => import(/* webpackChunkName: "purchase" */ '../views/purchase/Purchase.vue'),
    children: [
      {
        path:'/',
        component: () => import(/* webpackChunkName: "purchase_home" */ '../views/purchase/PurchaseHome.vue'),
      },
      {
        path:'new',
        component: () => import(/* webpackChunkName: "purchase_new" */ '../views/purchase/PurchaseNew.vue'),
      },
      {
        path:'approve',
        component: () => import(/* webpackChunkName: "purchase_approve" */ '../views/purchase/PurchaseApprove.vue'),
      },
      {
        path:'complete',
        component: () => import(/* webpackChunkName: "purchase_complete" */ '../views/purchase/PurchaseComplete.vue'),
      },
      {
        path:'view',
        component: () => import(/* webpackChunkName: "purchase_view" */ '../views/purchase/PurchaseView.vue'),
      }
    ],
    meta: {
      requiresAuth: true,
    }
  }
]

const router = new VueRouter({
  routes,
  base: process.env.BASE_URL,
  mode: 'history',
});

// Make sure user is logged in before moving
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(x => x.meta.requiresAuth);

  if (!requiresAuth) {
    next();
  }
  else if (requiresAuth && auth_state.state.uname !== '') {
    next();
  } else {
    const user = {
      apikey: '',
      uname: '',
      p_approvePerm: true,
    }
    if (document.cookie.split(';').some((item) => item.trim().startsWith('apikey='))) {
      user.apikey = document.cookie.split('; ').find(row => row.startsWith('apikey=')).split('=')[1];
    }
    if (document.cookie.split(';').some((item) => item.trim().startsWith('uname='))) {
      user.uname = document.cookie.split('; ').find(row => row.startsWith('uname=')).split('=')[1];
    }

    if (user.apikey !== '' || user.uname !== '') {
      auth_state.setAuthState(user);
      next();
    } else {
      next('/login');
    }
  }
});

export default router
