// server.js — Quick Nexus Metaverse Backend (plain JS)
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory database to store our active games and NPCs
const activeGames = {};

// 1. Create a new game lobby
app.post('/api/create-game', (req, res) => {
    const gameId = 'LOBBY-' + Math.floor(1000 + Math.random() * 9000);
    activeGames[gameId] = [];
    console.log(`[Server] New game created: ${gameId}`);
    res.json({ gameId: gameId });
});

// 2. Join a game and deploy an NPC
app.post('/api/join-game', (req, res) => {
    const { gameId, npcName, agentId, sessionId } = req.body;
    if (!activeGames[gameId]) {
        return res.status(404).json({ error: `Game ${gameId} not found.` });
    }
    const newNpc = { npcName, agentId, sessionId };
    activeGames[gameId].push(newNpc);
    console.log(`[Server] ${npcName} joined ${gameId}!`);
    console.log(`[Server]   Agent: ${agentId} | Session: ${sessionId}`);
    res.json({ success: true, lobbyUrl: `http://localhost:${PORT}/lobby/${gameId}` });
});

// 3. View the lobby in your browser
app.get('/lobby/:gameId', (req, res) => {
    const { gameId } = req.params;
    if (!activeGames[gameId]) {
        return res.status(404).send('<h1>Lobby not found</h1>');
    }
    const players = activeGames[gameId];
    let html = `<h1>Metaverse: ${gameId}</h1><h2>Active NPCs:</h2><ul>`;
    if (players.length === 0) html += `<li>Waiting for players...</li>`;
    else players.forEach(p => { html += `<li><strong>${p.npcName}</strong> (Agent ID: <code>${p.agentId}</code>)</li>` });
    html += `</ul>`;
    res.send(html);
});

app.listen(PORT, () => console.log(`🎮 Nexus Metaverse Server running on http://localhost:${PORT}`));
