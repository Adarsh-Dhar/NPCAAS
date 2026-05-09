export interface Agent {
  id: string;
  name: string;
  status: 'NEGOTIATING' | 'SETTLING' | 'IDLE';
  sessionLimit: number;
  maxLimit: number;
  lastActive: string;
  poolId?: string;
  sessionId?: string;
}

export interface Transaction {
  id: string;
  timestamp: string;
  content: string;
  isSettlement: boolean;
  isBlurred: boolean;
  poolId?: string;
  tradeId?: string;
  txHash?: string;
}

export interface Trade {
  id: string;
  agents: string[];
  amount: string;
  status: 'PENDING' | 'ACTIVE' | 'SETTLED';
  createdAt: string;
  details: string;
  poolId?: string;
  brokerName?: string;
  asset?: string;
  price?: string;
  txHash?: string;
  timestamp?: string;
  negotiation?: string | null;
}

export interface PoolSummary {
  poolId: string;
  brokerCount: number;
  tradeCount: number;
  createdAt?: string;
}

export interface NexusSnapshot {
  pools: PoolSummary[];
  trades: Trade[];
}

export interface CreatePoolResponse {
  poolId: string;
}

export interface JoinPoolPayload {
  poolId: string;
  brokerName: string;
  agentId: string;
  sessionId: string;
}

export interface ExecuteTradePayload {
  poolId: string;
  brokerName: string;
  asset: string;
  price: string;
  negotiation?: string | null;
}

export interface NegotiatePayload {
  poolId: string;
  msg: {
    action: string;
    amount: string;
    from: string;
    [key: string]: unknown;
  };
}

// API-compatible types (aliasing to server shapes used in frontend/lib/api.ts)
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

export interface ApiTrade {
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
  createdAt?: string;
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
  trade?: ApiTrade;
}

export interface GlobalState {
  pools: { poolId: string; brokerCount: number; tradeCount: number }[];
  trades: ApiTrade[];
}

export interface PoolState {
  poolId: string;
  brokers: Broker[];
  trades: ApiTrade[];
}
