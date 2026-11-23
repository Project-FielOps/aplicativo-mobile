import { getDatabase } from '../offline/database';
import { useCallback, useEffect, useState } from 'react';

const listeners = new Set<() => void>();

export const verification = {
  async isVerified(inspectionId: string, equipmentId: string | null): Promise<boolean> { if (!equipmentId) return true; const db = await getDatabase(); const row = await db.getFirstAsync<{ equipment_id: string }>('SELECT equipment_id FROM verified_equipment WHERE inspection_id = ?', inspectionId); return row?.equipment_id === equipmentId; },
  async markVerified(inspectionId: string, equipmentId: string): Promise<void> { const db = await getDatabase(); await db.runAsync('INSERT OR REPLACE INTO verified_equipment (inspection_id, equipment_id, verified_at) VALUES (?, ?, ?)', inspectionId, equipmentId, new Date().toISOString()); listeners.forEach((listener) => listener()); },
  async clear(inspectionId: string): Promise<void> { const db = await getDatabase(); await db.runAsync('DELETE FROM verified_equipment WHERE inspection_id = ?', inspectionId); listeners.forEach((listener) => listener()); },
};

export function useVerification(inspectionId: string | undefined, equipmentId: string | null) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const refresh = useCallback(async () => { if (inspectionId) setVerified(await verification.isVerified(inspectionId, equipmentId)); }, [inspectionId, equipmentId]);
  useEffect(() => { void refresh(); listeners.add(refresh); return () => { listeners.delete(refresh); }; }, [refresh]);
  return { verified, refresh };
}
