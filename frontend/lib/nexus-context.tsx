'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { api, Broker, Trade, FeedActivity, GlobalState } from '@/lib/api';
import type { Socket } from 'socket.io-client';

interface NexusContextValue {
  // Connection
  connected: boolean;
  serverOnline: boolean;

  // Data
  agents: Broker[];
  trades: Trade[];
  feedItems: FeedActivity[];
  pools: GlobalState['pools'];

  // Derived stats
  activeEnclaves: number;
  totalVolume: string;

  // Actions
  refetch: () => void;
  clearFeed: () => void;
}

const NexusContext = createContext<NexusContextValue | null>(null);

export function useNexus() {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error('useNexus must be used inside NexusProvider');
  return ctx;
}

const MAX_FEED_ITEMS = 200;

export function NexusProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [agents, setAgents] = useState<Broker[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [feedItems, setFeedItems] = useState<FeedActivity[]>([]);
  const [pools, setPools] = useState<GlobalState['pools']>([]);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── REST fetch ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      await api.health();
      setServerOnline(true);

      const [agentsData, tradesData, stateData] = await Promise.all([
        api.getAgents(),
        api.getTrades(),
        api.getState(),
      ]);

      setAgents(agentsData);
      setTrades(tradesData);
      setPools(stateData.pools.map(p => ({
        poolId: p.poolId,
        brokerCount: p.brokers ? p.brokers.length : 0,
        tradeCount: p.tradeCount,
      })));
    } catch {
      setServerOnline(false);
    }
  }, []);

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-global');
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Global state update (brokers, pools, trades)
    socket.on('global:state', (data: GlobalState) => {
      setPools(data.pools || []);
      if (data.trades && data.trades.length > 0) {
        setTrades(data.trades);
      }
    });

    // Live feed activity
    socket.on('feed:activity', (item: FeedActivity) => {
      setFeedItems(prev => {
        const next = [item, ...prev];
        return next.slice(0, MAX_FEED_ITEMS);
      });

      // If it's a settlement, update trades and agents
      if (item.type === 'SETTLEMENT' && item.trade) {
        setTrades(prev => {
          const exists = prev.find(t => t.id === item.trade!.id);
          if (exists) return prev;
          return [item.trade!, ...prev];
        });
      }
    });

    // Pool-level broker/trade updates
    socket.on('pool:state', (data: { poolId: string; brokers: Broker[]; trades: Trade[] }) => {
      setAgents(prev => {
        const withPoolId = (data.brokers || []).map(b => ({ ...b, poolId: data.poolId }));
        const filtered = prev.filter(a => a.poolId !== data.poolId);
        return [...filtered, ...withPoolId];
      });
    });

    socket.on('pool:trade-settled', (trade: Trade) => {
      setTrades(prev => {
        const exists = prev.find(t => t.id === trade.id);
        if (exists) return prev;
        return [trade, ...prev];
      });
    });

    socket.on('pool:broker-joined', () => {
      fetchAll();
    });

    // Pool negotiation activity (blurred)
    socket.on('pool:negotiation', (data: {
      poolId: string;
      timestamp: string;
      from: string;
      action: string;
      isBlurred: boolean;
    }) => {
      setFeedItems(prev => {
        const item: FeedActivity = {
          type: 'NEGOTIATION',
          poolId: data.poolId,
          timestamp: data.timestamp,
          content: `Private negotiation session ${data.poolId} — activity detected`,
          isBlurred: true,
          isSettlement: false,
        };
        return [item, ...prev].slice(0, MAX_FEED_ITEMS);
      });

      // Mark the agent as negotiating
      setAgents(prev =>
        prev.map(a =>
          a.brokerName === data.from
            ? { ...a, status: 'NEGOTIATING', lastActive: new Date().toISOString() }
            : a
        )
      );
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('global:state');
      socket.off('feed:activity');
      socket.off('pool:state');
      socket.off('pool:trade-settled');
      socket.off('pool:broker-joined');
      socket.off('pool:negotiation');
    };
  }, [fetchAll]);

  // ── Polling (fallback + initial load) ──────────────────────────────────────
  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAll]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeEnclaves = pools.length;

  const totalVolume = (() => {
    const total = trades.reduce((sum, t) => {
      const n = parseFloat(t.price.replace(/[^0-9.]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    if (total >= 1_000_000) return `$${(total / 1_000_000).toFixed(1)}M`;
    if (total >= 1_000) return `$${(total / 1_000).toFixed(1)}K`;
    return `$${total.toFixed(2)}`;
  })();

  const clearFeed = useCallback(() => setFeedItems([]), []);

  return (
    <NexusContext.Provider value={{
      connected,
      serverOnline,
      agents,
      trades,
      feedItems,
      pools,
      activeEnclaves,
      totalVolume,
      refetch: fetchAll,
      clearFeed,
    }}>
      {children}
    </NexusContext.Provider>
  );
}