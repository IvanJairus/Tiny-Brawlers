import { describe, it, expect } from 'vitest';
import { NetworkProtocol, CompactMatchSnapshot, CompactBuddyState } from '../src/net/p2p';

describe('Network Protocol & Abnormal Flow Scenarios', () => {
  const sampleSnapshot: CompactMatchSnapshot = {
    seq: 104,
    time: 42.5,
    buddies: [
      {
        id: 'peer_abc',
        team: 'red',
        cls: 'fighter',
        x: NetworkProtocol.q2(10.245),
        y: NetworkProtocol.q2(0.7),
        z: NetworkProtocol.q2(-4.512),
        vx: 0,
        vz: 0,
        hp: 120,
        wpn: 'pistol',
        crate: false,
        knocked: false
      }
    ],
    scores: { red: 10, blue: 0, yellow: 0, cyan: 0 },
    baseHp: { red: 1000, blue: 950, yellow: 1000, cyan: 1000 }
  };

  it('correctly serializes and deserializes clean network snapshots', () => {
    const raw = NetworkProtocol.serializeSnapshot(sampleSnapshot);
    const parsed = NetworkProtocol.deserializeSnapshot(raw, 100);

    expect(parsed.valid).toBe(true);
    expect(parsed.snapshot?.seq).toBe(104);
    expect(parsed.snapshot?.buddies[0].x).toBe(10.25); // Quantized
  });

  it('abnormal scenario: rejects malformed or invalid JSON packets without throwing', () => {
    const badJson = '{"seq": 105, "buddies": [INVALID_JSON_HERE...';
    const parsed = NetworkProtocol.deserializeSnapshot(badJson, 100);

    expect(parsed.valid).toBe(false);
    expect(parsed.snapshot).toBeNull();
    expect(parsed.reason).toContain('JSON parse error');
  });

  it('abnormal scenario: rejects stale or out-of-order sequence packets', () => {
    const staleSnapshot = { ...sampleSnapshot, seq: 98 }; // Arrived late
    const raw = NetworkProtocol.serializeSnapshot(staleSnapshot);

    // Current sequence received is already 100
    const parsed = NetworkProtocol.deserializeSnapshot(raw, 100);

    expect(parsed.valid).toBe(false);
    expect(parsed.reason).toContain('Stale or duplicate sequence');
  });

  it('abnormal scenario: rejects corrupted buddy records', () => {
    const corruptSnapshot: any = {
      seq: 110,
      time: 45.0,
      buddies: [{ id: '', team: null, hp: 'not_a_number' }],
      scores: {},
      baseHp: {}
    };

    const raw = JSON.stringify(corruptSnapshot);
    const parsed = NetworkProtocol.deserializeSnapshot(raw, 100);

    expect(parsed.valid).toBe(false);
    expect(parsed.reason).toContain('Invalid buddy record');
  });

  it('abnormal scenario: gracefully converts dropped player into active bot during match', () => {
    const buddies: CompactBuddyState[] = [
      {
        id: 'player_drop_123',
        team: 'blue',
        cls: 'constructor',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vz: 0,
        hp: 90,
        wpn: 'none',
        crate: true,
        knocked: false
      }
    ];

    const result = NetworkProtocol.handlePeerDisconnect('player_drop_123', buddies);

    expect(result.convertedToBot).toBe(true);
    expect(result.affectedBuddyId).toBe('bot_player_drop_123');
    expect(buddies[0].id).toBe('bot_player_drop_123');
  });

  it('abnormal scenario: returns false when trying to disconnect non-existent peer', () => {
    const buddies: CompactBuddyState[] = [];
    const result = NetworkProtocol.handlePeerDisconnect('ghost_peer', buddies);

    expect(result.convertedToBot).toBe(false);
    expect(result.affectedBuddyId).toBeNull();
  });
});
