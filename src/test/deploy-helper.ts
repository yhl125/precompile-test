import { type Hex, defineChain } from 'viem';
import { network } from 'hardhat';
import { TR, createAHat, createT1 } from './ethdilithium-test-data.js';

// Define custom chain for NTT precompile network
const nttPrecompileChain = defineChain({
  id: 788484,
  name: 'NTT Precompile Test Network',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [process.env.RPC_URL || 'http://34.173.116.94:8545'],
    },
  },
});

// Individual caching for each contract
let pkContractAddress: Hex | null = null;
let ethdilithiumAddress: Hex | null = null;
let ethfalconAddress: Hex | null = null;

// Cached viem instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let viemInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let publicClientInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let walletClientInstance: any = null;

/**
 * Get or initialize viem clients for nttPrecompile network
 */
async function getViemClients() {
  if (viemInstance && publicClientInstance && walletClientInstance) {
    return { viem: viemInstance, publicClient: publicClientInstance, walletClient: walletClientInstance };
  }

  // Connect to nttPrecompile network and get viem clients
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { viem } = await network.connect("nttPrecompile") as any;
  viemInstance = viem;

  // Get public client with custom chain
  publicClientInstance = await viem.getPublicClient({ chain: nttPrecompileChain });
  const blockNumber = await publicClientInstance.getBlockNumber();
  console.log(`📦 Connected to network. Latest block: ${blockNumber}`);

  // Get wallet clients with custom chain
  const [walletClient] = await viem.getWalletClients({ chain: nttPrecompileChain });
  walletClientInstance = walletClient;
  console.log(`💰 Deploying from: ${walletClient.account.address}`);

  return { viem, publicClient: publicClientInstance, walletClient: walletClientInstance };
}

/**
 * Deploy PKContract if not already deployed
 */
export async function deployPKContract(): Promise<Hex> {
  if (pkContractAddress) {
    console.log('📦 Using cached PKContract address:', pkContractAddress);
    return pkContractAddress;
  }

  console.log('📄 Deploying PKContract...');
  const { viem, publicClient, walletClient } = await getViemClients();

  const aHat = createAHat();
  const t1 = createT1();

  console.log('📋 PKContract constructor data:');
  console.log(`   - TR length: ${(TR.length - 2) / 2} bytes`);
  console.log(`   - aHat dimensions: [${aHat.length}][${aHat[0]?.length}][${aHat[0]?.[0]?.length}]`);
  console.log(`   - t1 dimensions: [${t1.length}][${t1[0]?.length}]`);

  const pkContract = await viem.deployContract('PKContract', [aHat, TR, t1], {
    client: { public: publicClient, wallet: walletClient }
  });

  pkContractAddress = pkContract.address as Hex;
  console.log(`✅ PKContract deployed at: ${pkContractAddress}`);
  return pkContractAddress;
}

/**
 * Deploy precompile_ethdilithium if not already deployed
 */
export async function deployEthdilithium(): Promise<Hex> {
  if (ethdilithiumAddress) {
    console.log('📦 Using cached ETHDILITHIUM address:', ethdilithiumAddress);
    return ethdilithiumAddress;
  }

  console.log('📄 Deploying precompile_ethdilithium...');
  const { viem, publicClient, walletClient } = await getViemClients();

  const dilithiumContract = await viem.deployContract('precompile_ethdilithium', [], {
    client: { public: publicClient, wallet: walletClient }
  });

  ethdilithiumAddress = dilithiumContract.address as Hex;
  console.log(`✅ precompile_ethdilithium deployed at: ${ethdilithiumAddress}`);
  return ethdilithiumAddress;
}

/**
 * Deploy precompile_ethfalcon if not already deployed
 */
export async function deployEthfalcon(): Promise<Hex> {
  if (ethfalconAddress) {
    console.log('📦 Using cached ETHFALCON address:', ethfalconAddress);
    return ethfalconAddress;
  }

  console.log('📄 Deploying precompile_ethfalcon...');
  const { viem, publicClient, walletClient } = await getViemClients();

  const falconContract = await viem.deployContract('precompile_ethfalcon', [], {
    client: { public: publicClient, wallet: walletClient }
  });

  ethfalconAddress = falconContract.address as Hex;
  console.log(`✅ precompile_ethfalcon deployed at: ${ethfalconAddress}`);
  return ethfalconAddress;
}

/**
 * Deploy all contracts required for ETHDILITHIUM tests
 * (PKContract + precompile_ethdilithium)
 */
export async function deployForEthdilithiumTests(): Promise<{ pkContract: Hex; ethdilithium: Hex }> {
  console.log('🚀 Deploying contracts for ETHDILITHIUM tests...');

  const pkContract = await deployPKContract();
  const ethdilithium = await deployEthdilithium();

  console.log('\n' + '='.repeat(60));
  console.log('📋 ETHDILITHIUM TEST DEPLOYMENT SUMMARY');
  console.log('='.repeat(60));
  console.log(`PKContract:     ${pkContract}`);
  console.log(`ETHDILITHIUM:   ${ethdilithium}`);
  console.log('='.repeat(60) + '\n');

  return { pkContract, ethdilithium };
}

/**
 * Deploy all contracts required for ETHFALCON tests
 * (precompile_ethfalcon only)
 */
export async function deployForEthfalconTests(): Promise<{ ethfalcon: Hex }> {
  console.log('🚀 Deploying contracts for ETHFALCON tests...');

  const ethfalcon = await deployEthfalcon();

  console.log('\n' + '='.repeat(60));
  console.log('📋 ETHFALCON TEST DEPLOYMENT SUMMARY');
  console.log('='.repeat(60));
  console.log(`ETHFALCON:      ${ethfalcon}`);
  console.log('='.repeat(60) + '\n');

  return { ethfalcon };
}
