import { NextRequest, NextResponse } from 'next/server'
import { executeWriteTransaction } from '@/lib/tx-orchestrator'
import { ethers } from 'ethers'
import { resolveProjectAndCharacter } from '@/lib/npc-resolver'

/**
 * POST /api/npcs/[name]/wallet/interact
 * Command the NPC to interact with an arbitrary smart contract.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params
    const result = await resolveProjectAndCharacter(request, name)
    if (result instanceof NextResponse) return result

    const { character } = result
    const body = await request.json()
    const { contractAddress, calldata, abi, functionName, args = [], value } = body

    if (!contractAddress || !ethers.isAddress(contractAddress)) {
      return NextResponse.json({ error: 'Valid contractAddress is required' }, { status: 400 })
    }

    let encodedCalldata: string

    if (calldata) {
      if (typeof calldata !== 'string' || !calldata.startsWith('0x')) {
        return NextResponse.json(
          { error: 'calldata must be a hex string starting with 0x' },
          { status: 400 }
        )
      }
      encodedCalldata = calldata
    } else if (abi && functionName) {
      try {
        const iface = new ethers.Interface(Array.isArray(abi) ? abi : [abi])
        encodedCalldata = iface.encodeFunctionData(functionName, args)
      } catch (encodeError) {
        return NextResponse.json(
          { error: `ABI encoding failed: ${encodeError instanceof Error ? encodeError.message : 'unknown'}` },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Provide either (calldata) or (abi + functionName)' },
        { status: 400 }
      )
    }

    const parsedValue = value ? ethers.parseEther(value.toString()).toString() : '0'
    const ownerId = character.smartAccountId ?? `character:${character.id}`

    const execution = await executeWriteTransaction({
      to: contractAddress,
      value: parsedValue,
      data: encodedCalldata,
      ownerId,
    })

    return NextResponse.json({
      success: true,
      npcId: character.id,
      npcName: character.name,
      contractAddress,
      functionName: functionName ?? '(raw calldata)',
      mode: execution.mode,
      sponsored: execution.sponsored,
      txHash: execution.txHash,
      userOpHash: execution.userOpHash,
      status: execution.status,
      sponsorError: execution.sponsorError,
    })
  } catch (error) {
    console.error('[API] Wallet interact error:', error)
    return NextResponse.json({ error: 'Failed to execute contract interaction' }, { status: 500 })
  }
}