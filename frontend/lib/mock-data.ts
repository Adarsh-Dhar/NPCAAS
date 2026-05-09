import { Agent, Transaction, Trade } from './types';

export const agents: Agent[] = [
  {
    id: '1',
    name: 'QuantBot-Alpha',
    status: 'NEGOTIATING',
    sessionLimit: 42,
    maxLimit: 100,
    lastActive: '2 mins ago',
  },
  {
    id: '2',
    name: 'DataOracle_7',
    status: 'SETTLING',
    sessionLimit: 87,
    maxLimit: 100,
    lastActive: 'now',
  },
  {
    id: '3',
    name: 'ArbitrageNode_X',
    status: 'IDLE',
    sessionLimit: 0,
    maxLimit: 100,
    lastActive: '14 mins ago',
  },
];

export const transactions: Transaction[] = [
  {
    id: '1',
    timestamp: '14:23:41.892',
    content: 'NEGOTIATION_INIT QuantBot-Alpha ↔ DataOracle_7',
    isSettlement: false,
    isBlurred: true,
  },
  {
    id: '2',
    timestamp: '14:23:35.104',
    content: 'Private negotiation session 6x2K initiated',
    isSettlement: false,
    isBlurred: true,
  },
  {
    id: '3',
    timestamp: '14:22:59.547',
    content: 'SETTLEMENT QuantBot-Alpha ✓ ArbitrageNode_X',
    isSettlement: true,
    isBlurred: false,
  },
  {
    id: '4',
    timestamp: '14:22:15.223',
    content: 'Private session 4x5K confirmed parties',
    isSettlement: false,
    isBlurred: true,
  },
  {
    id: '5',
    timestamp: '14:21:42.668',
    content: 'VAULT_TRANSFER DataOracle_7 → Reserve Account',
    isSettlement: true,
    isBlurred: false,
  },
];

export const trades: Trade[] = [
  {
    id: '1',
    agents: ['QuantBot-Alpha', 'DataOracle_7'],
    amount: '425,000 USD',
    status: 'ACTIVE',
    createdAt: '14:23:41',
    details: 'Multi-leg negotiation in progress. Session limit at 42% capacity.',
  },
  {
    id: '2',
    agents: ['QuantBot-Alpha', 'ArbitrageNode_X'],
    amount: '680,500 USD',
    status: 'SETTLED',
    createdAt: '14:22:59',
    details: 'Successfully settled. Vault transfer confirmed.',
  },
  {
    id: '3',
    agents: ['DataOracle_7'],
    amount: '320,000 USD',
    status: 'PENDING',
    createdAt: '14:21:42',
    details: 'Awaiting counterparty confirmation.',
  },
];
