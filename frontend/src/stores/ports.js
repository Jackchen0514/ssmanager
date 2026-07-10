import { defineStore } from 'pinia';
import http from '../api/http.js';

export const usePortsStore = defineStore('ports', {
  state: () => ({
    ports: [],
    loading: false,
  }),
  actions: {
    async fetchPorts() {
      this.loading = true;
      try {
        const { data } = await http.get('/ports');
        this.ports = data;
      } finally {
        this.loading = false;
      }
    },
    async createPort(payload) {
      await http.post('/ports', payload);
      await this.fetchPorts();
    },
    async updatePort(id, payload) {
      await http.put(`/ports/${id}`, payload);
      await this.fetchPorts();
    },
    async togglePort(id) {
      await http.post(`/ports/${id}/toggle`);
      await this.fetchPorts();
    },
    async deletePort(id) {
      await http.delete(`/ports/${id}`);
      await this.fetchPorts();
    },
    async resetTraffic(id) {
      await http.post(`/ports/${id}/reset-traffic`);
      await this.fetchPorts();
    },
    async fetchTraffic(id, days = 7) {
      const { data } = await http.get(`/ports/${id}/traffic`, { params: { days } });
      return data;
    },
    async fetchConnStat(id) {
      const { data } = await http.get(`/ports/${id}/conn-stat`);
      return data;
    },
  },
});
