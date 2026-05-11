// lib/x402-payment.js
/**
 * x402 Payment Protocol Module
 *
 * Replaces deprecated kite-payment.js API key flow.
 * Uses kpass CLI to create a spending session and generate x402 payment headers.
 *
 * The kpass agent:session create command handles:
 * - User authentication via passkey
 * - Spending session approval with budget/TTL
 * - Payment authorization and signature generation
 *
 * This module wraps the authorization data from kpass into an x402-compliant header.
 */
'use strict';

/**
 * Generates a signed X-Payment header for x402 payment protocol.
 *
 * @param {Object} paymentTerms - Payment request details
 * @param {string} paymentTerms.network - Blockchain network (e.g., "kite-testnet")
 * @param {string} paymentTerms.payTo - Payee wallet address
 * @param {string} paymentTerms.asset - Asset contract address
 * @param {string} paymentTerms.maxAmountRequired - Max amount in wei
 * @param {string} paymentTerms.resource - Resource URI being purchased
 * @param {Object} sessionData - kpass session response containing authorization
 * @param {string} sessionData.authorization - Payment authorization from kpass
 * @param {string} sessionData.signature - Signed payload from kpass
 * @returns {Promise<string>} Base64-encoded X-Payment header
 * @throws {Error} If session data is invalid or missing required fields
 */
async function getSignedX402Payment(paymentTerms, sessionData) {
  if (!sessionData) {
    throw new Error('Session data required for x402 payment (kpass session not approved)');
  }

  if (!sessionData.authorization || !sessionData.signature) {
    throw new Error(
      `Invalid session data: missing authorization or signature. ` +
      `Ensure kpass agent:session create returned valid payment approval.`
    );
  }

  // Validate payment terms
  const required = ['network', 'payTo', 'asset', 'maxAmountRequired', 'resource'];
  for (const field of required) {
    if (!paymentTerms[field]) {
      throw new Error(`Payment terms missing required field: ${field}`);
    }
  }

  // Wrap kpass authorization + signature into x402 format
  const x402Payload = {
    authorization: sessionData.authorization,
    signature: sessionData.signature,
    // Optional: include payment context for audit trail
    paymentTerms: {
      network: paymentTerms.network,
      payTo: paymentTerms.payTo,
      asset: paymentTerms.asset,
      maxAmountRequired: paymentTerms.maxAmountRequired,
      resource: paymentTerms.resource,
    },
    timestamp: new Date().toISOString(),
  };

  // Encode as base64 for HTTP header transport
  const encoded = Buffer.from(JSON.stringify(x402Payload)).toString('base64');
  return encoded;
}

module.exports = { getSignedX402Payment };
