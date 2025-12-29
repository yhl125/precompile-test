import { describe, it, expect, beforeAll } from 'vitest';
import {
  type Hex,
  encodeFunctionData,
  decodeFunctionResult,
  keccak256,
  toHex,
} from 'viem';
import {
  walletClient,
  txPublicClient,
  privateKeyAccount,
  WALLET_CONFIG,
  nttTestChain,
} from '../config/wallet-config.js';
import { MESSAGE, SIGNATURE_DATA, TR, createAHat, createT1 } from './ethdilithium-test-data.js';
import { deployForEthdilithiumTests } from './deploy-helper.js';

/**
 * Contract addresses - set dynamically after deployment in beforeAll
 */
let ETHDILITHIUM_ADDRESS: Hex = '0x0' as Hex;
let PUBLIC_KEY_ADDRESS: Hex = '0x0' as Hex;

/**
 * ETHDILITHIUM ABI for the verify functions
 *
 * ERC-7913 style verify function:
 * function verify(bytes memory pk, bytes memory m, bytes memory signature, bytes memory ctx) returns (bool)
 *
 * Where:
 * - pk: Public key address as bytes (20 bytes address)
 * - m: Message bytes
 * - signature: Packed signature bytes (c_tilde[32] + z[2304] + h[84] = 2420 bytes)
 * - ctx: Context bytes (must be <= 255 bytes)
 *
 * ERC-7913 selector style verify function:
 * function verify(bytes calldata pk, bytes32 m, bytes calldata signature) returns (bytes4)
 */
/**
 * ABI for PKContract-based verification (ERC-7913 style)
 * verify(bytes pk, bytes m, bytes signature, bytes ctx) returns (bool)
 */
const ETHDILITHIUM_ABI_PKCONTRACT = [
  {
    name: 'verify',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'pk', type: 'bytes' },
      { name: 'm', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
      { name: 'ctx', type: 'bytes' },
    ],
    outputs: [{ name: 'result', type: 'bool' }],
  },
] as const;

/**
 * ABI for Direct verification (struct-based)
 * verify(PubKey pk, bytes m, Signature signature, bytes ctx) returns (bool)
 *
 * PubKey: { uint256[][][] aHat, bytes tr, uint256[][] t1 }
 * Signature: { bytes cTilde, bytes z, bytes h }
 */
const ETHDILITHIUM_ABI_DIRECT = [
  {
    name: 'verify',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      {
        name: 'pk',
        type: 'tuple',
        components: [
          { name: 'aHat', type: 'uint256[][][]' },
          { name: 'tr', type: 'bytes' },
          { name: 't1', type: 'uint256[][]' },
        ],
      },
      { name: 'm', type: 'bytes' },
      {
        name: 'signature',
        type: 'tuple',
        components: [
          { name: 'cTilde', type: 'bytes' },
          { name: 'z', type: 'bytes' },
          { name: 'h', type: 'bytes' },
        ],
      },
      { name: 'ctx', type: 'bytes' },
    ],
    outputs: [{ name: 'result', type: 'bool' }],
  },
] as const;

// Combined ABI for backwards compatibility
const ETHDILITHIUM_ABI = [
  ...ETHDILITHIUM_ABI_PKCONTRACT,
  ...ETHDILITHIUM_ABI_DIRECT,
] as const;

/**
 * Packs signature components into a single bytes array
 * Format: c_tilde (32 bytes) + z (2304 bytes) + h (84 bytes) = 2420 bytes
 */
function packSignature(c_tilde: Hex, z: Hex, h: Hex): Hex {
  // Remove '0x' prefix and concatenate
  const packed = c_tilde.slice(2) + z.slice(2) + h.slice(2);
  return `0x${packed}` as Hex;
}

/**
 * Calls ETHDILITHIUM verify function using eth_call
 * @param pkAddress Public key contract address (will be converted to bytes)
 * @param message Message string
 * @param c_tilde c_tilde component (32 bytes)
 * @param z z component (2304 bytes)
 * @param h h component (84 bytes)
 * @param ctx Context string (max 255 bytes)
 */
