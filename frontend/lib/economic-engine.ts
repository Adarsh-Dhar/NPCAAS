export type PricingAlgorithm =
  | 'FIXED_MARGIN'
  | 'DYNAMIC_MARKET'
  | 'AUCTION_BASED'
  | 'REPUTATION_SCALED'

export interface CharacterConfig {
  baseCapital?: number
  pricingAlgorithm?: string
  marginPercentage?: number
}

export interface TradeIntent {
  item: string
  price: number
  currency: string
}

export interface EconomicValidationInput {
  tradeIntent: TradeIntent
  config: CharacterConfig
  currentMarketRate?: number
  openness?: number
}

export interface EconomicValidationResult {
  isValid: boolean
  reason?: string
  minPrice?: number
  acceptedMinPrice?: number
  discountTolerancePct?: number
}

export interface EconomicPromptContext {
  config: CharacterConfig
  currentMarketRate?: number
  liveWalletBalance?: string
  openness?: number
}

const KNOWN_ALGORITHMS: PricingAlgorithm[] = [
  'FIXED_MARGIN',
  'DYNAMIC_MARKET',
  'AUCTION_BASED',
  'REPUTATION_SCALED',
]

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeOpenness(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(Math.max(value, 0), 100)
  }
  return 50
}

function getDiscountTolerance(openness?: number): number {
  const normalized = normalizeOpenness(openness)
  if (normalized <= 30) return 0
  if (normalized < 70) return 0
  // At maximum openness, allow up to 8% discount from target min price.
  return ((normalized - 70) / 30) * 0.08
}

export class EconomicEngine {
  static calculateMinPrice(
    config: CharacterConfig,
    currentMarketRate?: number
  ): number | null {
    const marketRate = asFiniteNumber(currentMarketRate)
    const margin = asFiniteNumber(config.marginPercentage) ?? 0
    const pricingAlgorithm =
      typeof config.pricingAlgorithm === 'string' &&
      KNOWN_ALGORITHMS.includes(config.pricingAlgorithm as PricingAlgorithm)
        ? (config.pricingAlgorithm as PricingAlgorithm)
        : 'DYNAMIC_MARKET'

    if (marketRate === undefined || marketRate <= 0) {
      return null
    }

    switch (pricingAlgorithm) {
      case 'FIXED_MARGIN':
        return roundToTwo(marketRate * (1 + Math.max(margin, 0) / 100))
      case 'DYNAMIC_MARKET':
        return roundToTwo(marketRate * 0.97)
      case 'AUCTION_BASED':
        return roundToTwo(marketRate * 0.9)
      case 'REPUTATION_SCALED': {
        const boundedMargin = Math.min(Math.max(margin, 0), 30)
        const reputationMultiplier = 0.95 + boundedMargin / 200
        return roundToTwo(marketRate * reputationMultiplier)
      }
      default:
        return roundToTwo(marketRate)
    }
  }

  static validateTrade(input: EconomicValidationInput): boolean {
    return EconomicEngine.validateTradeDetailed(input).isValid
  }

