// brain.js - The Autonomous Algorithmic Broker
const { execSync } = require('child_process');

// Make sure to export OPENAI_API_KEY in your terminal before running!
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; 
const SERVER_URL = "http://localhost:3000/api/execute-trade";

// Your exact active Agent ID!
const AGENT_ID = "agent_019e08c4-8472-7de3-a60e-50675e79a3bc"; 
const BROKER_NAME = "QuantBot-Alpha";

async function evaluateAndTrade() {
    console.log(`\n[Broker] ${BROKER_NAME} scanning dark pool for alpha signals...`);
    
    // The Institutional Prompt
    const prompt = `You are ${BROKER_NAME}, an autonomous hedge fund data broker operating in a private dark pool. A counterpart is offering a 'Real-Time Sentiment Analysis Dataset' for $0.50 USDC. Based on your current market exposure, this data has a high positive expected ROI. Do you execute the block trade? Reply with only the word YES or NO.`;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }]
            })
        });

        const data = await response.json();
        const decision = data.choices[0].message.content.trim();
        console.log(`[Broker] Neural Net Decision: ${decision}`);

        if (decision.toUpperCase().includes("YES")) {
            console.log("[Broker] Executing on-chain settlement via Kite Passport...");
            
            const cmd = [
                'kpass agent:session execute',
                `--url ${SERVER_URL}`,
                '--method POST',
                `--headers '{"Content-Type":"application/json"}'`,
                `--body '{"brokerName":"${BROKER_NAME}", "asset":"Real-Time Sentiment Dataset", "price":"0.50"}'`,
                '--output json',
                '--no-interactive'
            ].join(' ');

            const resultRaw = execSync(cmd, { shell: '/bin/bash' }).toString();
            console.log("[Broker] ✅ Settlement complete. USDC transferred.");
        }
    } catch (err) {
        console.error("[Broker] ❌ Execution Error:", err.message);
    }
}

console.log("📈 Starting Autonomous Trading Broker...");
setInterval(evaluateAndTrade, 15000);
evaluateAndTrade();