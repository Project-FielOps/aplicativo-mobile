import { equipment as equipmentApi, inspections as inspectionsApi } from '../api/endpoints';
import type { Equipment, InspectionDetail, InspectionSummary } from '../api/types';
import { cache, withCache } from './cache';

/** Carteira do técnico: rede quando há, cache local quando não há. */
export async function listMine(userId: string | undefined): Promise<{ content: InspectionSummary[]; fromCache: boolean }> {
  const { value, fromCache } = await withCache(
    async () => (await inspectionsApi.list({ technicianId: userId, size: 100, sort: 'scheduledFor,asc' })).content,
    () => cache.getList(),
    (items) => cache.putList(items),
  );
  return { content: value, fromCache };
}

export function getInspection(id: string): Promise<{ value: InspectionDetail; fromCache: boolean }> {
  return withCache(() => inspectionsApi.get(id), () => cache.getInspection(id), (d) => cache.putInspection(d));
}

export async function getEquipment(id: string): Promise<Equipment | null> {
  try {
    const { value } = await withCache(() => equipmentApi.get(id), () => cache.getEquipment(id), (e) => cache.putEquipment(e));
    return value;
  } catch {
    return null;
  }
}
