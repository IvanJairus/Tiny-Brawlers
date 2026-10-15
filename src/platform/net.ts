import { BroadcastSignalling, SocketSignalling } from '../sim/net/signalling';
import { WebRtcTransport } from '../sim/net/webrtc';
import type { SignallingChannel } from '../sim/net/webrtc';
import type { Transport } from '../sim/net/transport';
import { makeRoomCode, normaliseRoomCode } from './roomcode';
import { detectCapabilities } from './browsercheck';

export interface NetLink {
  transport: Transport;
  selfId: string;
  hostPeerId: string;
  code: string;
  close(): void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }]
};

function createPeer(): import('../sim/net/webrtc').PeerConnectionLike {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  return pc as unknown as import('../sim/net/webrtc').PeerConnectionLike;
}

function buildSignalling(code: string, selfId: string): SignallingChannel {
  const relay = new URLSearchParams(window.location.search).get('signal');
  if (relay) return new SocketSignalling(relay, code, selfId);
  return new BroadcastSignalling(code, selfId);
}

/**
 * Same-browser tabs work with no server at all because BroadcastChannel is a
 * signalling path that already exists between them. Adding ?signal=wss://... points
 * the same code at a relay for cross-device play.
 */
export function openHostRoom(preferredCode?: string): NetLink {
  const capabilities = detectCapabilities();
  if (!capabilities.webrtc) throw new Error('webrtc-unavailable');

  const code = normaliseRoomCode(preferredCode ?? '') || makeRoomCode();
  const selfId = `host-${code.toLowerCase()}`;
  const transport = new WebRtcTransport(selfId, buildSignalling(code, selfId), createPeer);
  return {
    transport,
    selfId,
    hostPeerId: selfId,
    code,
    close: () => transport.close()
  };
}

export function joinRoom(rawCode: string): NetLink {
  const capabilities = detectCapabilities();
  if (!capabilities.webrtc) throw new Error('webrtc-unavailable');

  const code = normaliseRoomCode(rawCode);
  const selfId = `guest-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const hostPeerId = `host-${code.toLowerCase()}`;
  const transport = new WebRtcTransport(selfId, buildSignalling(code, selfId), createPeer);
  transport.connect(hostPeerId);
  return {
    transport,
    selfId,
    hostPeerId,
    code,
    close: () => transport.close()
  };
}

export { normaliseRoomCode };
