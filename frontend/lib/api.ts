const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} on ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Broker {
  brokerName: string;
  agentId: string;
  sessionId: string;
  status: 'NEGOTIATING' | 'SETTLING' | 'IDLE';
  joinedAt: string;
  sessionLimit: number;
  maxLimit: number;
  lastActive: string;
  poolId?: string;
}

export interface Trade {
  id: string;
  poolId: string;
  brokerName: string;
  asset: string;
  price: string;
  status: 'PENDING' | 'ACTIVE' | 'SETTLED';
  txHash: string;
  timestamp: string;
  createdAt: string;
  agents: string[];
  negotiation?: Record<string, unknown> | null;
}

export interface Pool {
  poolId: string;
  brokers: Broker[];
  tradeCount: number;
  createdAt: string;
}

export interface FeedActivity {
  type: 'POOL_CREATED' | 'BROKER_JOINED' | 'NEGOTIATION' | 'SETTLEMENT';
  poolId: string;
  tradeId?: string;
  timestamp: string;
  content: string;
  isBlurred: boolean;
  isSettlement: boolean;
  txHash?: string;
  trade?: Trade;
}

export interface GlobalState {
  pools: { poolId: string; brokerCount: number; tradeCount: number }[];
  trades: Trade[];
}

export interface PoolState {
  poolId: string;
  brokers: Broker[];
  trades: Trade[];
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const api = {
  health: () => apiFetch<{ status: string; timestamp: number }>('/api/health'),

  getState: () =>
    apiFetch<{ pools: Pool[]; trades: Trade[] }>('/api/state'),

  getPools: () => apiFetch<Pool[]>('/api/pools'),

  getPool: (poolId: string) =>
    apiFetch<Pool & { negotiations: unknown[]; trades: Trade[] }>(`/api/pools/${poolId}`),

  createPool: () => apiFetch<{ poolId: string }>('/api/create-pool', { method: 'POST' }),

  joinPool: (data: { poolId: string; brokerName: string; agentId: string; sessionId: string }) =>
    apiFetch<{ success: boolean; message: string }>('/api/join-pool', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  executeTrade: (data: {
    poolId: string;
    brokerName: string;
    asset: string;
    price: string | number;
    negotiation?: Record<string, unknown>;
  }) =>
    apiFetch<{ success: boolean; txHash: string; tradeId: string }>('/api/execute-trade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTrades: () => apiFetch<Trade[]>('/api/trades'),

  getTrade: (id: string) => apiFetch<Trade>(`/api/trades/${id}`),

  getAgents: () => apiFetch<Broker[]>('/api/agents'),
};