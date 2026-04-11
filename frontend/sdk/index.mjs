// ESM wrapper for the CJS-distributed SDK (`index.js`).
// Import the CommonJS build and re-export named exports for ESM consumers
// (browsers / Vite). TypeScript types remain in `index.d.ts`.
import pkg from './index.js'

export const GuildCraftClient = pkg.GuildCraftClient
export const GuildCraftError = pkg.GuildCraftError
export default pkg
