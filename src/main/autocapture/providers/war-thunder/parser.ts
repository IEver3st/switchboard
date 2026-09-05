import { z } from 'zod';
import type { GameEvent } from '../../../../shared/contracts';

const hudMessageSchema = z.object({
  id: z.number().int().nonnegative(),
  msg: z.string().trim().min(1).max(512),
  time: z.number().nonnegative().optional(),
});

export const warThunderHudResponseSchema = z.object({
  events: z.array(hudMessageSchema).max(4_096).default([]),
  damage: z.array(hudMessageSchema).max(4_096).default([]),
});

export type WarThunderHudResponse = z.infer<typeof warThunderHudResponseSchema>;

export type WarThunderPlayerIdentity =
  | { mode: 'nickname'; nickname: string }
  | { mode: 'anonymous'; squadronTag: string };

type ParsedCombatAction = {
  actor: string;
  action: 'destroyed' | 'shot down';
  target: string;
};

type SequencedHudMessage = WarThunderHudResponse['damage'][number] & {
  stream: 'event' | 'damage';
};

const combatActions = [' destroyed ', ' shot down '] as const;

export class WarThunderTelemetryParser {
  private lastEventId = 0;
  private lastDamageId = 0;

  public reset(): void {
    this.lastEventId = 0;
    this.lastDamageId = 0;
  }

  public baseline(payload: unknown): void {
    const parsed = warThunderHudResponseSchema.parse(payload);
    this.lastEventId = highestId(parsed.events, this.lastEventId);
    this.lastDamageId = highestId(parsed.damage, this.lastDamageId);
  }

  public parse(payload: unknown, player: string | WarThunderPlayerIdentity | null, receivedAt = Date.now()): GameEvent[] {
    const parsed = warThunderHudResponseSchema.parse(payload);
    const messages = [
      ...parsed.events.filter((message) => message.id > this.lastEventId).map((message) => ({ ...message, stream: 'event' as const })),
      ...parsed.damage.filter((message) => message.id > this.lastDamageId).map((message) => ({ ...message, stream: 'damage' as const })),
    ].sort((left, right) => left.id - right.id);
    this.lastEventId = highestId(parsed.events, this.lastEventId);
    this.lastDamageId = highestId(parsed.damage, this.lastDamageId);
    if (!player) return [];
    const identity: WarThunderPlayerIdentity = typeof player === 'string' ? { mode: 'nickname', nickname: player } : player;

    const events: GameEvent[] = [];
    const emitted = new Set<string>();
    for (const message of messages) {
      const event = eventFromMessage(message, identity, receivedAt);
      if (!event || emitted.has(event.id)) continue;
      emitted.add(event.id);
      events.push(event);
    }
    return events;
  }

  public cursor(): { lastEventId: number; lastDamageId: number } {
    return { lastEventId: this.lastEventId, lastDamageId: this.lastDamageId };
  }
}

function eventFromMessage(
  message: SequencedHudMessage,
  identity: WarThunderPlayerIdentity,
  timestamp: number,
): GameEvent | null {
  const combat = parseCombatAction(message.msg);
  if (combat) {
    if (combatantMatches(combat.actor, identity)) {
      if (isBaseTarget(combat.target)) {
        return createEvent(message.stream, message.id, 'objective', timestamp, 'Base destroyed', {
          sequence: message.id,
          objective: 'completed',
          code: 'base_destroyed',
        });
      }
      return createEvent(
        message.stream,
        message.id,
        'kill',
        timestamp,
        combat.action === 'shot down' ? 'Aircraft shot down' : 'Target destroyed',
        { sequence: message.id, code: combat.action.replace(' ', '_') },
      );
    }
    if (combatantMatches(combat.target, identity)) {
      return createEvent(message.stream, message.id, 'death', timestamp, 'Vehicle lost', {
        sequence: message.id,
        code: combat.action.replace(' ', '_'),
      });
    }
    return null;
  }

  const crashActor = actorBeforeSuffix(message.msg, ' has crashed');
  if (crashActor && combatantMatches(crashActor, identity)) {
    return createEvent(message.stream, message.id, 'death', timestamp, 'Vehicle lost', {
      sequence: message.id,
      code: 'crashed',
    });
  }
  return null;
}

function createEvent(
  stream: SequencedHudMessage['stream'],
  sequence: number,
  type: GameEvent['type'],
  timestamp: number,
  label: string,
  metadata: NonNullable<GameEvent['metadata']>,
): GameEvent {
  return {
    id: `war-thunder-8111:${stream}:${sequence}:${type}`,
    gameId: 'war-thunder',
    providerId: 'war-thunder-8111',
    type,
    timestamp,
    confidence: 1,
    label,
    metadata,
    source: 'api',
  };
}

function parseCombatAction(message: string): ParsedCombatAction | null {
  const normalized = message.trim().replace(/[.!]+$/u, '');
  const lower = normalized.toLocaleLowerCase();
  for (const separator of combatActions) {
    const index = lower.indexOf(separator);
    if (index <= 0) continue;
    const targetStart = index + separator.length;
    const actor = normalized.slice(0, index).trim();
    const target = normalized.slice(targetStart).trim();
    if (!actor || !target) return null;
    return { actor, action: separator.trim() as ParsedCombatAction['action'], target };
  }
  return null;
}

function actorBeforeSuffix(message: string, suffix: string): string | null {
  const normalized = message.trim().replace(/[.!]+$/u, '');
  const index = normalized.toLocaleLowerCase().indexOf(suffix);
  if (index <= 0) return null;
  return normalized.slice(0, index).trim() || null;
}

function combatantMatches(value: string, identity: WarThunderPlayerIdentity): boolean {
  const actor = normalizeCombatant(stripTrailingVehicle(value));
  const tagged = splitSquadron(actor);
  if (identity.mode === 'anonymous') {
    const tag = normalizeSquadronTag(identity.squadronTag);
    return Boolean(tag) && tagged?.tag === tag && tagged.name === 'player';
  }
  const player = normalizeCombatant(identity.nickname);
  // Only a delimited squadron may precede the nickname. Arbitrary suffix
  // matching mistakes another player's multi-word nickname for the local user.
  return Boolean(player) && (actor === player || tagged?.name === player);
}

function splitSquadron(value: string): { tag: string; name: string } | null {
  const match = /^(?:\[([^\]]+)\]|=([^=]+)=|\^([^\^]+)\^|-([^-]+)-|\*([^*]+)\*)\s+(.+)$/u.exec(value);
  if (!match) return null;
  return { tag: (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5])!.trim(), name: match[6]! };
}

export function normalizeSquadronTag(value: string): string {
  const normalized = normalizeCombatant(value);
  return splitSquadron(`${normalized} player`)?.tag ?? normalized;
}

function stripTrailingVehicle(value: string): string {
  const input = value.trim();
  if (!input.endsWith(')')) return input;
  let depth = 0;
  for (let index = input.length - 1; index >= 0; index -= 1) {
    const character = input[index];
    if (character === ')') depth += 1;
    else if (character === '(') {
      depth -= 1;
      if (depth === 0 && index > 0 && input[index - 1] === ' ') return input.slice(0, index - 1).trim();
    }
  }
  return input;
}

function normalizeCombatant(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
}

function isBaseTarget(value: string): boolean {
  const normalized = normalizeCombatant(value);
  return normalized === 'a base' || normalized === 'enemy base' || normalized.endsWith(' base');
}

function highestId(messages: readonly { id: number }[], current: number): number {
  return messages.reduce((highest, message) => Math.max(highest, message.id), current);
}