async function callEthdilithiumVerify(
  pkAddress: Hex,
  message: string,
  c_tilde: Hex,
  z: Hex,
  h: Hex,
  ctx: string
): Promise<{ success: boolean; result?: boolean; error?: string }> {
  try {
    // Pack signature: c_tilde + z + h
    const packedSignature = packSignature(c_tilde, z, h);

    // Convert string to bytes (Hex)
    const messageBytes = toHex(new TextEncoder().encode(message));
    const ctxBytes = toHex(new TextEncoder().encode(ctx));

    // pkAddress should be 20 bytes (address)
    const pkBytes = pkAddress.toLowerCase() as Hex;

    // Encode the function call using viem's encodeFunctionData
    const data = encodeFunctionData({
      abi: ETHDILITHIUM_ABI,
      functionName: 'verify',
      args: [pkBytes, messageBytes, packedSignature, ctxBytes],
    });

    console.log(`📝 Encoded call data length: ${data.length} chars`);
    console.log(`📝 Function selector: ${data.slice(0, 10)}`);
    console.log(
      `📝 Data size: ${(data.length - 2) / 2} bytes (${((data.length - 2) / 2 / 1024).toFixed(2)} KB)`
    );
    console.log(`📝 Packed signature length: ${(packedSignature.length - 2) / 2} bytes`);

    const result = await txPublicClient.call({
      to: ETHDILITHIUM_ADDRESS,
      data,
    });

    console.log(`📝 Raw response: ${result.data}`);

    if (!result.data || result.data === '0x') {
      return {
        success: false,
        error: 'Empty response from contract',
      };
    }

    // Decode the boolean result using viem
    const decoded = decodeFunctionResult({
      abi: ETHDILITHIUM_ABI,
      functionName: 'verify',
      data: result.data,
    });

    return {
      success: true,
      result: decoded as boolean,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.log(`📝 Call error: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Sends a transaction to ETHDILITHIUM verify function
 */
async function sendEthdilithiumVerifyTransaction(
  pkAddress: Hex,
  message: string,
  c_tilde: Hex,
  z: Hex,
  h: Hex,
  ctx: string
): Promise<{
  success: boolean;
  txHash?: Hex;
  gasUsed?: bigint;
  blockNumber?: bigint;
  result?: boolean;
  error?: string;
}> {
  try {
    // Pack signature: c_tilde + z + h
    const packedSignature = packSignature(c_tilde, z, h);

    // Convert string to bytes (Hex)
    const messageBytes = toHex(new TextEncoder().encode(message));
    const ctxBytes = toHex(new TextEncoder().encode(ctx));

    // pkAddress should be 20 bytes (address)
    const pkBytes = pkAddress.toLowerCase() as Hex;

    // Encode the function call using viem's encodeFunctionData
    const data = encodeFunctionData({
      abi: ETHDILITHIUM_ABI,
      functionName: 'verify',
      args: [pkBytes, messageBytes, packedSignature, ctxBytes],
    });

    console.log(`📝 Transaction data size: ${(data.length - 2) / 2} bytes`);

    // Estimate gas first
    let gasLimit: bigint;
    try {
      gasLimit = await txPublicClient.estimateGas({
        account: privateKeyAccount.address,
        to: ETHDILITHIUM_ADDRESS,
        data,
        value: 0n,
      });
      console.log(`📝 Estimated gas: ${gasLimit}`);
      // Add 20% buffer
      gasLimit = gasLimit * 120n / 100n;
    } catch (estimateError) {
      console.log(`📝 Gas estimation failed, using fallback: ${estimateError}`);
      gasLimit = 2_000_000n; // Fallback gas limit
    }

    // Send transaction with explicit gas limit
    const txHash = await walletClient.sendTransaction({
      account: privateKeyAccount,
      chain: nttTestChain,
      to: ETHDILITHIUM_ADDRESS,
      data,
      value: 0n,
      gas: gasLimit,
    });

    console.log(`📤 ETHDILITHIUM Transaction sent: ${txHash}`);

    // Wait for transaction receipt
    const receipt = await txPublicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120000,
    });

    console.log(
      `✅ Transaction confirmed in block ${receipt.blockNumber} (${receipt.gasUsed} gas used)`
    );

    if (receipt.status !== 'success') {
      return {
        success: false,
        txHash,
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
        error: `Transaction failed with status: ${receipt.status}`,
      };
    }

    // Get the result using eth_call
    const callResult = await callEthdilithiumVerify(
      pkAddress,
      message,
      c_tilde,
      z,
      h,
      ctx
    );

    return {
      success: true,
      txHash,
      gasUsed: receipt.gasUsed,
      blockNumber: receipt.blockNumber,
      result: callResult.result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// DIRECT VERIFICATION FUNCTIONS (using PubKey and Signature structs directly)
// =============================================================================

/**
 * Calls ETHDILITHIUM verify function using direct struct input (no PKContract)
 */
async function callEthdilithiumVerifyDirect(
  aHat: bigint[][][],
  tr: Hex,
  t1: bigint[][],
  message: string,
  c_tilde: Hex,
  z: Hex,
  h: Hex,
  ctx: string
): Promise<{ success: boolean; result?: boolean; error?: string }> {
  try {
    const messageBytes = toHex(new TextEncoder().encode(message));
    const ctxBytes = toHex(new TextEncoder().encode(ctx));

    // Encode the function call using the direct struct ABI
    const data = encodeFunctionData({
      abi: ETHDILITHIUM_ABI_DIRECT,
      functionName: 'verify',
      args: [
        { aHat, tr, t1 },           // PubKey struct
        messageBytes,                // message
        { cTilde: c_tilde, z, h },  // Signature struct
        ctxBytes,                    // context
      ],
    });

    console.log(`📝 [Direct] Encoded call data length: ${data.length} chars`);
    console.log(`📝 [Direct] Function selector: ${data.slice(0, 10)}`);
    console.log(
      `📝 [Direct] Data size: ${(data.length - 2) / 2} bytes (${((data.length - 2) / 2 / 1024).toFixed(2)} KB)`
    );

    const result = await txPublicClient.call({
      to: ETHDILITHIUM_ADDRESS,
      data,
    });

    console.log(`📝 [Direct] Raw response: ${result.data}`);

    if (!result.data || result.data === '0x') {
      return {
        success: false,
        error: 'Empty response from contract',
      };
    }

    const decoded = decodeFunctionResult({
      abi: ETHDILITHIUM_ABI_DIRECT,
      functionName: 'verify',
      data: result.data,
    });

    return {
      success: true,
      result: decoded as boolean,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.log(`📝 [Direct] Call error: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Sends a transaction to ETHDILITHIUM verify function using direct struct input
 */
async function sendEthdilithiumVerifyDirectTransaction(
  aHat: bigint[][][],
  tr: Hex,
  t1: bigint[][],
  message: string,
  c_tilde: Hex,
  z: Hex,
  h: Hex,
  ctx: string
): Promise<{
  success: boolean;
  txHash?: Hex;
  gasUsed?: bigint;
  blockNumber?: bigint;
  result?: boolean;
  error?: string;
}> {
  try {
    const messageBytes = toHex(new TextEncoder().encode(message));
    const ctxBytes = toHex(new TextEncoder().encode(ctx));

    const data = encodeFunctionData({
      abi: ETHDILITHIUM_ABI_DIRECT,
      functionName: 'verify',
      args: [
        { aHat, tr, t1 },
        messageBytes,
        { cTilde: c_tilde, z, h },
        ctxBytes,
      ],
    });

    console.log(`📝 [Direct] Transaction data size: ${(data.length - 2) / 2} bytes`);

    // Estimate gas first
    let gasLimit: bigint;
    try {
      gasLimit = await txPublicClient.estimateGas({
        account: privateKeyAccount.address,
        to: ETHDILITHIUM_ADDRESS,
        data,
        value: 0n,
      });
      console.log(`📝 [Direct] Estimated gas: ${gasLimit}`);
      gasLimit = gasLimit * 120n / 100n;
    } catch (estimateError) {
      console.log(`📝 [Direct] Gas estimation failed, using fallback`);
      gasLimit = 3_000_000n;
    }

    const txHash = await walletClient.sendTransaction({
      account: privateKeyAccount,
      chain: nttTestChain,
      to: ETHDILITHIUM_ADDRESS,
      data,
      value: 0n,
      gas: gasLimit,
    });

    console.log(`📤 [Direct] Transaction sent: ${txHash}`);

    const receipt = await txPublicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 180000,
    });

    console.log(
      `✅ [Direct] Transaction confirmed in block ${receipt.blockNumber} (${receipt.gasUsed} gas used)`
    );

    if (receipt.status !== 'success') {
      return {
        success: false,
        txHash,
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
        error: `Transaction failed with status: ${receipt.status}`,
      };
    }

    const callResult = await callEthdilithiumVerifyDirect(
      aHat, tr, t1, message, c_tilde, z, h, ctx
    );

    return {
      success: true,
      txHash,
      gasUsed: receipt.gasUsed,
      blockNumber: receipt.blockNumber,
      result: callResult.result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('ETHDILITHIUM Precompile Contract Tests', () => {
  beforeAll(async () => {
    console.log(`🔑 Wallet Address: ${WALLET_CONFIG.address}`);
    console.log(`🌐 RPC URL: ${WALLET_CONFIG.rpcUrl}`);

    if (!WALLET_CONFIG.hasPrivateKey) {
      throw new Error(
        'Private key not configured. Please set PRIVATE_KEY in .env file'
      );
    }

    // Deploy contracts needed for ETHDILITHIUM tests
    const contracts = await deployForEthdilithiumTests();
    ETHDILITHIUM_ADDRESS = contracts.ethdilithium;
    PUBLIC_KEY_ADDRESS = contracts.pkContract;

    console.log(`📍 ETHDILITHIUM Contract: ${ETHDILITHIUM_ADDRESS}`);
    console.log(`📍 Public Key Contract: ${PUBLIC_KEY_ADDRESS}`);

    // Compute and display function selector for verification
    const funcSig = 'verify(bytes,bytes,bytes,bytes)';
    const selector = keccak256(toHex(funcSig)).slice(0, 10);
    console.log(`🔧 Function signature: ${funcSig}`);
    console.log(`🔧 Computed function selector: ${selector}`);
  }, 300000); // 5 minute timeout for deployment

  describe('Contract Connectivity', () => {
    it('should be able to call the ETHDILITHIUM contract with full test data', async () => {
      const result = await callEthdilithiumVerify(
        PUBLIC_KEY_ADDRESS,
        MESSAGE,
        SIGNATURE_DATA.c_tilde,
        SIGNATURE_DATA.z,
        SIGNATURE_DATA.h,
        '' // empty context
      );

      console.log(`📊 Contract call result:`, result);

      // Contract call must succeed and return a defined result
      expect(result.success).toBe(true);
      expect(result.result).toBe(true);
      console.log(`✅ Contract returned: ${result.result}`);
    }, 120000);
  });

  describe('Signature Verification', () => {
    it('should verify valid ETHDILITHIUM signature', async () => {
      const result = await callEthdilithiumVerify(
        PUBLIC_KEY_ADDRESS,
        MESSAGE,
        SIGNATURE_DATA.c_tilde,
        SIGNATURE_DATA.z,
        SIGNATURE_DATA.h,
        '' // empty context
      );

      console.log(`📊 Verification result:`, result);

      // Call must succeed
      expect(result.success).toBe(true);
      // Signature should be valid
      expect(result.result).toBe(true);
      console.log(`✅ Verification result: ${result.result}`);
    }, 120000);

    it('should reject an invalid signature (modified c_tilde)', async () => {
      // Modify c_tilde to create an invalid signature
      const invalidCtilde = (SIGNATURE_DATA.c_tilde.slice(0, -2) + '00') as Hex;

      const result = await callEthdilithiumVerify(
        PUBLIC_KEY_ADDRESS,
        MESSAGE,
        invalidCtilde,
        SIGNATURE_DATA.z,
        SIGNATURE_DATA.h,
        '' // empty context
      );

      console.log(`📊 Invalid signature result:`, result);

      if (result.success) {
        // If the call succeeded, the result should be false (invalid signature)
        expect(result.result).toBe(false);
        console.log(`✅ Invalid signature correctly rejected`);
      } else {
        // An error/revert during execution is also acceptable for invalid input
        console.log(
          `✅ Invalid signature caused expected error: ${result.error}`
        );
        expect(result.error).toBeDefined();
      }
    }, 120000);
  });

  describe('Gas Cost Analysis', () => {
    let pkContractGas: bigint | undefined;
    let directGas: bigint | undefined;

    it('should measure gas cost for PKContract-based verification', async () => {
      console.log('\n📌 Testing PKContract-based verification (ERC-7913 style)');
      console.log('   PK is fetched from PKContract at:', PUBLIC_KEY_ADDRESS);

      const result = await sendEthdilithiumVerifyTransaction(
        PUBLIC_KEY_ADDRESS,
        MESSAGE,
        SIGNATURE_DATA.c_tilde,
        SIGNATURE_DATA.z,
        SIGNATURE_DATA.h,
        '' // empty context
      );

      console.log(`📊 [PKContract] Transaction result:`, {
        success: result.success,
        txHash: result.txHash,
        gasUsed: result.gasUsed?.toString(),
        blockNumber: result.blockNumber?.toString(),
        result: result.result,
        error: result.error,
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(result.gasUsed).toBeDefined();
      expect(result.result).toBe(true);

      pkContractGas = result.gasUsed;
      console.log(`⛽ [PKContract] Gas Used: ${pkContractGas}`);
    }, 180000);

    it('should measure gas cost for Direct verification (struct-based)', async () => {
      console.log('\n📌 Testing Direct verification (struct-based)');
      console.log('   PK is passed directly in calldata');

      const aHat = createAHat();
      const t1 = createT1();

      const result = await sendEthdilithiumVerifyDirectTransaction(
        aHat,
        TR,
        t1,
        MESSAGE,
        SIGNATURE_DATA.c_tilde,
        SIGNATURE_DATA.z,
        SIGNATURE_DATA.h,
        '' // empty context
      );

      console.log(`📊 [Direct] Transaction result:`, {
        success: result.success,
        txHash: result.txHash,
        gasUsed: result.gasUsed?.toString(),
        blockNumber: result.blockNumber?.toString(),
        result: result.result,
        error: result.error,
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(result.gasUsed).toBeDefined();
      expect(result.result).toBe(true);

      directGas = result.gasUsed;
      console.log(`⛽ [Direct] Gas Used: ${directGas}`);
    }, 180000);

    it('should compare gas costs between PKContract and Direct verification', async () => {
      console.log('\n' + '='.repeat(60));
      console.log('📊 GAS COST COMPARISON');
      console.log('='.repeat(60));

      if (pkContractGas && directGas) {
        const gasDiff = pkContractGas - directGas;
        const percentDiff = Number((gasDiff * 10000n) / pkContractGas) / 100;

        console.log(`\n  PKContract-based:  ${pkContractGas.toString().padStart(10)} gas`);
        console.log(`  Direct (struct):   ${directGas.toString().padStart(10)} gas`);
        console.log(`  ─────────────────────────────────────`);
        console.log(`  Difference:        ${gasDiff.toString().padStart(10)} gas (${percentDiff.toFixed(2)}%)`);

        if (gasDiff > 0n) {
          console.log(`\n  ✅ Direct verification saves ${gasDiff} gas (${percentDiff.toFixed(2)}% cheaper)`);
        } else if (gasDiff < 0n) {
          console.log(`\n  ℹ️  PKContract verification saves ${-gasDiff} gas (${(-percentDiff).toFixed(2)}% cheaper)`);
        } else {
          console.log(`\n  ℹ️  Both methods use the same amount of gas`);
        }

        console.log('='.repeat(60) + '\n');
      } else {
        console.log('  ⚠️  Could not compare - one or both tests failed');
        console.log(`  PKContract gas: ${pkContractGas?.toString() ?? 'N/A'}`);
        console.log(`  Direct gas: ${directGas?.toString() ?? 'N/A'}`);
      }

      // Both should be defined if previous tests passed
      expect(pkContractGas).toBeDefined();
      expect(directGas).toBeDefined();
    }, 10000);
  });

  describe('Direct Verification Tests', () => {
    it('should verify valid signature using direct struct input', async () => {
      const aHat = createAHat();
      const t1 = createT1();

      const result = await callEthdilithiumVerifyDirect(
        aHat,
        TR,
        t1,
        MESSAGE,
        SIGNATURE_DATA.c_tilde,
        SIGNATURE_DATA.z,
        SIGNATURE_DATA.h,
        '' // empty context
      );

      console.log(`📊 [Direct] Verification result:`, result);

      expect(result.success).toBe(true);
      expect(result.result).toBe(true);
      console.log(`✅ [Direct] Verification result: ${result.result}`);
    }, 120000);

    it('should reject invalid signature using direct struct input', async () => {
      const aHat = createAHat();
      const t1 = createT1();
      const invalidCtilde = (SIGNATURE_DATA.c_tilde.slice(0, -2) + '00') as Hex;

      const result = await callEthdilithiumVerifyDirect(
        aHat,
        TR,
        t1,
        MESSAGE,
        invalidCtilde,
        SIGNATURE_DATA.z,
        SIGNATURE_DATA.h,
        '' // empty context
      );

      console.log(`📊 [Direct] Invalid signature result:`, result);

      if (result.success) {
        expect(result.result).toBe(false);
        console.log(`✅ [Direct] Invalid signature correctly rejected`);
      } else {
        console.log(`✅ [Direct] Invalid signature caused expected error: ${result.error}`);
        expect(result.error).toBeDefined();
      }
    }, 120000);
  });
});
