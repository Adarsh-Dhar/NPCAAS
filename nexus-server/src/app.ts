import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

type NPC = { npcName: string; agentId: string; sessionId: string };
const activeGames: Record<string, NPC[]> = {};

// 1. Create a new game lobby
app.post('/api/create-game', (req: Request, res: Response) => {
    const gameId = 'LOBBY-' + Math.floor(1000 + Math.random() * 9000);
    activeGames[gameId] = [];
    console.log(`[Server] New game created: ${gameId}`);
    res.json({ gameId });
});

// 2. Join a game and deploy an NPC
app.post('/api/join-game', (req: Request, res: Response) => {
    const { gameId, npcName, agentId, sessionId } = req.body as Partial<NPC & { gameId?: string }>;

    if (!gameId || !activeGames[gameId]) {
        return res.status(404).json({ error: `Game ${gameId} not found.` });
    }

    const newNpc: NPC = { npcName: String(npcName || 'unknown'), agentId: String(agentId || ''), sessionId: String(sessionId || '') };
    activeGames[gameId].push(newNpc);

    console.log(`[Server] ${newNpc.npcName} joined ${gameId}!`);
    console.log(`[Server]   Agent: ${newNpc.agentId} | Session: ${newNpc.sessionId}`);

    res.json({ success: true, lobbyUrl: `http://localhost:${PORT}/lobby/${gameId}` });
});

// 3. View the lobby in your browser
app.get('/lobby/:gameId', (req: Request, res: Response) => {
    const gameId = String(req.params.gameId);
    if (!activeGames[gameId]) return res.status(404).send('<h1>Lobby not found</h1>');

    const players = activeGames[gameId];
    let html = `<h1>Metaverse: ${gameId}</h1><h2>Active NPCs:</h2><ul>`;
    if (players.length === 0) html += `<li>Waiting for players...</li>`;
    else players.forEach((p: NPC) => (html += `<li><strong>${p.npcName}</strong> (Agent ID: <code>${p.agentId}</code>)</li>`));
    html += `</ul>`;
    res.send(html);
});

// Start server
app.listen(PORT, () => {
    console.log(`🎮 Nexus Metaverse Server running on http://localhost:${PORT}`);
});