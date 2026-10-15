import { describe, expect, it } from 'vitest';
import { iceConfiguration } from '../../src/platform/net';

describe('peer configuration', () => {
  it('uses the relay TURN entry when the relay advertises one', () => {
    const config = iceConfiguration([
      { urls: ['stun:stun.example:19302'] },
      { urls: ['turn:relay.example:3478'], username: 'guest', credential: 'secret' }
    ]);
    expect(config.iceServers).toHaveLength(2);
    expect(config.iceServers?.[1]).toMatchObject({ urls: ['turn:relay.example:3478'], username: 'guest' });
  });

  it('falls back to public STUN when the relay says nothing', () => {
    const config = iceConfiguration([]);
    const urls = (config.iceServers ?? []).flatMap((server) => server.urls);
    expect(urls.some((url) => url.startsWith('stun:'))).toBe(true);
    expect(urls.some((url) => url.startsWith('turn:'))).toBe(false);
  });

  it('does not hand the page a credential list it can mutate into the relay', () => {
    const advertised = [{ urls: ['turn:relay.example:3478'] }];
    const config = iceConfiguration(advertised);
    (config.iceServers as { urls: string[] }[]).push({ urls: ['turn:evil.example'] });
    expect(advertised).toHaveLength(1);
  });
});
