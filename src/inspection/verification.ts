import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Verificação do ativo por QR Code.
 *
 * O protótipo bloqueia o início da inspeção enquanto o técnico não confirma, no
 * local, que está diante do equipamento certo — é o que evita inspecionar o
 * ativo vizinho e assinar por ele. O backend não guarda esse estado (não existe
 * endpoint para isso), então ele vive no aparelho, por inspeção.
 */

const KEY = 'fieldops.verifiedEquipment.v1';

type VerifiedMap = Record<string, { equipmentId: string; at: string }>;

const listeners = new Set<() => void>();
let cache: VerifiedMap | null = null;

async function read(): Promise<VerifiedMap> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as VerifiedMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function write(next: VerifiedMap): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn());
}

export const verification = {
  async isVerified(inspectionId: string, equipmentId: string | null): Promise<boolean> {
    if (!equipmentId) return true; // Inspeção sem ativo não tem o que verificar.
    const map = await read();
    return map[inspectionId]?.equipmentId === equipmentId;
  },

  async markVerified(inspectionId: string, equipmentId: string): Promise<void> {
    const map = await read();
    await write({ ...map, [inspectionId]: { equipmentId, at: new Date().toISOString() } });
  },

  async clear(inspectionId: string): Promise<void> {
    const map = await read();
    const next = { ...map };
    delete next[inspectionId];
    await write(next);
  },
};

/** Reage a verificações feitas em outra tela (o scanner é um modal). */
export function useVerification(inspectionId: string | undefined, equipmentId: string | null) {
  const [verified, setVerified] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!inspectionId) return;
    setVerified(await verification.isVerified(inspectionId, equipmentId));
  }, [inspectionId, equipmentId]);

  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [refresh]);

  return { verified, refresh };
}
