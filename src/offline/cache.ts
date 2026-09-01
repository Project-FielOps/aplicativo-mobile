import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InspectionDetail, InspectionSummary } from '../api/types';

/**
 * Cache local de leitura.
 *
 * A fila cuida do que o técnico escreve; isto cuida do que ele precisa ler. Sem
 * o cache, abrir um checklist em uma casa de máquinas sem sinal mostraria uma
 * tela de erro — e a inspeção pararia.
 */

const DETAIL_PREFIX = 'fieldops.cache.inspection.';
const LIST_KEY = 'fieldops.cache.inspections';

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache é conveniência: falha ao gravar não pode derrubar a tela.
  }
}

export const cache = {
  getInspection: (id: string) => readJson<InspectionDetail>(DETAIL_PREFIX + id),
  putInspection: (detail: InspectionDetail) => writeJson(DETAIL_PREFIX + detail.id, detail),

  getList: () => readJson<InspectionSummary[]>(LIST_KEY),
  putList: (items: InspectionSummary[]) => writeJson(LIST_KEY, items),

  async clear(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(DETAIL_PREFIX) || k === LIST_KEY);
    if (ours.length) await AsyncStorage.multiRemove(ours);
  },
};

/**
 * Busca na rede e guarda; se a rede falhar, entrega o que estiver em cache.
 * O `fromCache` deixa a tela avisar que o dado pode estar desatualizado.
 */
export async function withCache<T>(
  fetcher: () => Promise<T>,
  read: () => Promise<T | null>,
  write: (value: T) => Promise<void>,
): Promise<{ value: T; fromCache: boolean }> {
  try {
    const value = await fetcher();
    await write(value);
    return { value, fromCache: false };
  } catch (error) {
    const cached = await read();
    if (cached) return { value: cached, fromCache: true };
    throw error;
  }
}
