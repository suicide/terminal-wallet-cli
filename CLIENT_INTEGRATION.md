# Railgun HTTP Broadcaster Client Integration Guide

This guide describes how to integrate the Railgun HTTP Broadcaster (MVP) into an existing Railgun Client (Wallet).

## 1. Overview

The HTTP Broadcaster replaces or supplements the Waku P2P layer. It allows the client to:

1.  **Discover Fees:** Get real-time gas prices and the Broadcaster's Public Key.
2.  **Submit Transactions:** Send encrypted transaction requests directly via HTTP.

## 2. Configuration

To use the HTTP Broadcaster, the client application must have the broadcaster's URL configured.

**Recommended Config Structure:**

```typescript
// config.ts
export const BROADCASTER_URL = 'https://your-broadcaster-instance.com'; // No trailing slash
```

## 3. The Handshake (Fee Discovery)

Before generating a transaction, you must fetch the fee schedule and the broadcaster's identity.

**Endpoint:** `GET /fees/:chain_id`

### Client Implementation

```typescript
import { verifyWalletViewingKey } from '@railgun-community/wallet';

export interface BroadcasterFees {
  fees: Record<string, string>; // Token Address -> Hex Fee
  feeExpiration: number;
  feesID: string; // Critical: Must be included in Tx
  railgunAddress: string; // Broadcaster Identity
  identifier: string;
  reliability: number;
  // Required fields for Validation
  version: string;
  relayAdapt: string; // EVM Address
  requiredPOIListKeys: string[];
  availableWallets: number;
}

export const fetchBroadcasterFees = async (
  broadcasterUrl: string,
  chainID: number,
): Promise<BroadcasterFees> => {
  const response = await fetch(`${broadcasterUrl}/fees/${chainID}`);

  if (!response.ok) {
    throw new Error(`Broadcaster Fee Error: ${response.statusText}`);
  }

  // 1. Get Raw Text for Signature Verification
  // CRITICAL: We must verify the signature against the EXACT string returned by the server.
  // Parsing to JSON first reorders keys and invalidates the signature.
  const rawBody = await response.text();
  const json = JSON.parse(rawBody);
  const { data, signature } = json;

  // 2. Reconstruct the signed payload string
  // The server signs the JSON string of the 'data' property.
  // We need to extract the 'data' part from the raw string carefully,
  // or (safer) if the server returns { data, signature }, verifying the
  // specific substring or using a canonical serializer if the server supports it.

  // OPTIMAL APPROACH (If Server signs canonical):
  // For this MVP, we rely on the library verification which might expect the object.
  // If strict byte-matching is required:
  // const signedPayload = rawBody.match(/"data":(\{.*\})\,"signature"/)[1];

  // STANDARD APPROACH (Using SDK):
  const isValid = await verifyWalletViewingKey(data.railgunAddress, data, signature);

  if (!isValid) {
    throw new Error('Broadcaster Fee Signature Invalid - Potential MITM or Config Error');
  }

  return data as BroadcasterFees;
};
```

## 4. Transaction Submission

Once you have the `feesID` and `railgunAddress` from the handshake, you can submit a transaction.

**Endpoint:** `POST /transact`

### Client Implementation

```typescript
import {
  encryptJSONDataWithSharedKey,
  decryptJSONDataWithSharedKey,
} from '@railgun-community/wallet';
import { RailgunAddress } from '@railgun-community/shared-models';
import * as ed from '@noble/ed25519';

export const submitBroadcasterTx = async (
  broadcasterUrl: string,
  chainID: number,
  railgunWalletID: string, // The User's Wallet ID
  broadcasterRailgunAddress: string, // From fetchFees response
  txPayload: object, // The DecryptedPayload structure (see API_SPEC.md)
): Promise<string> => {
  // 1. Generate Ephemeral Keys (Curve25519)
  const clientPrivateKey = ed.utils.randomPrivateKey();
  const clientPublicKey = await ed.getPublicKey(clientPrivateKey);
  const clientPubkeyHex = Buffer.from(clientPublicKey).toString('hex');

  // 2. Decode Broadcaster Key
  // Use the Shared Models library to decode the bech32 address
  const decodedAddress = RailgunAddress.decode(broadcasterRailgunAddress);
  const broadcasterViewingKey = decodedAddress.viewingPublicKey;

  // 3. Derive Shared Secret
  const sharedKey = await ed.getSharedSecret(clientPrivateKey, broadcasterViewingKey);

  // 4. Encrypt Payload
  // Uses AES-GCM via Railgun SDK
  const { ciphertext, iv } = await encryptJSONDataWithSharedKey(sharedKey, txPayload);

  // 5. Construct & Encode Body
  // CRITICAL: The server expects a HEX STRING of the stringified encrypted data array.
  // Format: Hex(JSON.stringify([ciphertext, iv]))
  const encryptedPayload = JSON.stringify([ciphertext, iv]);
  const encryptedDataHex = Buffer.from(encryptedPayload, 'utf8').toString('hex');

  const body = {
    pubkey: clientPubkeyHex,
    encryptedData: encryptedDataHex,
  };

  // 6. Send Request
  const response = await fetch(`${broadcasterUrl}/transact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Tx Submission Failed: ${response.statusText}`);
  }

  // 7. Unwrap JSON-RPC
  const json = await response.json();
  const rpcResult = json.rpcResult;

  if (!rpcResult || !rpcResult.result) {
    throw new Error('Invalid RPC Response format');
  }

  // 8. Decrypt Response (TxHash or Error)
  // The response is also encrypted with the same Shared Secret
  const { cipherText: respCipher, iv: respIV } = rpcResult.result;

  // Use SDK decrypt
  const decryptedResult = await decryptJSONDataWithSharedKey(sharedKey, {
    ciphertext: respCipher,
    iv: respIV,
  });

  return decryptedResult.txHash; // Or handle error object
};
```

## 5. POC Verification Checklist

To verify the POC integration:

- [ ] **Config:** Set `BROADCASTER_URL` to your running instance.
- [ ] **Fees:** Call `fetchBroadcasterFees` and log the returned `fees`.
  - _Success:_ You see gas prices and a valid `railgunAddress`.
  - _Failure:_ "Signature Invalid" (Check JSON stringification) or Connection Refused.
- [ ] **Transact:** Create a small dummy transaction (or real one on Testnet).
  - _Success:_ You receive a `txHash`.
  - _Failure:_ 400 Bad Request (Decryption failed -> Check Keys).
