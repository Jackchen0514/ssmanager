import { defineStore } from 'pinia';
import axios from 'axios';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('ss_token') || '',
    username: localStorage.getItem('ss_username') || '',
  }),
  getters: {
    isAuthenticated: (state) => !!state.token,
  },
  actions: {
    async login(username, password) {
      const { data } = await axios.post('/api/auth/login', { username, password });
      this.token = data.token;
      this.username = username;
      localStorage.setItem('ss_token', data.token);
      localStorage.setItem('ss_username', username);
    },
    logout() {
      this.token = '';
      this.username = '';
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_username');
    },
  },
});
