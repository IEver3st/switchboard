import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { RuntimeHandoff, type RuntimeHandoffState, type RuntimeRole } from '../src/main/services/runtime-handoff';

function fixture() {
  const base = `\\\\.\\pipe\\switchboard-test-${randomUUID()}`;
  const token = 'a'.repeat(64);
  const owners = new Set<string>();
  const events: string[] = [];
  const states = new Map<RuntimeRole, RuntimeHandoffState>();
  let failRelease = false;
  const make = (role: RuntimeRole, overrides: Record<string, unknown> = {}) => new RuntimeHandoff({
    base, token, role,
    acquire: async () => {
      expect(owners.size).toBe(0);
      owners.add(role); events.push(`${role}:acquire`);
    },
    release: async () => {
      if (failRelease && role === 'installed') throw new Error('host still running');
      await Bun.sleep(10); // Models awaited hardware/host cleanup.
      owners.delete(role); events.push(`${role}:release`);
    },
    state: (state) => { states.set(role, state); },
    ...overrides,
  });
  return { make, owners, events, states, failRelease: (value: boolean) => { failRelease = value; } };
}

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Handoff did not settle.');
    await Bun.sleep(5);
  }
}

test('Dev takes over only after release, and installed resumes after each clean exit', async () => {
  const f = fixture();
  const installed = f.make('installed');
  let dev: RuntimeHandoff | undefined;
  try {
    await installed.start();
    for (let cycle = 0; cycle < 3; cycle++) {
      dev = f.make('development');
      await dev.start();
      expect([...f.owners]).toEqual(['development']);
      expect(f.states.get('installed')).toBe('standby');
      await dev.dispose();
      await until(() => f.states.get('installed') === 'active');
      expect([...f.owners]).toEqual(['installed']);
    }
    expect(f.events.slice(0, 5)).toEqual(['installed:acquire', 'installed:release', 'development:acquire', 'development:release', 'installed:acquire']);
  } finally { await dev?.dispose(); await installed.dispose(); }
});

test('installed startup while Dev is running stays idle; simultaneous startup has one owner', async () => {
  for (const simultaneous of [false, true]) {
    const f = fixture(); const dev = f.make('development'); const installed = f.make('installed');
    try {
      if (simultaneous) await Promise.all([installed.start(), dev.start()]);
      else { await dev.start(); await installed.start(); }
      expect([...f.owners]).toEqual(['development']);
      expect(f.states.get('installed')).toBe('standby');
      await dev.dispose();
      await until(() => f.states.get('installed') === 'active');
    } finally { await dev.dispose(); await installed.dispose(); }
  }
});

test('a failed release blocks Dev without surrendering the owner fence', async () => {
  const f = fixture(); const installed = f.make('installed'); const dev = f.make('development');
  try {
    await installed.start(); f.failRelease(true);
    await dev.start();
    expect(f.states.get('development')).toBe('blocked');
    expect([...f.owners]).toEqual(['installed']);
    expect(f.events).not.toContain('development:acquire');
  } finally { f.failRelease(false); await dev.dispose(); await installed.dispose(); }
});

test('legacy installed builds and unauthenticated peers never acquire a competing runtime', async () => {
  const f = fixture();
  const legacyDev = f.make('development', { legacyOwnerRunning: async () => true });
  await legacyDev.start();
  expect(f.states.get('development')).toBe('blocked');
  expect(f.owners.size).toBe(0);
  await legacyDev.dispose();
  const installed = f.make('installed'); const invalidDev = f.make('development', { token: 'b'.repeat(64) });
  try {
    await installed.start(); await invalidDev.start();
    expect(f.states.get('development')).toBe('blocked');
    expect([...f.owners]).toEqual(['installed']);
  } finally { await invalidDev.dispose(); await installed.dispose(); }
});
