import type { InspectionDetail, InspectionSummary } from '../api/types';
import { getDatabase } from './database';

async function readJson<T>(key: string): Promise<T | null> { try { const db = await getDatabase(); const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM local_cache WHERE cache_key = ?', key); return row ? JSON.parse(row.value) as T : null; } catch { return null; } }
async function writeJson(key: string, value: unknown): Promise<void> { try { const db = await getDatabase(); await db.runAsync('INSERT OR REPLACE INTO local_cache (cache_key, value, updated_at) VALUES (?, ?, ?)', key, JSON.stringify(value), new Date().toISOString()); } catch { /* cache não deve derrubar a tela */ } }

const DETAIL_PREFIX = 'fieldops.cache.inspection.';
const LIST_KEY = 'fieldops.cache.inspections';
export const cache = { getInspection: (id: string) => readJson<InspectionDetail>(DETAIL_PREFIX + id), putInspection: (detail: InspectionDetail) => writeJson(DETAIL_PREFIX + detail.id, detail), getList: () => readJson<InspectionSummary[]>(LIST_KEY), putList: (items: InspectionSummary[]) => writeJson(LIST_KEY, items), async clear(): Promise<void> { const db = await getDatabase(); await db.runAsync("DELETE FROM local_cache WHERE cache_key = ? OR cache_key LIKE 'fieldops.cache.inspection.%'", LIST_KEY); } };
export async function withCache<T>(fetcher: () => Promise<T>, read: () => Promise<T | null>, write: (value: T) => Promise<void>): Promise<{ value: T; fromCache: boolean }> { try { const value = await fetcher(); await write(value); return { value, fromCache: false }; } catch (error) { const cached = await read(); if (cached) return { value: cached, fromCache: true }; throw error; } }
