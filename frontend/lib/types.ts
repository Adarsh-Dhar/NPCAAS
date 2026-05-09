export interface Agent {
  id: string;
  name: string;
  status: 'NEGOTIATING' | 'SETTLING' | 'IDLE';
  sessionLimit: number;
  maxLimit: number;
  lastActive: string;
}

export interface Transaction {
  id: string;
  timestamp: string;
  content: string;
  isSettlement: boolean;
  isBlurred: boolean;
}

export interface Trade {
  id: string;
  agents: string[];
  amount: string;
  status: 'PENDING' | 'ACTIVE' | 'SETTLED';
  createdAt: string;
  details: string;
}
