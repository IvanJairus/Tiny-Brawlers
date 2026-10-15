import { BuddyClass, TeamId, Vector3D, WeaponType } from '../types';

export interface CompactBuddyState {
  id: string;
  team: TeamId;
  cls: BuddyClass;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  wpn: WeaponType;
  crate: boolean;
  knocked: boolean;
}

export interface CompactMatchSnapshot {
  seq: number;
  time: number;
  buddies: CompactBuddyState[];
  scores: Record<TeamId, number>;
  baseHp: Record<TeamId, number>;
}

export class NetworkProtocol {
  // Quantize number to 2 decimal places to minimize bandwidth
  public static q2(val: number): number {
    return Math.round(val * 100) / 100;
  }

  // Quantize number to 1 decimal place
  public static q1(val: number): number {
    return Math.round(val * 10) / 10;
  }

  // Encode snapshot to compact JSON string
  public static serializeSnapshot(snapshot: CompactMatchSnapshot): string {
    return JSON.stringify(snapshot);
  }

  // Parse and validate snapshot, rejecting malformed, corrupt, or out-of-order packets
  public static deserializeSnapshot(
    rawJson: string,
    lastSequenceReceived: number
  ): { valid: boolean; snapshot: CompactMatchSnapshot | null; reason?: string } {
    try {
      const data = JSON.parse(rawJson) as CompactMatchSnapshot;

      // Basic structure validation
      if (typeof data.seq !== 'number' || typeof data.time !== 'number' || !Array.isArray(data.buddies)) {
        return { valid: false, snapshot: null, reason: 'Malformed packet structure' };
      }

      // Out-of-order check: ignore older sequence packets
      if (data.seq <= lastSequenceReceived) {
        return { valid: false, snapshot: null, reason: `Stale or duplicate sequence: got ${data.seq}, expected > ${lastSequenceReceived}` };
      }

      // Validate buddies payload
      for (const b of data.buddies) {
        if (!b.id || !b.team || typeof b.hp !== 'number') {
          return { valid: false, snapshot: null, reason: 'Invalid buddy record in snapshot' };
        }
      }

      return { valid: true, snapshot: data };
    } catch (e: any) {
      return { valid: false, snapshot: null, reason: `JSON parse error: ${e.message}` };
    }
  }

  // Handle sudden player disconnect: seamlessly convert disconnected player into an active AI Bot
  public static handlePeerDisconnect(
    droppedPeerId: string,
    activeBuddies: CompactBuddyState[]
  ): { convertedToBot: boolean; affectedBuddyId: string | null } {
    const buddy = activeBuddies.find((b) => b.id === droppedPeerId);
    if (!buddy) {
      return { convertedToBot: false, affectedBuddyId: null };
    }

    // Switch ID prefix to bot
    const botId = `bot_${buddy.id}`;
    buddy.id = botId;

    // Reset carry state if corrupted during drop
    return { convertedToBot: true, affectedBuddyId: botId };
  }
}
