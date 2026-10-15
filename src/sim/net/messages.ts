export const MSG = {
  joinReq: 0x01,
  input: 0x02,
  ping: 0x03,
  ready: 0x04,
  accept: 0x10,
  roster: 0x11,
  start: 0x12,
  snapshot: 0x13,
  event: 0x14,
  pong: 0x15,
  peerReplaced: 0x16,
  roomFull: 0x17,
  kick: 0x18
} as const;

export type MsgId = (typeof MSG)[keyof typeof MSG];

export const PROTOCOL = 'tb2';
export const PROTOCOL_HASH = 0x2b5f;

export interface RosterSlot {
  index: number;
  team: 'red' | 'blue' | 'yellow' | 'cyan';
  cls: 'fighter' | 'healer' | 'constructor';
  peerId: string | null;
  name: string;
  ready: boolean;
  bot: boolean;
  latencyMs: number;
}