  static validateTradeDetailed(input: EconomicValidationInput): EconomicValidationResult {
    const price = asFiniteNumber(input.tradeIntent.price)
    if (price === undefined || price <= 0) {
      return { isValid: false, reason: 'Trade price must be greater than zero.' }
    }

    const openness = normalizeOpenness(input.openness)
    const discountTolerance = getDiscountTolerance(openness)

    const pricingAlgorithm =
      typeof input.config.pricingAlgorithm === 'string' &&
      KNOWN_ALGORITHMS.includes(input.config.pricingAlgorithm as PricingAlgorithm)
        ? (input.config.pricingAlgorithm as PricingAlgorithm)
        : 'DYNAMIC_MARKET'

    let minPrice: number | null = null

    switch (pricingAlgorithm) {
      case 'FIXED_MARGIN':
        minPrice = EconomicEngine.calculateMinPrice(
          { ...input.config, pricingAlgorithm: 'FIXED_MARGIN' },
          input.currentMarketRate
        )
        break
      case 'DYNAMIC_MARKET':
        minPrice = EconomicEngine.calculateMinPrice(
          { ...input.config, pricingAlgorithm: 'DYNAMIC_MARKET' },
          input.currentMarketRate
        )
        break
      case 'AUCTION_BASED':
        minPrice = EconomicEngine.calculateMinPrice(
          { ...input.config, pricingAlgorithm: 'AUCTION_BASED' },
          input.currentMarketRate
        )
        break
      case 'REPUTATION_SCALED':
        minPrice = EconomicEngine.calculateMinPrice(
          { ...input.config, pricingAlgorithm: 'REPUTATION_SCALED' },
          input.currentMarketRate
        )
        break
      default:
        minPrice = EconomicEngine.calculateMinPrice(input.config, input.currentMarketRate)
        break
    }

    // Lenient fallback: if no runtime market baseline is available, allow trade.
    if (minPrice === null) {
      return {
        isValid: true,
        reason: 'Market rate unavailable; validation ran in lenient mode.',
        discountTolerancePct: roundToTwo(discountTolerance * 100),
      }
    }

    const acceptedMinPrice = roundToTwo(minPrice * (1 - discountTolerance))

    if (price < acceptedMinPrice) {
      return {
        isValid: false,
        reason:
          `Trade price ${price} is below the minimum accepted price ${acceptedMinPrice} ` +
          `(target baseline ${minPrice}, openness ${openness}).`,
        minPrice,
        acceptedMinPrice,
        discountTolerancePct: roundToTwo(discountTolerance * 100),
      }
    }

    return {
      isValid: true,
      minPrice,
      acceptedMinPrice,
      discountTolerancePct: roundToTwo(discountTolerance * 100),
    }
  }

  static buildEconomicContext(input: EconomicPromptContext): string {
    const pricingAlgorithm =
      typeof input.config.pricingAlgorithm === 'string' && input.config.pricingAlgorithm.trim()
        ? input.config.pricingAlgorithm
        : 'DYNAMIC_MARKET'
    const margin = asFiniteNumber(input.config.marginPercentage)
    const baseCapital = asFiniteNumber(input.config.baseCapital)
    const openness = normalizeOpenness(input.openness)
    const discountTolerance = getDiscountTolerance(openness)
    const minPrice = EconomicEngine.calculateMinPrice(input.config, input.currentMarketRate)

    const lines: string[] = [
      'ECONOMIC CONSTRAINTS:',
      `- Pricing algorithm: ${pricingAlgorithm}`,
    ]

    if (baseCapital !== undefined) {
      lines.push(`- Base capital: ${baseCapital} KITE`)
    }

    if (margin !== undefined) {
      lines.push(`- Margin percentage: ${margin}%`)
    }

    lines.push(`- Openness-adjusted negotiation mode: ${openness <= 30 ? 'strict' : openness >= 70 ? 'flexible' : 'balanced'}`)

    if (input.currentMarketRate !== undefined) {
      lines.push(`- Current market rate: ${roundToTwo(input.currentMarketRate)} KITE`)
    } else {
      lines.push('- Current market rate: unavailable (fallback mode)')
    }

    if (input.liveWalletBalance !== undefined) {
      lines.push(`- Live wallet balance: ${input.liveWalletBalance} KITE`)
    }

    if (minPrice !== null) {
      lines.push(`- Minimum allowed listing price: ${minPrice} KITE`)
      if (discountTolerance > 0) {
        lines.push(`- Openness discount tolerance: up to ${roundToTwo(discountTolerance * 100)}% below target floor`)
        lines.push(`- Effective accepted minimum price: ${roundToTwo(minPrice * (1 - discountTolerance))} KITE`)
      } else {
        lines.push('- Openness discount tolerance: 0% (strict margin enforcement)')
      }
      lines.push('- Never propose a trade below the effective accepted minimum price.')
    } else {
      lines.push('- Market rate unavailable. Keep offers conservative and avoid deep discounting.')
    }

    return lines.join('\n')
  }
}
