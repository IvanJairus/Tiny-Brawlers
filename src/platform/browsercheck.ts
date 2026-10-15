export interface Capabilities {
  webgl: boolean;
  webrtc: boolean;
  coarsePointer: boolean;
  reducedMotion: boolean;
  portrait: boolean;
  missing: string[];
}

export function detectCapabilities(win: Window = window): Capabilities {
  const missing: string[] = [];
  let webgl = false;
  try {
    const canvas = win.document.createElement('canvas');
    webgl = !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    webgl = false;
  }
  const winAny = win as unknown as Record<string, unknown>;
  const webrtc = typeof winAny.RTCPeerConnection === 'function' && 'RTCDataChannel' in win;
  if (!webgl) missing.push('webgl');
  if (!webrtc) missing.push('webrtc');

  return {
    webgl,
    webrtc,
    coarsePointer: win.matchMedia('(pointer: coarse)').matches,
    reducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches,
    portrait: win.innerHeight > win.innerWidth,
    missing
  };
}

export function canPlayOffline(capabilities: Capabilities): boolean {
  return capabilities.webgl;
}

export function canPlayOnline(capabilities: Capabilities): boolean {
  return capabilities.webgl && capabilities.webrtc;
}
