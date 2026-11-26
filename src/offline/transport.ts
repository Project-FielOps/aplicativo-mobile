import { evidence as evidenceApi, mobileSync } from '../api/endpoints';
import type { PushResult, SyncTransport } from './engine';

/** Transporte real do app: push idempotente e upload idempotente da FieldOps API. */
export const apiTransport: SyncTransport = {
  async push(deviceId, operations) {
    const response = await mobileSync.push(deviceId, operations);
    return response.results as PushResult[];
  },
  async uploadEvidence(entry) {
    const op = entry.operation;
    if (op.kind !== 'evidence') throw new Error('Operação não é evidência.');
    await evidenceApi.upload(op.inspectionId, op.photo, {
      operationId: entry.id,
      inspectionItemId: op.itemId ?? null,
      nonConformityOperationId: op.nonConformityOperationId ?? null,
      description: op.description,
      latitude: op.latitude,
      longitude: op.longitude,
    });
  },
};
