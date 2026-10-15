import { describe, expect, it } from 'vitest';
import { SocketSignalling, type SocketLike } from '../../src/sim/net/signalling';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  closed = false;

  send(data: string): void { this.sent.push(data); }
  close(): void { this.closed = true; }
}

function relay(): { socket: FakeSocket; channel: SocketSignalling } {
  const socket = new FakeSocket();
  return { socket, channel: new SocketSignalling('ws://nowhere:9', 'PLAY01', 'host-play01', () => socket) };
}

describe('relay signalling', () => {
  it('queues while connecting and flushes once open', () => {
    const { socket, channel } = relay();
    expect(channel.status()).toBe('connecting');

    channel.send('guest-1', { t: 'bye' });
    expect(socket.sent).toEqual([]);

    socket.onopen?.();
    expect(channel.status()).toBe('open');
    const frames = socket.sent.map((raw) => JSON.parse(raw) as { t?: string; message?: { t: string } });
    expect(frames).toHaveLength(2);
    expect(frames[0].t).toBe('hello');
    expect(frames[1].message?.t).toBe('bye');
  });

  it('reports a refused relay instead of holding the lobby open', () => {
    const { socket, channel } = relay();
    socket.onerror?.();

    expect(channel.status()).toBe('failed');
    channel.send('guest-1', { t: 'bye' });
    expect(socket.sent).toEqual([]);
  });

  it('counts a close before any message as failure', () => {
    const { socket, channel } = relay();
    socket.onclose?.();
    expect(channel.status()).toBe('failed');
  });

  it('keeps a clean close after a good session as finished, not failed', () => {
    const { socket, channel } = relay();
    socket.onopen?.();
    socket.onclose?.();
    expect(channel.status()).toBe('open');
  });
});
