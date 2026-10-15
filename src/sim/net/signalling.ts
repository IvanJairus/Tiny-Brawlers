import type { SignalMessage, SignallingChannel } from './webrtc';

/**
 * Three ways to swap SDP, in order of how easy they are to try:
 * same-browser tabs, a small self-hosted relay, or copy-paste for a single test.
 */
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

  close(): void {
    this.channel.close();
  }
}

export class SocketSignalling implements SignallingChannel {
  private socket: WebSocket;
  private queue: Array<{ to: string; message: SignalMessage }> = [];
  private messageHandler: (from: string, message: SignalMessage) => void = () => undefined;
  private goneHandler: (peerId: string) => void = () => undefined;
  private open = false;

  constructor(url: string, private room: string, private self: string) {
    this.socket = new WebSocket(url);
    this.socket.onopen = () => {
      this.open = true;
      this.socket.send(JSON.stringify({ t: 'hello', room, id: self }));
      for (const item of this.queue) this.raw(item.to, item.message);
      this.queue.length = 0;
    };
    this.socket.onmessage = (event: MessageEvent) => {
      let packet: { from?: string; message?: SignalMessage; peer?: string; t?: string };
      try {
        packet = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (packet.t === 'gone' && packet.peer) this.goneHandler(packet.peer);
      else if (packet.from && packet.message) this.messageHandler(packet.from, packet.message);
    };
    this.socket.onclose = () => { this.open = false; };
  }

  private raw(to: string, message: SignalMessage): void {
    this.socket.send(JSON.stringify({ to, room: this.room, from: this.self, message }));
  }

  send(to: string, message: SignalMessage): void {
    if (this.open) this.raw(to, message);
    else this.queue.push({ to, message });
  }

  onMessage(handler: (from: string, message: SignalMessage) => void): void {
    this.messageHandler = handler;
  }

  onPeerGone(handler: (peerId: string) => void): void {
    this.goneHandler = handler;
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
