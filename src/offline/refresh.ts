import { HttpError } from '../api/errors';
import { equipment as equipmentApi, inspections as inspectionsApi, mobileSync } from '../api/endpoints';
import { cache } from './cache';
import { meta } from './database';
import { session } from './session';

const OPEN = ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'];

/**
 * Traz para o aparelho o que mudou no servidor e deixa a carteira do técnico pronta para
 * uso offline: lê o feed `/mobile/sync/pull` por cursor (atribuições, cancelamentos,
 * revisões feitas na web) e baixa detalhe + snapshot de cada inspeção em aberto.
 * O cursor só avança depois que o lote foi gravado no cache.
 */
export async function refreshFromServer(): Promise<{ changed: number }> {
  const userId = session.userId;
  if (!userId) return { changed: 0 };
  const cursorKey = `cursor:${userId}`;
  let cursor = (await meta.get(cursorKey)) ?? '0';
  const changedInspections = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    const { changes, nextCursor } = await mobileSync.pull(cursor);
    for (const change of changes) if (change.entityType === 'Inspection') changedInspections.add(change.entityId);
    for (const id of changedInspections) {
      try {
        await cache.putInspection(await inspectionsApi.get(id));
      } catch (error) {
        // Desatribuída ou removida: não deve mais aparecer offline para este técnico.
        if (error instanceof HttpError && (error.status === 403 || error.status === 404)) await cache.removeInspection(id);
        else throw error;
      }
    }
    await meta.set(cursorKey, nextCursor);
    if (changes.length < 100 || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  const list = await inspectionsApi.list({ technicianId: userId, size: 100 });
  await cache.putList(list.content);
  for (const summary of list.content) {
    if (!OPEN.includes(summary.status) || changedInspections.has(summary.id)) continue;
    const detail = await inspectionsApi.get(summary.id).catch(() => null);
    if (detail) await cache.putInspection(detail);
    if (summary.equipmentId) {
      const asset = await equipmentApi.get(summary.equipmentId).catch(() => null);
      if (asset) await cache.putEquipment(asset);
    }
  }
  return { changed: changedInspections.size };
}
