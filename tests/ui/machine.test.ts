// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createMachine, isTicking, type Screen } from '../../src/ui/shell/machine';

describe('screen state machine', () => {
  let machine: ReturnType<typeof createMachine>;

  beforeEach(() => {
    machine = createMachine();
  });

  it('starts at booting and can only be released by a capability check', () => {
    expect(machine.screen).toBe('booting');
    expect(machine.can('play')).toBe(false);
    expect(machine.send('supported')).toBe('title');
  });

  it('routes an unsupported device to a dead end', () => {
    machine.send('unsupported');
    expect(machine.screen).toBe('unsupported');
    expect(machine.can('play')).toBe(false);
  });

  it('walks the whole happy path', () => {
    const visited: Screen[] = [machine.send('supported')];
    visited.push(machine.send('play'));
    visited.push(machine.send('confirmed'));
    visited.push(machine.send('loaded'));
    expect(visited).toEqual(['title', 'select', 'loading', 'playing']);
  });

  it('pauses and resumes', () => {
    machine.send('supported');
    machine.send('play');
    machine.send('confirmed');
    machine.send('loaded');
    expect(machine.send('pause')).toBe('paused');
    expect(machine.send('resume')).toBe('playing');
  });

  it('finishes into results and can start again', () => {
    machine.send('supported');
    machine.send('play');
    machine.send('confirmed');
    machine.send('loaded');
    expect(machine.send('finished')).toBe('results');
    expect(machine.send('again')).toBe('select');
  });

  it('reports a dropped connection from play', () => {
    machine.send('supported');
    machine.send('play');
    machine.send('confirmed');
    machine.send('loaded');
    expect(machine.send('dropped')).toBe('disconnected');
    expect(machine.send('recover')).toBe('title');
  });

  it('refuses impossible transitions instead of guessing', () => {
    machine.send('supported');
    expect(() => machine.send('pause')).toThrow(/no transition/);
    expect(() => machine.send('finished')).toThrow(/no transition/);
  });

  it('only ticks the simulation while playing', () => {
    for (const screen of ['title', 'select', 'loading', 'paused', 'confirming', 'results', 'disconnected'] as Screen[]) {
      expect(isTicking(screen), screen).toBe(false);
    }
    expect(isTicking('playing')).toBe(true);
  });

  it('leaves a live match only through the confirmation screen', () => {
    machine.send('supported');
    machine.send('play');
    machine.send('confirmed');
    machine.send('loaded');
    expect(machine.send('leave')).toBe('confirming');
    expect(machine.can('pause')).toBe(false);
    expect(machine.send('stay')).toBe('playing');
    machine.send('leave');
    expect(machine.send('quit')).toBe('title');
  });

  it('notifies listeners and marks the body for CSS', () => {
    const seen: string[] = [];
    const off = machine.onChange((next) => seen.push(next));
    machine.send('supported');
    machine.send('play');
    off();
    machine.send('confirmed');
    expect(seen).toEqual(['title', 'select']);
    expect(document.body.dataset.screen).toBe('loading');
  });
});
