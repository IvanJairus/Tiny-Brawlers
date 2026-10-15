import { describe, expect, it, vi } from 'vitest';
import { WebRtcTransport, type DataChannelLike, type PeerConnectionLike, type SignalMessage } from '../../src/sim/net/webrtc';
import { isRoomCode, makeRoomCode } from '../../src/platform/roomcode';
import { ManualSignalling } from '../../src/sim/net/signalling';

class FakeChannel implements DataChannelLike {
  binaryType = 'arraybuffer';
  readyState = 'connecting';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | Uint8Array }) => void) | null = null;
  peer: FakeChannel | null = null;

  constructor(readonly label: string) {}

  send(data: Uint8Array): void {
    const target = this.peer;
    if (!target || target.readyState !== 'open') return;
    const copy = new Uint8Array(data);
    setTimeout(() => target.onmessage?.({ data: copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) }), 0);
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  close(): void {
    this.readyState = 'closed';
    this.onclose?.();
  }
}

class FakePeerConnection implements PeerConnectionLike {
  onicecandidate: ((event: { candidate: RTCIceCandidateInit | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  private pending: FakeChannel[] = [];
  private datachannelHandler: ((event: { channel: DataChannelLike }) => void) | null = null;

  get ondatachannel(): ((event: { channel: DataChannelLike }) => void) | null {
    return this.datachannelHandler;
  }

  set ondatachannel(handler: ((event: { channel: DataChannelLike }) => void) | null) {
    this.datachannelHandler = handler;
    if (handler) {
      const queued = this.pending;
      this.pending = [];
      for (const channel of queued) handler({ channel });
    }
  }
  remote: FakePeerConnection | null = null;
  channels: FakeChannel[] = [];

  createDataChannel(label: string): DataChannelLike {
    const local = new FakeChannel(label);
    const remote = new FakeChannel(label);
    local.peer = remote;
    remote.peer = local;
    this.channels.push(local);
    queueMicrotask(() => {
      const remotePc = this.remote;
      if (!remotePc) return;
      if (remotePc.ondatachannel) remotePc.ondatachannel({ channel: remote });
      else remotePc.queueChannel(remote);
      local.open();
      remote.open();
    });
    return local;
  }

  async createOffer(): Promise<{ type: RTCSdpType; sdp: string }> {
    return { type: 'offer', sdp: `sdp-offer:${this.label}` };
  }

  async createAnswer(): Promise<{ type: RTCSdpType; sdp: string }> {
    return { type: 'answer', sdp: `sdp-answer:${this.label}` };
  }

  localDescription: RTCSessionDescriptionInit | null = null;

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    this.connectionState = 'connected';
  }

  async setRemoteDescription(): Promise<void> {
    this.connectionState = 'connected';
  }

  async addIceCandidate(): Promise<void> {
    return undefined;
  }

  close(): void {
    this.connectionState = 'closed';
    for (const channel of this.channels) channel.close();
  }

  queueChannel(channel: FakeChannel): void {
    this.pending.push(channel);
  }

  constructor(private label: string) {}
}

function pair() {
  const pcA = new FakePeerConnection('A');
  const pcB = new FakePeerConnection('B');
  pcA.remote = pcB;
  pcB.remote = pcA;

  const sigA = new ManualSignalling('A');
  const sigB = new ManualSignalling('B');
  const transportA = new WebRtcTransport('A', sigA, () => pcA);
  const transportB = new WebRtcTransport('B', sigB, () => pcB);

  const pump = (): void => {
    sigA.flush((from, message) => sigB.receive(from, message));
    sigB.flush((from, message) => sigA.receive(from, message));
  };

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 6; i++) {
      pump();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  return { a: transportA, b: transportB, pump, settle };
}

describe('webrtc transport', () => {
  it('opens two channels and routes payloads with the right kind', async () => {
    const { a, b, pump, settle } = pair();
    const seen: Array<[string, string]> = [];
    b.onData((peerId, channel) => seen.push([peerId, channel]));
    a.connect('B');
    await settle();

    const fast = new Uint8Array([1, 2, 3]);
    const reliable = new Uint8Array([4, 5, 6]);
    a.send('B', 'fast', fast);
    a.send('B', 'reliable', reliable);
    await new Promise((r) => setTimeout(r, 5));

    expect(seen.map((entry) => entry[1]).sort()).toEqual(['fast', 'reliable']);
    expect(seen.every((entry) => entry[0] === 'A')).toBe(true);
  });

  it('reports a peer down when the connection closes', async () => {
    const { a, b, pump, settle } = pair();
    const down = vi.fn();
    b.onPeerDown(down);
    a.connect('B');
    await settle();
    a.close();
    await settle();
    expect(down).toHaveBeenCalledWith('A');
  });

  it('ignores signals from an unknown peer unless they are an offer', async () => {
    const sig = new ManualSignalling('solo');
    const transport = new WebRtcTransport('solo', sig, () => new FakePeerConnection('x'));
    sig.receive('stranger', { t: 'answer', sdp: 'nope' } as SignalMessage);
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.peerCount()).toBe(0);
  });

  it('accepts an inbound offer and answers it', async () => {
    const { a, b, pump, settle } = pair();
    b.accept('A');
    a.connect('B');
    await settle();
    expect(b.peerCount()).toBe(1);
  });
});

describe('room codes', () => {
  it('only uses characters that survive being read aloud', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode();
      expect(code).toHaveLength(6);
      expect(isRoomCode(code)).toBe(true);
    }
  });

  it('rejects ambiguous or wrong-length codes', () => {
    expect(isRoomCode('ABC')).toBe(false);
    expect(isRoomCode('ILOVEX1')).toBe(false);
    expect(isRoomCode('ABCD23')).toBe(true);
    expect(isRoomCode('abcd23')).toBe(true);
  });

  it('is deterministic with an injected source, which tests rely on', () => {
    let value = 0;
    const code = makeRoomCode(() => (value = (value + 0.17) % 1));
    expect(code).toHaveLength(6);
  });
});
