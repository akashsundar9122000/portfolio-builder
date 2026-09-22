import type { GenerationStatus } from "./types";

/**
 * The generation state machine. Terminal states never change; PROCESSING
 * may go back to QUEUED because AI Horde restarts jobs whose worker
 * dropped out.
 */
const NEXT: Record<GenerationStatus, GenerationStatus[]> = {
  PENDING: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "TIMEOUT", "CANCELLED"],
  QUEUED: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "TIMEOUT", "CANCELLED"],
  PROCESSING: ["PROCESSING", "QUEUED", "COMPLETED", "FAILED", "TIMEOUT", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  TIMEOUT: [],
};

export const TERMINAL: GenerationStatus[] = ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"];

export function isTerminal(s: GenerationStatus): boolean {
  return TERMINAL.includes(s);
}

export function canTransition(from: GenerationStatus, to: GenerationStatus): boolean {
  return NEXT[from].includes(to);
}

export function transition(from: GenerationStatus, to: GenerationStatus): GenerationStatus {
  if (!canTransition(from, to)) throw new Error(`Illegal generation transition ${from} → ${to}`);
  return to;
}
