/**
 * PIPEDA-compliant PII storage wrapper.
 *
 * Health card numbers, driver's licences, and street addresses
 * NEVER leave the device. They are stored in the OS secure enclave
 * via expo-secure-store and are never transmitted to Supabase.
 */
import * as SecureStore from "expo-secure-store";
import { PIIKey, PII_KEYS } from "@/types/database";

const KEY_PREFIX = "relogo_pii_";

function prefixedKey(key: PIIKey): string {
  return `${KEY_PREFIX}${key}`;
}

/**
 * Save a PII value to the device secure enclave.
 */
export async function savePII(key: PIIKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(prefixedKey(key), value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/**
 * Retrieve a PII value from the device secure enclave.
 * Returns null if the key has not been set.
 */
export async function getPII(key: PIIKey): Promise<string | null> {
  return SecureStore.getItemAsync(prefixedKey(key));
}

/**
 * Delete a single PII value from the secure enclave.
 */
export async function deletePII(key: PIIKey): Promise<void> {
  await SecureStore.deleteItemAsync(prefixedKey(key));
}

/**
 * Delete ALL PII values from the secure enclave.
 * Called during "Delete My Data" flow for PIPEDA compliance.
 */
export async function deleteAllPII(): Promise<void> {
  const deletions = PII_KEYS.map((key) =>
    SecureStore.deleteItemAsync(prefixedKey(key)),
  );
  await Promise.all(deletions);
}
