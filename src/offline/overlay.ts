import type { InspectionDetail, InspectionStatus, InspectionSummary } from '../api/types';
import type { QueueEntry, SyncStatus } from './types';

/**
 * Visão local de uma inspeção: o status oficial do servidor mais o que ainda está na fila.
 * O status oficial nunca é trocado pelo local (ADR-008): `localStatus` é só o que o técnico
 * vê enquanto o servidor não confirma.
 */
export interface LocalState {
  syncStatus: SyncStatus;
  /** Status que a tela deve considerar para habilitar ações. */
  localStatus: InspectionStatus;
  /** Envio feito no aparelho e ainda não confirmado: "Aguardando sincronização". */
  pendingSubmit: boolean;
  conflictMessage: string | null;
}

export function localState(status: InspectionStatus, inspectionId: string, entries: QueueEntry[]): LocalState {
  const mine = entries.filter((e) => e.operation.inspectionId === inspectionId);
  const conflict = mine.find((e) => e.state === 'conflict');
  const has = (kind: string) => mine.some((e) => e.operation.kind === kind);

  let localStatus = status;
  if (status === 'ASSIGNED' && has('start')) localStatus = 'IN_PROGRESS';
  if (status === 'REJECTED' && has('reopen')) localStatus = 'IN_PROGRESS';

  return {
    syncStatus: conflict ? 'conflict' : mine.length > 0 ? 'pending' : 'synced',
    localStatus,
    pendingSubmit: has('submit'),
    conflictMessage: conflict?.lastError ?? null,
  };
}

/** Respostas da fila aplicadas por cima do snapshot que veio do servidor (ou do cache). */
export function withPendingAnswers(detail: InspectionDetail, entries: QueueEntry[]): InspectionDetail {
  const latest = new Map<string, Extract<QueueEntry['operation'], { kind: 'answer' }>['answer']>();
  for (const entry of entries) {
    const op = entry.operation;
    if (op.kind === 'answer' && op.inspectionId === detail.id) latest.set(op.answer.inspectionItemId, op.answer);
  }
  if (latest.size === 0) return detail;
  return {
    ...detail,
    items: detail.items.map((item) => {
      const local = latest.get(item.id);
      if (!local) return item;
      return {
        ...item,
        answer: {
          id: item.answer?.id ?? `local-${item.id}`,
          inspectionItemId: item.id,
          valueText: local.valueText ?? null,
          valueNumber: local.valueNumber ?? null,
          valueBoolean: local.valueBoolean ?? null,
          valueDate: local.valueDate ?? null,
          valueJson: local.valueJson ?? null,
          observation: local.observation ?? null,
          conformity: local.conformity ?? null,
          answeredBy: item.answer?.answeredBy ?? null,
          serverReceivedAt: item.answer?.serverReceivedAt ?? null,
          version: item.answer?.version ?? 0,
        },
      };
    }),
  };
}

export type LocalSummary = InspectionSummary & LocalState;

export function withLocalState(list: InspectionSummary[], entries: QueueEntry[]): LocalSummary[] {
  return list.map((inspection) => {
    const state = localState(inspection.status, inspection.id, entries);
    return { ...inspection, ...state, status: state.localStatus };
  });
}

/** Fotos ainda na fila ligadas a um item do checklist. */
export function queuedPhotosFor(entries: QueueEntry[], inspectionId: string, itemId: string): number {
  return entries.filter(
    (e) => e.operation.kind === 'evidence' && e.operation.inspectionId === inspectionId && e.operation.itemId === itemId,
  ).length;
}
