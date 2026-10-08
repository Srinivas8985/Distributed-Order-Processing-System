const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://127.0.0.1:3000';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://127.0.0.1:3001';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://127.0.0.1:9090';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'dev-service-token-2024';

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unavailable';
  uptime?: number;
  timestamp?: string;
  version?: string;
  services?: any;
  error?: string;
}

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth': INTERNAL_SERVICE_TOKEN,
        ...options.headers,
      },
      signal: controller.signal,
      cache: 'no-store', // Always fetch fresh data for the console
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    throw error;
  }
};

export const api = {
  user: {
    health: async (): Promise<ServiceHealth> => {
      try {
        const res = await fetchWithTimeout(`${USER_SERVICE_URL}/ready`);
        if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          status: data.status === 'ready' ? 'healthy' : 'degraded',
          services: {
            database: { status: data.dependencies?.database === 'up' ? 'healthy' : 'unavailable' },
            rabbitmq: { status: data.dependencies?.rabbitmq === 'up' ? 'healthy' : 'unavailable' }
          }
        };
      } catch (e: any) {
        return { status: 'unavailable', error: e.message };
      }
    },
    getDlqEvents: async (status?: string) => {
      try {
        const url = new URL(`${USER_SERVICE_URL}/internal/dlq`);
        if (status) url.searchParams.append('status', status);
        const res = await fetchWithTimeout(url.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data;
      } catch (e: any) {
        console.error('getDlqEvents error:', e);
        return [];
      }
    },
    replayDlqEvent: async (id: string) => {
      const res = await fetchWithTimeout(`${USER_SERVICE_URL}/internal/dlq/${id}/replay`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to replay event (HTTP ${res.status})`);
      }
      return await res.json();
    },
    getFaults: async () => {
      try {
        const res = await fetchWithTimeout(`${USER_SERVICE_URL}/internal/faults`);
        if (!res.ok) return [];
        return await res.json();
      } catch (e) {
        return [];
      }
    },
    setFault: async (config: any) => {
      const res = await fetchWithTimeout(`${USER_SERVICE_URL}/internal/faults`, { method: 'POST', body: JSON.stringify(config) });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },
    disableAllFaults: async () => {
      await fetchWithTimeout(`${USER_SERVICE_URL}/internal/faults/disable-all`, { method: 'POST' });
    }
  },
  order: {
    health: async (): Promise<ServiceHealth> => {
      try {
        const res = await fetchWithTimeout(`${ORDER_SERVICE_URL}/ready`);
        if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          status: data.status === 'ready' ? 'healthy' : 'degraded',
          services: {
            database: { status: data.dependencies?.database === 'up' ? 'healthy' : 'unavailable' },
            rabbitmq: { status: data.dependencies?.rabbitmq === 'up' ? 'healthy' : 'unavailable' }
          }
        };
      } catch (e: any) {
        return { status: 'unavailable', error: e.message };
      }
    },
    getOutboxStats: async () => {
      try {
        const res = await fetchWithTimeout(`${ORDER_SERVICE_URL}/internal/outbox/stats`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e: any) {
        return { total: 0, pending: 0, published: 0, failed: 0 };
      }
    },
    getOutboxEvents: async (status?: string) => {
      try {
        const url = new URL(`${ORDER_SERVICE_URL}/internal/outbox`);
        if (status) url.searchParams.append('status', status);
        const res = await fetchWithTimeout(url.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data;
      } catch (e: any) {
        return [];
      }
    },
    getFaults: async () => {
      try {
        const res = await fetchWithTimeout(`${ORDER_SERVICE_URL}/internal/faults`);
        if (!res.ok) return [];
        return await res.json();
      } catch (e) {
        return [];
      }
    },
    setFault: async (config: any) => {
      const res = await fetchWithTimeout(`${ORDER_SERVICE_URL}/internal/faults`, { method: 'POST', body: JSON.stringify(config) });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },
    disableAllFaults: async () => {
      await fetchWithTimeout(`${ORDER_SERVICE_URL}/internal/faults/disable-all`, { method: 'POST' });
    }
  },
  prometheus: {
    query: async (query: string): Promise<any> => {
      try {
        const url = new URL(`${PROMETHEUS_URL}/api/v1/query`);
        url.searchParams.append('query', query);
        const res = await fetchWithTimeout(url.toString(), {}, 2000);
        if (!res.ok) return null;
        const json = await res.json();
        return json.data?.result || [];
      } catch (e) {
        console.error('Prometheus fetch error:', e);
        return null;
      }
    }
  }
};
