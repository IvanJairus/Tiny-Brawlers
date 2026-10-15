import type { SignalMessage, SignallingChannel } from './webrtc';

/**
 * Three ways to swap SDP, in order of how easy they are to try:
 * same-browser tabs, a small self-hosted relay, or copy-paste for a single test.
 */
export type SignallingStatus = 'connecting' | 'open' | 'failed';

export class BroadcastSignalling implements SignallingChannel {
  private channel: BroadcastChannel;
  private messageHandler: (from: string, message: SignalMessage) => void = () => undefined;
  private goneHandler: (peerId: string) => void = () => undefined;

  constructor(private room: string, private self: string) {
    this.channel = new BroadcastChannel(`tiny-brawlers:${room}`);
    this.channel.onmessage = (event: MessageEvent) => {
      const packet = event.data as { to?: string; from?: string; message?: SignalMessage };
      if (!packet || packet.to !== this.self || !packet.message) return;
      this.messageHandler(packet.from ?? 'unknown', packet.message);
    };
  }

  send(to: string, message: SignalMessage): void {
    this.channel.postMessage({ to, from: this.self, message });
  }

  onMessage(handler: (from: string, message: SignalMessage) => void): void {
    this.messageHandler = handler;
  }

  onPeerGone(handler: (peerId: string) => void): void {
    this.goneHandler = handler;
  }

  notifyGone(peerId: string): void {
    this.goneHandler(peerId);
  }

  status(): SignallingStatus {
    return 'open';
  }

  close(): void {
    this.channel.close();
  }
}

export interface SocketLike {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

/** One entry of an RTCPeerConnection iceServers list; TURN entries add credentials. */
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const browserSocket: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

/**
 * A relay that is not running is the first thing anyone trying cross-device play
 * hits, and without a status the lobby would just sit there waiting for a guest
 * that can never arrive. So a socket that fails to open is reported, not queued
 * forever.
 */
export class SocketSignalling implements SignallingChannel {
  private socket: SocketLike;
  private queue: Array<{ to: string; message: SignalMessage }> = [];
  private messageHandler: (from: string, message: SignalMessage) => void = () => undefined;
  private goneHandler: (peerId: string) => void = () => undefined;
  private state: SignallingStatus = 'connecting';
  private servers: IceServer[] = [];

  constructor(url: string, private room: string, private self: string, socket: SocketFactory = browserSocket) {
    this.socket = socket(url);
    this.socket.onopen = () => {
      this.state = 'open';
      this.socket.send(JSON.stringify({ t: 'hello', room, id: self }));
      for (const item of this.queue) this.raw(item.to, item.message);
      this.queue.length = 0;
    };
    this.socket.onmessage = (event) => {
      let packet: { from?: string; message?: SignalMessage; peer?: string; t?: string; ice?: IceServer[] };
      try {
        packet = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (packet.t === 'ice') this.servers = (packet as { ice?: IceServer[] }).ice ?? [];
      else if (packet.t === 'gone' && packet.peer) this.goneHandler(packet.peer);
      else if (packet.from && packet.message) this.messageHandler(packet.from, packet.message);
    };
    this.socket.onerror = () => { this.state = 'failed'; };
    this.socket.onclose = () => {
      if (this.state !== 'open') this.state = 'failed';
    };
  }

  private raw(to: string, message: SignalMessage): void {
    this.socket.send(JSON.stringify({ to, room: this.room, from: this.self, message }));
  }

  send(to: string, message: SignalMessage): void {
    if (this.state === 'open') this.raw(to, message);
    else if (this.state === 'connecting') this.queue.push({ to, message });
  }

  onMessage(handler: (from: string, message: SignalMessage) => void): void {
    this.messageHandler = handler;
  }

  onPeerGone(handler: (peerId: string) => void): void {
    this.goneHandler = handler;
  }

  status(): SignallingStatus {
    return this.state;
  }

  /** What the relay handed out after hello, empty until it does. */
  iceServers(): IceServer[] {
    return this.servers;
  }

  close(): void {
    this.socket.close();
  }
}

export class ManualSignalling implements SignallingChannel {
  private messageHandler: (from: string, message: SignalMessage) => void = () => undefined;
  private goneHandler: (peerId: string) => void = () => undefined;
  public outbox: Array<{ to: string; message: SignalMessage }> = [];

  constructor(readonly self: string) {}

  send(to: string, message: SignalMessage): void {
    this.outbox.push({ to, message });
  }

  /** Delivers everything queued since the last call, in order. */
  flush(deliver: (from: string, message: SignalMessage) => void): void {
    const pending = this.outbox.slice();
    this.outbox.length = 0;
    for (const item of pending) deliver(this.self, item.message);
  }

  receive(from: string, message: SignalMessage): void {
    this.messageHandler(from, message);
  }

  status(): SignallingStatus {
    return 'open';
  }

  onMessage(handler: (from: string, message: SignalMessage) => void): void {
    this.messageHandler = handler;
  }

  onPeerGone(handler: (peerId: string) => void): void {
    this.goneHandler = handler;
  }

  close(): void {
    this.outbox.length = 0;
  }
}
