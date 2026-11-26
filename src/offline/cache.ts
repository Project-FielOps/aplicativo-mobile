import type { Equipment, InspectionDetail, InspectionSummary } from '../api/types';
import { getDatabase } from './database';
import { session } from './session';

const scoped = (key: string) => `${session.userId ?? 'anon'}:${key}`;
async function readJson<T>(key: string): Promise<T | null> { try { const db = await getDatabase(); const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM local_cache WHERE cache_key = ?', scoped(key)); return row ? JSON.parse(row.value) as T : null; } catch { return null; } }
async function writeJson(key: string, value: unknown): Promise<void> { try { const db = await getDatabase(); await db.runAsync('INSERT OR REPLACE INTO local_cache (cache_key, value, updated_at) VALUES (?, ?, ?)', scoped(key), JSON.stringify(value), new Date().toISOString()); } catch { /* cache não deve derrubar a tela */ } }
async function removeKey(key: string): Promise<void> { try { const db = await getDatabase(); await db.runAsync('DELETE FROM local_cache WHERE cache_key = ?', scoped(key)); } catch { /* idem */ } }

const DETAIL = 'inspection.';
const LIST = 'inspections';
const EQUIPMENT = 'equipment.';
export const cache = {
  getInspection: (id: string) => readJson<InspectionDetail>(DETAIL + id),
  putInspection: (detail: InspectionDetail) => writeJson(DETAIL + detail.id, detail),
  removeInspection: (id: string) => removeKey(DETAIL + id),
  getList: () => readJson<InspectionSummary[]>(LIST),
  putList: (items: InspectionSummary[]) => writeJson(LIST, items),
  getEquipment: (id: string) => readJson<Equipment>(EQUIPMENT + id),
  putEquipment: (item: Equipment) => writeJson(EQUIPMENT + item.id, item),
  async clear(): Promise<void> { const db = await getDatabase(); await db.runAsync('DELETE FROM local_cache WHERE cache_key LIKE ?', `${session.userId ?? 'anon'}:%`); },
};
export async function withCache<T>(fetcher: () => Promise<T>, read: () => Promise<T | null>, write: (value: T) => Promise<void>): Promise<{ value: T; fromCache: boolean }> { try { const value = await fetcher(); await write(value); return { value, fromCache: false }; } catch (error) { const cached = await read(); if (cached) return { value: cached, fromCache: true }; throw error; } }
