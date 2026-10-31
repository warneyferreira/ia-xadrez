import { freemem } from 'node:os';

export const MEMORY_PROFILES = {
  balanced: { label: 'Equilibrado', hashMB: 256 },
  strong: { label: 'Busca longa · 2 GB', hashMB: 2048 },
  maximum: { label: 'Arthur máximo · 10 GB', hashMB: 10240 },
} as const;
export type MemoryProfile = keyof typeof MEMORY_PROFILES;

export function memoryBudget(hashMB: number, availableBytes = freemem(), opponentHashMB = 128) {
  // A reserva cobre a engine adversária, redes NNUE, threads e margem para o SO.
  const requiredBytes = (hashMB + opponentHashMB + 1024) * 1024 * 1024;
  return { availableBytes, requiredBytes, fits: availableBytes >= requiredBytes };
}

export function requireMemory(hashMB: number, availableBytes?: number, opponentHashMB = 128) {
  const memory = memoryBudget(hashMB, availableBytes, opponentHashMB);
  if (!memory.fits)
    throw new Error(
      `Perfil solicita ${(hashMB / 1024).toFixed(2)} GB de Hash. Há ${(memory.availableBytes / 2 ** 30).toFixed(2)} GB de RAM livres; são necessários ${(memory.requiredBytes / 2 ** 30).toFixed(2)} GB livres incluindo o adversário e a reserva. Feche aplicativos que você não estiver usando ou escolha um perfil menor. A partida anterior foi preservada.`,
    );
  return memory;
}
