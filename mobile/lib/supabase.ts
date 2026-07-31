/**
 * Supabase client initialisation.
 *
 * Session storage uses the "LargeSecureStore" pattern from the official
 * Supabase Expo guide: the session JSON regularly exceeds expo-secure-store's
 * 2048-byte value limit, so the session is AES-256-CTR encrypted, the
 * ciphertext lives in AsyncStorage, and the random encryption key lives in
 * the OS secure enclave via expo-secure-store. Net effect: sessions of any
 * size, still unreadable without the enclave-held key.
 */
import "react-native-url-polyfill/auto";
import "react-native-get-random-values";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as aesjs from "aes-js";
import type { Database } from "@/types/database";
import { resolveSupabaseConfig } from "@/lib/supabaseConfig";

const resolvedConfig = resolveSupabaseConfig(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);
export const supabaseConfigurationError = resolvedConfig.error;

class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));

    const cipher = new aesjs.ModeOfOperation.ctr(
      encryptionKey,
      new aesjs.Counter(1),
    );
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(
      key,
      aesjs.utils.hex.fromBytes(encryptionKey),
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
    );

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private decrypt(value: string, encryptionKeyHex: string): string {
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    // Native storage bridges are independent. Reading the ciphertext and its
    // enclave-held key concurrently removes one full bridge round-trip from
    // every returning user's session restore on a physical phone.
    const [encrypted, encryptionKeyHex] = await Promise.all([
      AsyncStorage.getItem(key),
      SecureStore.getItemAsync(key),
    ]);
    if (!encrypted || !encryptionKeyHex) {
      return null;
    }
    return this.decrypt(encrypted, encryptionKeyHex);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

export const supabase = createClient<Database>(
  resolvedConfig.url,
  resolvedConfig.anonKey,
  {
    auth: {
      storage: new LargeSecureStore(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresh auth tokens only while the app is foregrounded, per the
// official Supabase React Native guidance.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
