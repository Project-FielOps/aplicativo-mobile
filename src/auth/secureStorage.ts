import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Armazenamento do segredo de sessão, com a mesma superfície do
 * `expo-secure-store`.
 *
 * No aparelho o refresh token vai para o SecureStore (Keychain/Keystore), como
 * descrito em `AuthContext`. No navegador — onde o app roda apenas em
 * desenvolvimento, para inspecionar telas sem um celular em mãos — o
 * `expo-secure-store` não existe e qualquer chamada lança. Ali caímos para o
 * `localStorage`, que não tem a proteção do sistema mas também não sai da
 * máquina do desenvolvedor.
 */

const isWeb = Platform.OS === 'web';

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
