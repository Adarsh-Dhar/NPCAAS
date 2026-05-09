# NEXUS OTC Routing Implementation Guide

## Overview

The NEXUS OTC application now features a complete multi-route Next.js App Router structure with a persistent layout system. All routes maintain the cohesive 3-section design (Header, Sidebar, Main Feed) across navigation.

## Route Structure

```
/                  → Dashboard home (live matching engine)
/agents            → Agent list view with all deployed brokers
/agents/[id]       → Individual agent detail page
/trades            → Trade ledger with all negotiations
/trades/[id]       → Individual trade detail page
/settings          → Configuration and system settings
```

## Key Components

### Core Layout Components

1. **NexusLayout** (`components/nexus-layout.tsx`)
   - Persistent wrapper providing 3-section layout
   - Header (100% width), Sidebar (30%), Main content (70%)
   - Applied to all route pages for consistency

2. **NexusHeader** (`components/header/nexus-header.tsx`)
   - Top navigation bar with logo, status, and metrics
   - Navigation links with active state detection
   - Real-time connection indicator

3. **AgentFleet** (`components/sidebar/agent-fleet.tsx`)
   - Left sidebar showing deployed brokers
   - Scrollable list of agent cards
   - Clickable navigation to agent details

### Content Components

4. **LiveMatchingEngine** (`components/main-feed/live-matching-engine.tsx`)
   - Main feed displaying transaction ledger
   - Real-time matching engine simulation
   - Scrollable transaction history

5. **AgentCard** (`components/agent-card.tsx`)
   - Individual agent representation
   - Status badges (NEGOTIATING, SETTLING, IDLE)
   - Progress bar showing session capacity
   - Clickable for navigation to detail page

6. **LedgerRow** (`components/ledger-row.tsx`)
   - Transaction row with timestamp and content
   - Blur effect for private negotiations
   - Special styling for settlement transactions

## Page Implementation

### Dashboard Home (`app/page.tsx`)
- Entry point showing live matching engine
- Displays main transaction ledger
- Agent sidebar for quick access

### Agents Section (`app/agents/page.tsx`)
- Grid view of all deployed brokers
- Shows agent status and session limits
- Each card links to detailed agent view

### Agent Detail (`app/agents/[id]/page.tsx`)
- Comprehensive agent information
- Status, limits, and recent activity
- Back navigation to agents list

### Trades Section (`app/trades/page.tsx`)
- Full ledger of all negotiations and trades
- Trade status badges (PENDING, ACTIVE, SETTLED)
- Sortable by agent, amount, and status
- Clickable trades for detailed view

### Trade Detail (`app/trades/[id]/page.tsx`)
- Complete trade information
- Participating agents and amounts
- Settlement status and transaction hash
- Back navigation to trades list

### Settings (`app/settings/page.tsx`)
- Network configuration overview
- Agent settings and security information
- System version and protocol details

## Navigation Features

- **Active Link Detection**: Header shows active route with green underline
- **Breadcrumb Navigation**: Back arrows on detail pages
- **Logo Navigation**: Click NEXUS OTC header to return home
- **Sidebar Links**: Agent cards link directly to `/agents/[id]`
- **Trade Links**: Trade cards link directly to `/trades/[id]`

## Data Flow

### Mock Data Structure (`lib/mock-data.ts`)

```typescript
agents[]        // 3 sample trading brokers
transactions[]  // 5 recent transactions in ledger
trades[]        // 3 sample trade records
```

### Type Definitions (`lib/types.ts`)

```typescript
Agent          // id, name, status, sessionLimit, maxLimit, lastActive
Transaction    // id, timestamp, content, isSettlement, isBlurred
Trade          // id, agents[], amount, status, createdAt, details
```

## Styling Consistency

- **Font**: Space Mono monospace font globally applied
- **Colors**: Terminal-green color scheme (green-400, green-500, green-700)
- **Theme**: Dark mode (black background, green text)
- **Responsive**: 30/70 sidebar/content split
- **Effects**: Blur animations, hover states, pulsing indicators

## Features Implemented

✓ Multi-route navigation system
✓ Dynamic route parameters ([id])
✓ Persistent layout across all pages
✓ Active route detection in header
✓ Type-safe data structures
✓ Mock data for realistic content
✓ Scrollable areas with ScrollArea component
✓ Hover effects and transitions
✓ Terminal-style aesthetic
✓ Private data blur effects
✓ Settlement status indicators

## Future Enhancements

- Connect to real API instead of mock data
- Add search/filter functionality
- Implement real-time WebSocket updates
- Add user authentication
- Create agent configuration management
- Add transaction export functionality
