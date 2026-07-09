import { defineStore } from 'pinia';
import http from '../api/http.js';

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    summary: null,
    managerStatus: null,
    processLogs: [],
  }),
  actions: {
    async fetchSummary() {
      const { data } = await http.get('/dashboard/summary');
      this.summary = data;
    },
    async fetchTraffic(days = 7) {
      const { data } = await http.get('/dashboard/traffic', { params: { days } });
      return data;
    },
    async fetchManagerStatus() {
      const { data } = await http.get('/manager/status');
      this.managerStatus = data;
      return data;
    },
    async syncManager() {
      const { data } = await http.post('/manager/sync');
      return data;
    },
    async fetchProcessStatus() {
      const { data } = await http.get('/process/status');
      return data;
    },
    async fetchProcessLogs(tail = 200) {
      const { data } = await http.get('/process/logs', { params: { tail } });
      this.processLogs = data.logs;
      return data.logs;
    },
    async startProcess() {
      await http.post('/process/start');
    },
    async stopProcess() {
      await http.post('/process/stop');
    },
    async restartProcess() {
      await http.post('/process/restart');
    },
  },
});
