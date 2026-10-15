export type Channel = 'reliable' | 'fast';

export interface Transport {
  readonly id: string;
  send(peerId: string, channel: Channel, data: Uint8Array): void;
  broadcast(channel: Channel, data: Uint8Array): void;
  onData(handler: (peerId: string, channel: Channel, data: Uint8Array) => void): void;
  onPeerUp(handler: (peerId: string) => void): void;
  onPeerDown(handler: (peerId: string) => void): void;
  close(): void;
}

export interface Impairment {
  delayMs: number;
  jitterMs: number;
  loss: number;
  duplicate: number;
}

export const CLEAN_LINK: Impairment = { delayMs: 0, jitterMs: 0, loss: 0, duplicate: 0 };
export const BAD_LINK: Impairment = { delayMs: 60, jitterMs: 60, loss: 0.03, duplicate: 0.02 };

interface Queued {
  from: string;
  at: number;
  to: string;
  channel: Channel;
  data: Uint8Array;
}

/**
 * An in-memory link with a hand-pulled clock. Netcode can only be tested honestly
 * with delay, loss and duplicates, and no CI machine has two real phones.
 */
export class LoopbackHub {
  public now = 0;
  private endpoints = new Map<string, LoopbackEndpoint>();
  private queues: Queued[] = [];
  private counter = 0;

  constructor(private readonly impairment: Impairment = CLEAN_LINK, private seed = 1234) {}

  create(): Transport {
    const id = `peer${++this.counter}`;
    const endpoint = new LoopbackEndpoint(id, this);
    this.endpoints.set(id, endpoint);
    return endpoint;
  }

  peerIds(): string[] {
    return [...this.endpoints.keys()];
  }

  drop(peerId: string): void {
    const endpoint = this.endpoints.get(peerId);
    if (!endpoint) return;
    this.endpoints.delete(peerId);
    this.queues = this.queues.filter((item) => item.to !== peerId);
    endpoint.notifyDown(peerId);
    for (const other of this.endpoints.values()) other.notifyDown(peerId);
  }

  advance(ms: number): void {
    const target = this.now + ms;
    while (true) {
      this.queues.sort((a, b) => a.at - b.at);
      const next = this.queues[0];
      if (!next || next.at > target) break;
      this.queues.shift();
      this.now = next.at;
      this.endpoints.get(next.to)?.deliver(next);
    }
    this.now = target;
  }

  pending(): number {
    return this.queues.length;
  }

  schedule(from: string, to: string, channel: Channel, data: Uint8Array): void {
    if (to !== '*' && !this.endpoints.has(to)) return;
    const roll = this.random();
    if (channel === 'fast' && roll < this.impairment.loss) return;
    const jitter = this.impairment.jitterMs * this.random();
    const at = this.now + this.impairment.delayMs + jitter;
    const recipients = to === '*' ? [...this.endpoints.keys()].filter((id) => id !== from) : [to];
    for (const recipient of recipients) {
      this.queues.push({ from, at, to: recipient, channel, data });
      if (channel === 'fast' && this.random() < this.impairment.duplicate) {
        this.queues.push({ from, at: at + 1, to: recipient, channel, data });
      }
    }
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
}

class LoopbackEndpoint implements Transport {
  private dataHandler: (peerId: string, channel: Channel, data: Uint8Array) => void = () => undefined;
  private upHandler: (peerId: string) => void = () => undefined;
  private downHandler: (peerId: string) => void = () => undefined;
  private closed = false;

  constructor(readonly id: string, private hub: LoopbackHub) {}

  send(peerId: string, channel: Channel, data: Uint8Array): void {
    if (this.closed) return;
    this.hub.schedule(this.id, peerId, channel, data.slice());
  }

  broadcast(channel: Channel, data: Uint8Array): void {
    if (this.closed) return;
    this.hub.schedule(this.id, '*', channel, data.slice());
  }

  onData(handler: (peerId: string, channel: Channel, data: Uint8Array) => void): void {
    this.dataHandler = handler;
  }

  onPeerUp(handler: (peerId: string) => void): void {
    this.upHandler = handler;
  }

  onPeerDown(handler: (peerId: string) => void): void {
    this.downHandler = handler;
  }

  notifyDown(peerId: string): void {
    if (peerId !== this.id) this.downHandler(peerId);
  }

  deliver(item: Queued): void {
    if (this.closed) return;
    this.dataHandler(item.from, item.channel, item.data);
  }

  close(): void {
    this.closed = true;
    this.upHandler(this.id);
  }
}
