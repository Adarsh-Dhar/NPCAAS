const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';

export interface PaymentTerms {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  payTo: string;
  asset: string;
  merchantName?: string;
  [key: string]: unknown;
}

export interface PaymentRequiredBody {
  error: string;
  accepts: PaymentTerms[];
  x402Version?: number;
  [key: string]: unknown;
}

export class PaymentRequiredError extends Error {
  status: number;
  path: string;
  body: PaymentRequiredBody;

  constructor(path: string, body: PaymentRequiredBody) {
    super(`API 402 on ${path}: ${body?.error || 'Payment Required'}`);
    this.name = 'PaymentRequiredError';
    this.status = 402;
    this.path = path;
    this.body = body;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  let parsedBody: unknown = null;
  try {
    parsedBody = await res.json();
  } catch {
    parsedBody = await res.text().catch(() => '');
  }

  if (!res.ok) {
    if (res.status === 402 && parsedBody && typeof parsedBody === 'object') {
      throw new PaymentRequiredError(path, parsedBody as PaymentRequiredBody);
    }
    const bodyText = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
    throw new Error(`API ${res.status} on ${path}: ${bodyText}`);
  }

  return parsedBody as T;
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
  buyer?: string;
  seller?: string;
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
    buyer?: string;
    seller?: string;
    asset: string;
    price: string | number;
    negotiation?: Record<string, unknown>;
    xPayment?: string;
  }) =>
    apiFetch<{ success: boolean; txHash: string; tradeId: string }>('/api/execute-trade', {
      method: 'POST',
      headers: data.xPayment ? { 'X-Payment': data.xPayment } : undefined,
      body: JSON.stringify(data),
    }),

  getTrades: () => apiFetch<Trade[]>('/api/trades'),

  getTrade: (id: string) => apiFetch<Trade>(`/api/trades/${id}`),

  getAgents: () => apiFetch<Broker[]>('/api/agents'),
};