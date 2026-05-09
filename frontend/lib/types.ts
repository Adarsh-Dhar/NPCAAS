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
