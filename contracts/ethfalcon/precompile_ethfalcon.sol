// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./ZKNOX_common.sol";
import "./ZKNOX_IVerifier.sol";
import "./ZKNOX_falcon_utils.sol";
import "./precompile_NTT.sol";
import "./ZKNOX_HashToPoint.sol";

/// @title precompile_ethfalcon
/// @notice A contract to verify ETHFALCON signatures using EIP-7885 NTT precompiles
/// @dev ETHFALCON is FALCON with a Keccak-CTR PRNG instead of shake for gas cost efficiency.
///      This version uses NTT precompiles at addresses 0x12-0x15 for efficient polynomial operations.

/// @custom:experimental This library is not audited yet, do not use in production.

/// @notice Compute the core falcon verification using bytes-based flow
/// @dev Uses direct compact-to-precompile encoding, no expand/compact cycles
/// @param s2 second part of the signature in Compacted representation
/// @param ntth public key in the ntt domain, compacted 16 coefficients of 16 bits per word
/// @param hashed result of hashToPoint(signature.salt, msgs, q, n);
/// @return result boolean result of the verification
function falcon_core_precompile(
    uint256[] memory s2,
    uint256[] memory ntth,
    uint256[] memory hashed
)
    view
    returns (bool result)
{
    if (hashed.length != 512) return false;
    if (s2.length != 32) return false;

    // Use optimized bytes-based NTT multiplication (no expand/compact!)
    bytes memory s1_bytes = _PrecompileNTT_HalfMulBytes(s2, ntth);

    return falcon_normalize_from_bytes(s1_bytes, s2, hashed);
}

/// @notice Normalize and verify signature bounds from bytes format
/// @dev Computes norm directly from precompile output bytes without expansion
///      Uses batch memory reads (32 bytes at a time) for gas efficiency
/// @param s1_bytes Precompile output (1024 bytes = 512 big-endian uint16)
/// @param s2 Second signature component (compact, 32 words)
/// @param hashed Hash-to-point output (expanded, 512 words)
/// @return result True if signature norm is within bounds
function falcon_normalize_from_bytes(
    bytes memory s1_bytes,
    uint256[] memory s2,
    uint256[] memory hashed
)
    pure
    returns (bool result)
{
    uint256 norm = 0;

    assembly {
        let s1Ptr := add(s1_bytes, 32) // skip length prefix
        let hashedPtr := add(hashed, 32) // skip length prefix

        // First loop: compute norm from (hashed - s1)
        // OPTIMIZED: Read 32 bytes at once (16 coefficients) instead of 2 bytes per iteration
        // This reduces mload operations from 1024 to 32
        for { let i := 0 } lt(i, 32) { i := add(i, 1) } {
            // Read 32 bytes = 16 big-endian uint16 coefficients
            let chunk := mload(s1Ptr)
            s1Ptr := add(s1Ptr, 32)

            // Process 16 coefficients from this chunk
            // In EVM memory layout: byte[0] at bits 248-255, byte[1] at bits 240-247, etc.
            // Coefficient j (bytes 2j, 2j+1) is at bits (240-16j) to (255-16j)
            for { let j := 0 } lt(j, 16) { j := add(j, 1) } {
                // Extract big-endian uint16 at position j
                // coef_j = chunk >> (240 - 16*j) & 0xffff
                let s1i := and(shr(sub(240, shl(4, j)), chunk), 0xffff)

                // s1[i] = (hashed[i] - s1[i]) mod q
                let h_i := mload(hashedPtr)
                hashedPtr := add(hashedPtr, 32)

                s1i := addmod(h_i, sub(q, s1i), q)

                // Center: if s1i > q/2, s1i = q - s1i
                let cond := gt(s1i, qs1)
                s1i := add(mul(cond, sub(q, s1i)), mul(sub(1, cond), s1i))

                norm := add(norm, mul(s1i, s1i))
            }
        }

        // Second loop: compute norm from s2 (extract from compact inline)
        let s2Ptr := add(s2, 32)
        for { let i := 0 } lt(i, 32) { i := add(i, 1) } {
            let word := mload(s2Ptr)
            s2Ptr := add(s2Ptr, 32)

            // Extract 16 coefficients from this compact word
            for { let j := 0 } lt(j, 16) { j := add(j, 1) } {
                let s2i := and(shr(shl(4, j), word), 0xffff)

                // Center: if s2i > q/2, s2i = q - s2i
                let cond := gt(s2i, qs1)
                s2i := add(mul(cond, sub(q, s2i)), mul(sub(1, cond), s2i))

                norm := add(norm, mul(s2i, s2i))
            }
        }

        result := lt(norm, sigBound)
    }

    return result;
}

contract precompile_ethfalcon is ISigVerifier {
    function CheckParameters(bytes memory salt, uint256[] memory s2, uint256[] memory ntth)
        internal
        pure
        returns (bool)
    {
        if (ntth.length != falcon_S256) return false;
        if (salt.length != 40) return false;
        if (s2.length != falcon_S256) return false;

        return true;
    }

    /// @notice Compute the ethfalcon verification function using EIP-7885 precompiles
    /// @param h the hash of message to be signed, expected length is 32 bytes
    /// @param salt the message to be signed, expected length is 40 bytes
    /// @param s2 second part of the signature in Compacted representation, expected length is 32 uint256
    /// @param ntth public key in the ntt domain, compacted 16 coefficients of 16 bits per word
    /// @return result boolean result of the verification
    function verify(
        bytes memory h,
        bytes memory salt,
        uint256[] memory s2,
        uint256[] memory ntth
    )
        external
        view
        returns (bool result)
    {
        if (salt.length != 40) {
            revert("invalid salt length");
        }
        if (s2.length != falcon_S256) {
            revert("invalid s2 length");
        }
        if (ntth.length != falcon_S256) {
            revert("invalid ntth length");
        }

        uint256[] memory hashed = hashToPointRIP(salt, h);

        result = falcon_core_precompile(s2, ntth, hashed);

        return result;
    }

    function GetPublicKey(address _from) external view override returns (uint256[] memory Kpub) {
        Kpub = new uint256[](32);

        assembly {
            let offset := Kpub

            for { let i := 0 } gt(1024, i) { i := add(i, 32) } {
                offset := add(offset, 32)
                extcodecopy(_from, offset, i, 32)
            }
        }
        return Kpub;
    }
}
