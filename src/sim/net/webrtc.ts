import type { Channel, Transport } from './transport';

export interface SignalMessage {
  t: 'offer' | 'answer' | 'ice' | 'bye';
  sdp?: string;
  type?: RTCSdpType;
  candidate?: RTCIceCandidateInit;
}

export interface SignallingChannel {
  send(to: string, message: SignalMessage): void;
  onMessage(handler: (from: string, message: SignalMessage) => void): void;
  onPeerGone(handler: (peerId: string) => void): void;
}

export interface PeerConnectionLike {
  createDataChannel(label: string, options: RTCDataChannelInit): DataChannelLike;
  createOffer(): Promise<{ type: RTCSdpType; sdp: string }>;
  createAnswer(): Promise<{ type: RTCSdpType; sdp: string }>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  onicecandidate: ((event: { candidate: RTCIceCandidateInit | null }) => void) | null;
  ondatachannel?: ((event: { channel: DataChannelLike }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  connectionState: RTCPeerConnectionState;
  close(): void;
}

export interface DataChannelLike {
  binaryType: string;
  readyState: string;
  send(data: Uint8Array): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: ArrayBuffer | Uint8Array }) => void) | null;
  close(): void;
}

export type PeerConnectionFactory = () => PeerConnectionLike;

/**
 * Signaling and data are deliberately separate: the broker only swaps SDP, and
 * the game owns its own data channels, so the one-channel-per-connection limit of
 * hosted brokers does not shape the protocol.
 */
export class WebRtcTransport implements Transport {
  private peers = new Map<string, { pc: PeerConnectionLike; reliable: DataChannelLike | null; fast: DataChannelLike | null }>();
  private owners = new Map<DataChannelLike, string>();
  private dataHandler: (peerId: string, channel: Channel, data: Uint8Array) => void = () => undefined;
  private upHandler: (peerId: string) => void = () => undefined;
  private downHandler: (peerId: string) => void = () => undefined;
  private closed = false;

  constructor(
    readonly id: string,
    private signalling: SignallingChannel,
    private factory: PeerConnectionFactory
  ) {
    signalling.onMessage((from, message) => this.handleSignal(from, message));
    signalling.onPeerGone((peerId) => this.removePeer(peerId));
  }

  connect(peerId: string): void {
    if (this.closed || this.peers.has(peerId)) return;
    const entry = this.createEntry(peerId);
    entry.reliable = this.openChannel(peerId, entry, 'game-reliable', { ordered: true });
    entry.fast = this.openChannel(peerId, entry, 'game-fast', { ordered: false, maxRetransmits: 1 });
    void entry.pc.createOffer().then((offer) => {
      void entry.pc.setLocalDescription(offer);
      this.signalling.send(peerId, { t: 'offer', type: offer.type, sdp: offer.sdp });
    });
  }

  accept(peerId: string): void {
    if (this.closed || this.peers.has(peerId)) return;
    this.createEntry(peerId);
  }

  send(peerId: string, channel: Channel, data: Uint8Array): void {
    const entry = this.peers.get(peerId);
    const dc = channel === 'fast' ? entry?.fast : entry?.reliable;
    if (dc && dc.readyState === 'open') dc.send(data);
  }

  broadcast(channel: Channel, data: Uint8Array): void {
    for (const peerId of this.peers.keys()) this.send(peerId, channel, data);
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

  peerCount(): number {
    return this.peers.size;
  }

  close(): void {
    this.closed = true;
    for (const peerId of [...this.peers.keys()]) {
      this.signalling.send(peerId, { t: 'bye' });
      this.removePeer(peerId);
    }
  }

  private createEntry(peerId: string) {
    const pc = this.factory();
    const entry: { pc: PeerConnectionLike; reliable: DataChannelLike | null; fast: DataChannelLike | null } = {
      pc, reliable: null, fast: null
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) this.signalling.send(peerId, { t: 'ice', candidate: event.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.removePeer(peerId);
    };
    this.peers.set(peerId, entry);
    return entry;
  }

  private openChannel(peerId: string, entry: { pc: PeerConnectionLike }, label: string, options: RTCDataChannelInit): DataChannelLike {
    const channel = entry.pc.createDataChannel(label, options);
    this.owners.set(channel, peerId);
    this.wireChannel(channel, label.includes('fast') ? 'fast' : 'reliable');
    return channel;
  }

  private wireChannel(channel: DataChannelLike, kind: Channel): void {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => this.upHandler(this.ownerOf(channel));
    channel.onclose = () => this.removePeer(this.ownerOf(channel));
    channel.onmessage = (event) => {
      const bytes = event.data instanceof Uint8Array ? event.data : new Uint8Array(event.data);
      this.dataHandler(this.ownerOf(channel), kind, bytes);
    };
  }

  private ownerOf(channel: DataChannelLike): string {
    return this.owners.get(channel) ?? 'unknown';
  }

  private handleSignal(from: string, message: SignalMessage): void {
    let entry = this.peers.get(from);
    if (!entry) {
      if (message.t !== 'offer') return;
      entry = this.createEntry(from);
    }

    if (message.t === 'bye') {
      this.removePeer(from);
      return;
    }

    if (message.t === 'offer' && message.sdp) {
      void entry.pc.setRemoteDescription({ type: message.type ?? 'offer', sdp: message.sdp }).then(() => {
        entry!.pc.ondatachannel = (event: { channel: DataChannelLike }) => {
          const label = (event.channel as unknown as { label?: string }).label ?? '';
          this.owners.set(event.channel, from);
          const kind: Channel = label.includes('fast') ? 'fast' : 'reliable';
          if (kind === 'fast') entry!.fast = event.channel;
          else entry!.reliable = event.channel;
          this.wireChannel(event.channel, kind);
        };
        return entry!.pc.createAnswer();
      }).then((answer) => {
        void entry!.pc.setLocalDescription(answer);
        this.signalling.send(from, { t: 'answer', type: answer.type, sdp: answer.sdp });
      });
      return;
    }

    if (message.t === 'answer' && message.sdp) {
      void entry.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
      return;
    }

    if (message.t === 'ice' && message.candidate) {
      void entry.pc.addIceCandidate(message.candidate);
    }
  }

  private removePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    this.peers.delete(peerId);
    try {
      entry.reliable?.close();
      entry.fast?.close();
      entry.pc.close();
    } catch {
      // A half-open channel can throw on close; the peer is already gone either way.
    }
    this.downHandler(peerId);
  }
}
