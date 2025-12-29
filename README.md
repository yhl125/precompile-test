# NTT Precompile Signature Verification Tests

Integration test suite for post-quantum signature verification using EIP-7885 NTT (Number Theoretic Transform) precompiles.

## Overview

This project tests post-quantum signature verification algorithms (ETHFALCON and ETHDILITHIUM) that leverage NTT precompiles for efficient polynomial operations. The contracts are modified versions of [ZKNOX's implementations](https://github.com/ZKNoxHQ) to use NTT precompiles instead of pure Solidity implementations.

**Testing Environment**: Tests are executed against an op-geth client built from [yhl125/op-geth feat/nocgo-ntt-precompile branch](https://github.com/yhl125/op-geth/tree/feat/nocgo-ntt-precompile) with integrated NTT precompile support.

This test suite is validated against a live OP-Stack testnet:

- **RPC**: http://34.173.116.94:8545
- **Network ID**: 788484
- **Deposit Address (Sepolia ETH)**: 0xff5e0ebad1dec0af04a5b3a6cfc1ed2bcadec8c8

You can deposit Sepolia ETH to the deposit address to enable testing with real transactions on this testnet.

## Contracts Tested

### ETHDILITHIUM (ML-DSA / Dilithium)

Post-quantum digital signature scheme based on lattice cryptography. Uses NTT precompile for efficient polynomial multiplication in signature verification.

- **Contract**: `precompile_ethdilithium.sol`
- **PKContract**: Stores public key components (aHat, TR, t1) on-chain
- **Verification Methods**:
  - PKContract-based: Public key fetched from on-chain contract
  - Direct struct-based: Public key passed in calldata

### ETHFALCON (Falcon-512)

Compact post-quantum signature scheme using NTRU lattices. Uses NTT precompile for signature verification.

- **Contract**: `precompile_ethfalcon.sol`
- **Verification**: ethfalcon signature verification

## Features

- **NTT Precompile Integration**: Contracts utilize EIP-7885 NTT precompiles for polynomial operations
- **Dynamic Contract Deployment**: Contracts are deployed fresh for each test run via Hardhat
- **Gas Cost Analysis**: Detailed gas consumption measurement for signature verification
- **Multiple Verification Methods**: Tests both PKContract-based and direct struct-based verification
- **Invalid Signature Detection**: Validates proper rejection of modified signatures

## Setup

1. **Install dependencies**:
   ```bash
   bun install
   # or
   npm install
   ```

2. **Configure environment**:
   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env and add your private key (WITHOUT 0x prefix)
   # PRIVATE_KEY=your_private_key_here
   ```
   **WARNING: Never commit your `.env` file with real private keys!**

3. **Compile contracts**:
   ```bash
   bun run compile
   # or
   npm run compile
   ```

## Running Tests

```bash
# Run all tests
bun run test

# Run with npm/vitest
npm test

# Run tests with watch mode
bun test --watch

# Type check
bun run type-check
```

## Test Structure

### Test Files

- `src/test/ethdilithium-precompile.test.ts` - ETHDILITHIUM signature verification tests
- `src/test/ethfalcon-precompile.test.ts` - ETHFALCON signature verification tests

### Support Files

- `src/test/deploy-helper.ts` - Contract deployment utilities using Hardhat viem plugin
- `src/test/ethdilithium-test-data.ts` - Test vectors for ETHDILITHIUM (from ZKNOX)
- `src/config/wallet-config.ts` - Wallet and network configuration

## Test Results

### ETHDILITHIUM Tests (8 tests)

| Test | Result | Details |
|------|--------|---------|
| Contract connectivity | ✅ Pass | Contract call with full test data |
| Valid signature verification | ✅ Pass | Returns true for valid signature |
| Invalid signature rejection | ✅ Pass | Returns false for modified c_tilde |
| PKContract-based gas cost | ✅ Pass | 7,618,412 gas |
| Direct verification gas cost | ✅ Pass | 5,732,354 gas |
| Gas cost comparison | ✅ Pass | Direct is 24.75% cheaper |
| Direct valid signature | ✅ Pass | Struct-based verification works |
| Direct invalid signature | ✅ Pass | Rejects modified signature |

### ETHFALCON Tests (4 tests)

| Test | Result | Details |
|------|--------|---------|
| Contract connectivity | ✅ Pass | Contract call with full test data |
| Valid signature verification | ✅ Pass | Returns true for valid signature |
| Invalid signature rejection | ✅ Pass | Returns false for modified s2 |
| Gas cost measurement | ✅ Pass | 479,341 gas |

## Gas Cost Analysis

| Algorithm | Verification Method | Gas Cost |
|-----------|-------------------|----------|
| ETHDILITHIUM | PKContract-based | 7,618,412 |
| ETHDILITHIUM | Direct (struct) | 5,732,354 |
| ETHFALCON | Direct | 479,341 |

### Test Vector Sources

- **ETHDILITHIUM**: Test vectors from ZKNOX `ZKNOX_ethdilithium.t.sol`
- **ETHFALCON**: Test vectors from ZKNOX `ZKNOX_ethfalcon.t.sol`

## References

- [EIP-7885: Number Theoretic Transform Precompiles](https://github.com/ethereum/EIPs/pull/9374)
- [ZKNOX ETHFALCON](https://github.com/ZKNoxHQ/ETHFALCON)
- [ZKNOX ETHDILITHIUM](https://github.com/ZKNoxHQ/ETHDILITHIUM)
- [op-geth feat/nocgo-ntt-precompile](https://github.com/yhl125/op-geth/tree/feat/nocgo-ntt-precompile)
- [Viem Documentation](https://viem.sh/)
- [Vitest Documentation](https://vitest.dev/)
- [Hardhat Documentation](https://hardhat.org/)
