import { keccak256, pad, toHex } from "viem";
import * as secp from "@noble/secp256k1";

export const getPrivateKeyForSigner = (params: {
    ephemeralPrivateKey: `0x${string}`;
    spendingPrivateKey: `0x${string}`;
    spendingPublicKey: `0x${string}`;
  }) => {
    const sharedSecret = secp.getSharedSecret(
      params.ephemeralPrivateKey.slice(2),
      params.spendingPublicKey.slice(2),
      false
    );
    // // Hash the shared secret
    const hashedSharedSecret = keccak256(toHex(sharedSecret.slice(1)));
  
    // Multiply the spending private key by the hashed shared secret
    const stealthAddressSignerPrivateKey =
      (BigInt(params.spendingPrivateKey) * BigInt(hashedSharedSecret)) %
      secp.CURVE.n;
  
    return pad(toHex(stealthAddressSignerPrivateKey));
  };