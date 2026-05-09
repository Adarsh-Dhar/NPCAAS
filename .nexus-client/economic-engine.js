async function runBrain(incomingMsg, agentConfig) {
  // agentConfig = { hiddenFloor: 40, hiddenCeiling: 50, role: 'buyer'|'seller' }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: `You are an autonomous trading agent. Role: ${agentConfig.role}.
               Hidden floor/ceiling: $${agentConfig.hiddenFloor}-$${agentConfig.hiddenCeiling}.
               Respond ONLY in JSON: {"action":"ACCEPT"|"COUNTER"|"REJECT","amount":number}`,
      messages: [{ role: 'user', content: JSON.stringify(incomingMsg) }]
    })
  });

  const data = await res.json();

  // Guard against API errors (401, 529, etc.)
  if (!data.content?.[0]?.text) {
    throw new Error(`Anthropic API error: ${JSON.stringify(data.error ?? data)}`);
  }

  let decision;
  try {
    decision = JSON.parse(data.content[0].text);
  } catch {
    throw new Error(`Brain returned non-JSON: ${data.content[0].text}`);
  }
  return decision;
}
module.exports = { runBrain };