import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AlbumView from '../views/AlbumView.vue'
import SharedAlbumView from '../views/SharedAlbumView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/album/:id', name: 'album', component: AlbumView },
  { path: '/shared/:code', name: 'shared-album', component: SharedAlbumView },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
