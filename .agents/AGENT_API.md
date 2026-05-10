# Agent Brain Plugin Contract

Every agent brain lives in `.agents/plugins/<agentName>/brain.js` and must export the same CommonJS interface:

```js
module.exports = {
  decide,
  buildOpeningMove,
  getMetadata,
};
```

## Required exports

`decide(incomingMsg, agentConfig, ctx)`

Returns a promise that resolves to:

```json
{ "action": "ACCEPT" | "COUNTER" | "REJECT", "amount": 0, "reason": "optional" }
```

`buildOpeningMove(agentConfig)`

Returns the initial market message for the agent:

```json
{ "action": "BID" | "ASK", "amount": 0, "asset": "...", "from": "agent name" }
```

`getMetadata()`

Returns a small descriptive object for the UI and logs:

```json
{ "name": "...", "description": "...", "strategy": "..." }
```

## Runtime config

The Nexus client in `.nexus-client/script.js` merges `registry.json` and each plugin's `config.json` into the runtime config before negotiation:

```json
{
  "brokerName": "QuantBot-Alpha",
  "role": "buyer",
  "hiddenFloor": 0.45,
  "hiddenCeiling": 0.75,
  "asset": "Real-Time Sentiment Dataset",
  "maxRounds": 10
}
```

## Directory layout

```text
.agents/
  registry.json
  AGENT_API.md
  plugins/
    QuantBot-Alpha/
      brain.js
      config.json
    DataOracle_7/
      brain.js
      config.json
```

## Registry format

`registry.json` maps agent names to plugin directories relative to `.agents/`:

```json
{
  "agents": {
    "QuantBot-Alpha": {
      "pluginDir": "./plugins/QuantBot-Alpha",
      "enabled": true
    }
  }
}
```

## Notes

- Use CommonJS exports (`module.exports = ...`) so the Node server can load plugins without transpiling them.
- Keep `decide()` deterministic when possible so negotiation loops are easier to test.
- If a plugin is disabled in `registry.json`, the client will refuse to deploy it.
- Do not send `hiddenFloor`, `hiddenCeiling`, or other private brain settings in join-pool or negotiate payloads.