import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { GameEvent } from '../../../../shared/contracts';

const gepEventSchema = z.object({
  name: z.string().trim().min(1).max(64),
  data: z.union([z.string().max(64), z.null()]).optional(),
});

export const battlefield6GepPayloadSchema = z.object({
  events: z.array(gepEventSchema).max(32),
});

export const battlefield6GepInfoSchema = z.object({
  feature: z.string().trim().min(1).max(64),
  category: z.string().trim().min(1).max(64),
  key: z.string().trim().min(1).max(64),
  value: z.string().max(64),
});

export class Battlefield6EventParser {
  private sequence = 0;
  private sessionId = '';

  public constructor(private readonly createSessionId: () => string = randomUUID) {
    this.beginSession();
  }

  public beginSession(): void {
    this.sessionId = this.createSessionId();
    this.sequence = 0;
  }

  public parse(payload: unknown, receivedAt = Date.now()): GameEvent[] {
    const parsed = battlefield6GepPayloadSchema.parse(payload);
    const events: GameEvent[] = [];
    for (const event of parsed.events) {
      const normalized = normalizeEvent(event.name, event.data);
      if (!normalized) continue;
      this.sequence += 1;
      events.push({
        id: `battlefield-6-overwolf-gep:${this.sessionId}:${this.sequence}`,
        gameId: 'battlefield-6',
        providerId: 'battlefield-6-overwolf-gep',
        type: normalized.type,
        timestamp: receivedAt,
        confidence: 1,
        label: normalized.label,
        metadata: { code: normalized.code, sequence: this.sequence },
        source: 'api',
      });
    }
    return events;
  }

  public readScene(payload: unknown): 'lobby' | 'ingame' | 'summary' | null {
    const parsed = battlefield6GepInfoSchema.safeParse(payload);
    if (!parsed.success || parsed.data.feature !== 'game_info' || parsed.data.key !== 'scene') return null;
    return parsed.data.value === 'lobby' || parsed.data.value === 'ingame' || parsed.data.value === 'summary'
      ? parsed.data.value
      : null;
  }
}

function normalizeEvent(name: string, data: string | null | undefined): {
  type: GameEvent['type'];
  label: string;
  code: string;
} | null {
  if (name === 'elimination' && (data === undefined || data === null || data === '' || data === 'elimination')) {
    return { type: 'kill', label: 'Elimination', code: 'elimination' };
  }
  if (name === 'knockdown' && (data === undefined || data === null || data === '' || data === 'knockdown')) {
    return { type: 'knockdown', label: 'Knocked Down', code: 'knockdown' };
  }
  if (name === 'round_outcome' && data === 'victory') {
    return { type: 'round_win', label: 'Victory', code: 'victory' };
  }
  if (name === 'round_outcome' && data === 'defeat') {
    return { type: 'round_loss', label: 'Defeat', code: 'defeat' };
  }
  return null;
}
