import { spawn, type ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { SocketSignalling } from '../../src/sim/net/signalling';

function startRelay(port: number, turn: Record<string, string>): Promise<ChildProcess> {
  return new Promise((resolveStart, rejectStart) => {
    const child = spawn(process.execPath, ['scripts/signaling-server.mjs', '--port', String(port)], {
      env: { ...process.env, ...turn },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    const timer = setTimeout(() => rejectStart(new Error('relay did not start')), 8000);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (chunk.includes('signalling on')) {
        clearTimeout(timer);
        resolveStart(child);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      rejectStart(new Error(`relay exited ${String(code)}`));
    });
  });
}

describe('relay process', () => {
  it('hands a connecting browser the TURN entry it was configured with', async () => {
    const port = 8123;
    const child = await startRelay(port, {
      TURN_URL: 'turn:relay.test:3478',
      TURN_USER: 'guest',
      TURN_PASS: 'secret'
    });
    const channel = new SocketSignalling(`ws://127.0.0.1:${port}`, 'TURN01', 'host-turn01');
    try {
      await expect.poll(() => channel.iceServers().length, { timeout: 5000 }).toBeGreaterThan(0);
      const urls = channel.iceServers().flatMap((server) => server.urls);
      expect(urls).toContain('turn:relay.test:3478');
      const turn = channel.iceServers().find((server) => server.urls[0].startsWith('turn:'));
      expect(turn).toMatchObject({ username: 'guest', credential: 'secret' });
    } finally {
      channel.close();
      child.kill();
    }
  });

  it('offers STUN only when the operator configured no relay', async () => {
    const port = 8124;
    const child = await startRelay(port, { TURN_URL: '', TURN_USER: '', TURN_PASS: '' });
    const channel = new SocketSignalling(`ws://127.0.0.1:${port}`, 'STUN01', 'host-stun01');
    try {
      await expect.poll(() => channel.iceServers().length, { timeout: 5000 }).toBeGreaterThan(0);
      const urls = channel.iceServers().flatMap((server) => server.urls);
      expect(urls.every((url) => url.startsWith('stun:'))).toBe(true);
    } finally {
      channel.close();
      child.kill();
    }
  });
});
