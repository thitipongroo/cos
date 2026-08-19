// Jest mock for 'expo-secure-store'.
//
// The real module pulls expo-modules-core, which reaches for the native runtime (globalThis.expo)
// at import time and throws off-device. Only three APIs are used across the app (grep
// 'SecureStore\.'), and they are backed here by an in-memory map so a store that persists to
// SecureStore behaves normally under test instead of being stubbed out to undefined.

const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test helper — drop everything between specs. Not part of the real module's surface. */
export function __reset(): void {
  store.clear();
}
