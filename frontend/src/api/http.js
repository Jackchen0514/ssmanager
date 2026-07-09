import axios from 'axios';
import { useAuthStore } from '../stores/auth.js';
import router from '../router/index.js';

const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((requestConfig) => {
  const auth = useAuthStore();
  if (auth.token) {
    requestConfig.headers.Authorization = `Bearer ${auth.token}`;
  }
  return requestConfig;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const auth = useAuthStore();
      auth.logout();
      router.push('/login');
    }
    return Promise.reject(error);
  }
);

export default http;
