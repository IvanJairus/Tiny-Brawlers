#!/usr/bin/env node
/**
 * Minimal signalling relay for Tiny Brawlers.
 *
 * The game only needs someone to pass SDP and ICE between two browsers; the match
 * itself runs peer to peer. Run it anywhere a WebSocket is reachable, then open the
 * game with ?signal=wss://your-host/ and share the room code.
 *
 *   node scripts/signaling-server.mjs --port 8080
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const portArg = process.argv.findIndex((arg) => arg === '--port');
const PORT = Number(portArg >= 0 ? process.argv[portArg + 1] : process.env.PORT ?? 8080);

const rooms = new Map();

// STUN alone cannot cross some cellular networks. Set these three and the page
// gets a TURN relay in its peer connection; leave them unset for local play.
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }
];
if (process.env.TURN_URL && process.env.TURN_USER && process.env.TURN_PASS) {
  ICE_SERVERS.push({
    urls: [process.env.TURN_URL],
    username: process.env.TURN_USER,
    credential: process.env.TURN_PASS
  });
}

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'tiny-brawlers-signalling', rooms: rooms.size }));
});

const wss = new WebSocketServer({ server });

const leave = (socket) => {
  const room = rooms.get(socket.room);
  if (!room) return;
  room.delete(socket.id);
  for (const peer of room.values()) {
    if (peer.readyState === 1) peer.send(JSON.stringify({ t: 'gone', peer: socket.id }));
  }
  if (room.size === 0) rooms.delete(socket.room);
};

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let packet;
    try {
      packet = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (packet.t === 'hello') {
      socket.room = String(packet.room ?? '').slice(0, 16);
      socket.id = String(packet.id ?? '').slice(0, 64);
      if (!socket.room || !socket.id) return;
      if (!rooms.has(socket.room)) rooms.set(socket.room, new Map());
      rooms.get(socket.room).set(socket.id, socket);
      socket.send(JSON.stringify({ t: 'ice', ice: ICE_SERVERS }));
      return;
    }

    const room = rooms.get(packet.room);
    const target = room?.get(packet.to);
    if (!target || target.readyState !== 1) return;
    target.send(JSON.stringify({ from: packet.from, message: packet.message }));
  });

  socket.on('close', () => leave(socket));
  socket.on('error', () => leave(socket));
});

server.listen(PORT, () => {
  console.log(`tiny-brawlers signalling on ws://localhost:${PORT}`);
});
