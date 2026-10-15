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
  readonly localDescription: RTCSessionDescriptionInit | null;
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
    void entry.pc.createOffer().then((offer) => entry.pc.setLocalDescription(offer))
      .then(() => {
        const description = entry.pc.localDescription;
        if (!description?.sdp) throw new Error('no local description');
        this.signalling.send(peerId, { t: 'offer', type: description.type ?? 'offer', sdp: description.sdp });
      })
      .catch((error: unknown) => console.error('webrtc offer failed', error));
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

  diagnose(): Array<{ peer: string; state: string; reliable: string; fast: string }> {
    return [...this.peers.entries()].map(([peer, entry]) => ({
      peer,
      state: entry.pc.connectionState,
      reliable: entry.reliable?.readyState ?? 'none',
      fast: entry.fast?.readyState ?? 'none'
    }));
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
      const candidate = event.candidate as RTCIceCandidateInit | null;
      if (!candidate) return;
      // Plain data only: an RTCIceCandidate instance cannot be structured-cloned
      // by BroadcastChannel, and the relay has to JSON it anyway.
      this.signalling.send(peerId, {
        t: 'ice',
        candidate: {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid ?? undefined,
          sdpMLineIndex: candidate.sdpMLineIndex ?? undefined
        }
      });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.removePeer(peerId);
    };
    // Attached at creation: a real peer connection can announce the remote
    // channels while the answer is still being negotiated.
    pc.ondatachannel = (event) => this.adoptChannel(peerId, event.channel);
    this.peers.set(peerId, entry);
    return entry;
  }

  private openChannel(peerId: string, entry: { pc: PeerConnectionLike }, label: string, options: RTCDataChannelInit): DataChannelLike {
    const channel = entry.pc.createDataChannel(label, options);
    this.owners.set(channel, peerId);
    this.wireChannel(channel, label.includes('fast') ? 'fast' : 'reliable');
    return channel;
  }

  private adoptChannel(peerId: string, channel: DataChannelLike): void {
    const entry = this.peers.get(peerId);
    const label = (channel as unknown as { label?: string }).label ?? '';
    const kind: Channel = label.includes('fast') ? 'fast' : 'reliable';
    this.owners.set(channel, peerId);
    if (entry) {
      if (kind === 'fast') entry.fast = channel;
      else entry.reliable = channel;
    }
    this.wireChannel(channel, kind);
  }

  private wireChannel(channel: DataChannelLike, kind: Channel): void {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => this.upHandler(this.ownerOf(channel));
    if (channel.readyState === 'open') this.upHandler(this.ownerOf(channel));
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
      void entry.pc.setRemoteDescription({ type: message.type ?? 'offer', sdp: message.sdp })
        .then(() => entry!.pc.createAnswer())
        .then((answer) => entry!.pc.setLocalDescription(answer))
        .then(() => {
          const description = entry!.pc.localDescription;
          if (!description?.sdp) throw new Error('no local answer');
          this.signalling.send(from, { t: 'answer', type: description.type ?? 'answer', sdp: description.sdp });
        })
        .catch((error: unknown) => console.error('webrtc answer failed', error));
      return;
    }

    if (message.t === 'answer' && message.sdp) {
      void entry.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
        .catch((error: unknown) => console.error('webrtc setRemote(answer) failed', error));
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
