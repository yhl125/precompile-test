// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./ZKNOX_falcon_utils.sol";

/// @title PrecompileNTT
/// @notice Library for calling EIP-7885 NTT precompiles
/// @dev Uses staticcall to precompile addresses for efficient NTT operations
///      Optimized for direct compact-to-precompile encoding (no expand/compact cycles)

/// @dev Precompile addresses as per EIP-7885
address constant NTT_FW_PRECOMPILE = address(0x12);
address constant NTT_INV_PRECOMPILE = address(0x13);
address constant NTT_VECMULMOD_PRECOMPILE = address(0x14);
address constant NTT_VECADDMOD_PRECOMPILE = address(0x15);

/// @dev Falcon-512 parameters
uint32 constant FALCON_RING_DEGREE = 512;
uint64 constant FALCON_MODULUS = 12289;

/// @notice Encode compact polynomial directly to precompile format (no expansion)
/// @param compact 32-element array (16 coefficients packed per word)
/// @return input Encoded bytes for precompile (12-byte header + 1024 bytes data)
function encodeCompactForNTT(uint256[] memory compact) pure returns (bytes memory input) {
    require(compact.length == 32, "Invalid compact length");

    input = new bytes(12 + 1024);

    // Header: ring_degree (4 bytes, big-endian) = 512
    input[0] = 0x00;
    input[1] = 0x00;
    input[2] = 0x02;
    input[3] = 0x00;

    // Header: modulus (8 bytes, big-endian) = 12289
    input[4] = 0x00;
    input[5] = 0x00;
    input[6] = 0x00;
    input[7] = 0x00;
    input[8] = 0x00;
    input[9] = 0x00;
    input[10] = 0x30;
    input[11] = 0x01;

    // Direct extraction from compact format
    assembly {
        let inputPtr := add(input, 44) // skip length(32) + header(12)
        let compactPtr := add(compact, 32) // skip length

        for { let i := 0 } lt(i, 32) { i := add(i, 1) } {
            let word := mload(compactPtr)
            // Extract 16 coefficients from this word
            for { let j := 0 } lt(j, 16) { j := add(j, 1) } {
                let coef := and(shr(shl(4, j), word), 0xffff)
                // Store as big-endian uint16
                mstore8(inputPtr, shr(8, coef))
                mstore8(add(inputPtr, 1), and(coef, 0xff))
                inputPtr := add(inputPtr, 2)
            }
            compactPtr := add(compactPtr, 32)
        }
    }
}

/// @notice Encode precompile output (bytes) + compact polynomial for VECMULMOD
/// @param a_bytes Precompile output (1024 bytes)
/// @param b_compact Compact polynomial (32 words)
/// @return input Encoded bytes (12-byte header + 2048 bytes data)
function encodeBytesCompactVecOpInput(bytes memory a_bytes, uint256[] memory b_compact)
    pure
    returns (bytes memory input)
{
    require(a_bytes.length == 1024, "Invalid a_bytes length");
    require(b_compact.length == 32, "Invalid b_compact length");

    input = new bytes(12 + 2048);

    // Header
    input[0] = 0x00;
    input[1] = 0x00;
    input[2] = 0x02;
    input[3] = 0x00;
    input[4] = 0x00;
    input[5] = 0x00;
    input[6] = 0x00;
    input[7] = 0x00;
    input[8] = 0x00;
    input[9] = 0x00;
    input[10] = 0x30;
    input[11] = 0x01;

    assembly {
        let inputPtr := add(input, 44)
        let aPtr := add(a_bytes, 32)

        // Copy a_bytes directly (already in correct format)
        for { let i := 0 } lt(i, 1024) { i := add(i, 32) } {
            mstore(add(inputPtr, i), mload(add(aPtr, i)))
        }
        inputPtr := add(inputPtr, 1024)

        // Encode b_compact
        let bPtr := add(b_compact, 32)
        for { let i := 0 } lt(i, 32) { i := add(i, 1) } {
            let word := mload(bPtr)
            for { let j := 0 } lt(j, 16) { j := add(j, 1) } {
                let coef := and(shr(shl(4, j), word), 0xffff)
                mstore8(inputPtr, shr(8, coef))
                mstore8(add(inputPtr, 1), and(coef, 0xff))
                inputPtr := add(inputPtr, 2)
            }
            bPtr := add(bPtr, 32)
        }
    }
}

/// @notice Wrap precompile output bytes with header for next precompile call
/// @param data Precompile output (1024 bytes)
/// @return input Encoded bytes with header (12 + 1024 bytes)
function wrapBytesWithHeader(bytes memory data) pure returns (bytes memory input) {
    require(data.length == 1024, "Invalid data length");

    input = new bytes(12 + 1024);

    // Header
    input[0] = 0x00;
    input[1] = 0x00;
    input[2] = 0x02;
    input[3] = 0x00;
    input[4] = 0x00;
    input[5] = 0x00;
    input[6] = 0x00;
    input[7] = 0x00;
    input[8] = 0x00;
    input[9] = 0x00;
    input[10] = 0x30;
    input[11] = 0x01;

    assembly {
        let inputPtr := add(input, 44)
        let dataPtr := add(data, 32)

        for { let i := 0 } lt(i, 1024) { i := add(i, 32) } {
            mstore(add(inputPtr, i), mload(add(dataPtr, i)))
        }
    }
}

/// @notice Compute polynomial multiplication using precompiles (bytes-based, no expand/compact)
/// @param a First polynomial (compact, 32 words)
/// @param b Second polynomial (compact, 32 words) - already in NTT domain
/// @return result Raw precompile output (1024 bytes)
function _PrecompileNTT_HalfMulBytes(uint256[] memory a, uint256[] memory b) view returns (bytes memory result) {
    // 1. Encode a directly to precompile format (no expand!)
    bytes memory a_input = encodeCompactForNTT(a);

    // 2. Forward NTT on a
    (bool ok1, bytes memory ntt_a) = NTT_FW_PRECOMPILE.staticcall(a_input);
    require(ok1, "NTT_FW failed");

    // 3. Combine NTT result with compact b for VECMUL
    bytes memory mul_input = encodeBytesCompactVecOpInput(ntt_a, b);

    // 4. Vector multiply
    (bool ok2, bytes memory mul_result) = NTT_VECMULMOD_PRECOMPILE.staticcall(mul_input);
    require(ok2, "VECMUL failed");

    // 5. Inverse NTT
    bytes memory inv_input = wrapBytesWithHeader(mul_result);
    (bool ok3, bytes memory inv_result) = NTT_INV_PRECOMPILE.staticcall(inv_input);
    require(ok3, "NTT_INV failed");

    return inv_result; // 1024 bytes - no compact/expand!
}
