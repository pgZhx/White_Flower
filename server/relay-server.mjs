import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 9001);
const MAX_PEERS = 12;
const MAX_PAYLOAD = 256 * 1024;
const HEARTBEAT_INTERVAL_MS = 30_000;

/** @type {Map<string, { roomId: string, hostClientId: string, hostSocket: import('ws').WebSocket, peers: Map<string, import('ws').WebSocket> }>} */
const rooms = new Map();
/** @type {Map<import('ws').WebSocket, { roomId: string, clientId: string, role: 'host' | 'peer' }>} */
const socketMeta = new Map();
/** @type {Map<import('ws').WebSocket, boolean>} */
const isAlive = new Map();

function sendJson(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendError(socket, code, message) {
  sendJson(socket, { kind: 'ERROR', code, message });
}

function isOpen(socket) {
  return Boolean(socket) && socket.readyState === WebSocket.OPEN;
}

function handleMessage(ws, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    sendError(ws, 'INVALID_JSON', '消息不是合法 JSON');
    return;
  }

  if (!message || typeof message !== 'object' || typeof message.kind !== 'string') {
    sendError(ws, 'INVALID_ENVELOPE', 'Relay 消息格式错误');
    return;
  }

  switch (message.kind) {
    case 'REGISTER_HOST':
      handleRegisterHost(ws, message);
      return;
    case 'REGISTER_PEER':
      handleRegisterPeer(ws, message);
      return;
    case 'ROUTE_TO_HOST':
      handleRouteToHost(ws, message);
      return;
    case 'ROUTE_TO_PEER':
      handleRouteToPeer(ws, message);
      return;
    case 'BROADCAST':
      handleBroadcast(ws, message);
      return;
    default:
      sendError(ws, 'UNKNOWN_KIND', `未知 Relay 消息类型: ${message.kind}`);
  }
}

function handleRegisterHost(ws, message) {
  if (socketMeta.has(ws)) {
    sendError(ws, 'ALREADY_REGISTERED', '当前连接已经注册');
    return;
  }

  const roomId = typeof message.roomId === 'string' ? message.roomId.trim().toUpperCase() : '';
  const clientId = typeof message.clientId === 'string' ? message.clientId : '';
  if (!roomId || !clientId) {
    sendError(ws, 'INVALID_REGISTRATION', '缺少 roomId 或 clientId');
    return;
  }

  if (rooms.has(roomId)) {
    sendError(ws, 'ROOM_EXISTS', '房间已存在，请重新创建房间');
    return;
  }

  const room = {
    roomId,
    hostClientId: clientId,
    hostSocket: ws,
    peers: new Map(),
  };
  rooms.set(roomId, room);
  socketMeta.set(ws, { roomId, clientId, role: 'host' });
  sendJson(ws, { kind: 'REGISTERED', role: 'host', roomId, clientId });
  console.log(`host registered room=${roomId} client=${clientId}`);
}

function handleRegisterPeer(ws, message) {
  if (socketMeta.has(ws)) {
    sendError(ws, 'ALREADY_REGISTERED', '当前连接已经注册');
    return;
  }

  const roomId = typeof message.roomId === 'string' ? message.roomId.trim().toUpperCase() : '';
  const clientId = typeof message.clientId === 'string' ? message.clientId : '';
  if (!roomId || !clientId) {
    sendError(ws, 'INVALID_REGISTRATION', '缺少 roomId 或 clientId');
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    sendError(ws, 'ROOM_NOT_FOUND', '找不到该房间，请确认房间码正确且房主仍然在线。');
    return;
  }
  if (!isOpen(room.hostSocket)) {
    sendError(ws, 'HOST_OFFLINE', '房主已离线');
    return;
  }
  if (room.peers.size >= MAX_PEERS) {
    sendError(ws, 'ROOM_FULL', '房间网络连接已满');
    return;
  }

  room.peers.set(clientId, ws);
  socketMeta.set(ws, { roomId, clientId, role: 'peer' });
  sendJson(ws, {
    kind: 'REGISTERED',
    role: 'peer',
    roomId,
    clientId,
    hostClientId: room.hostClientId,
  });
  sendJson(room.hostSocket, { kind: 'PEER_CONNECTED', peerId: clientId });
  console.log(`peer joined room=${roomId} client=${clientId}`);
}

function handleRouteToHost(ws, message) {
  const meta = socketMeta.get(ws);
  if (!meta) {
    sendError(ws, 'UNREGISTERED', '连接尚未注册');
    return;
  }
  if (meta.role !== 'peer') {
    sendError(ws, 'NOT_PEER', '只有 Peer 可以 ROUTE_TO_HOST');
    return;
  }

  const room = rooms.get(meta.roomId);
  if (!room || !isOpen(room.hostSocket)) {
    sendError(ws, 'HOST_OFFLINE', '房主已离线');
    return;
  }

  sendJson(room.hostSocket, {
    kind: 'MESSAGE',
    fromPeerId: meta.clientId,
    payload: message.payload,
  });
}

function handleRouteToPeer(ws, message) {
  const meta = socketMeta.get(ws);
  if (!meta) {
    sendError(ws, 'UNREGISTERED', '连接尚未注册');
    return;
  }
  if (meta.role !== 'host') {
    sendError(ws, 'NOT_HOST', '只有 Host 可以 ROUTE_TO_PEER');
    return;
  }

  const toPeerId = typeof message.toPeerId === 'string' ? message.toPeerId : '';
  const room = rooms.get(meta.roomId);
  if (!room) {
    sendError(ws, 'ROOM_NOT_FOUND', '房间不存在');
    return;
  }
  const target = room.peers.get(toPeerId);
  if (!target || !isOpen(target)) {
    sendError(ws, 'PEER_NOT_FOUND', '目标 Peer 不存在或已离线');
    return;
  }

  sendJson(target, {
    kind: 'MESSAGE',
    fromPeerId: meta.clientId,
    payload: message.payload,
  });
}

function handleBroadcast(ws, message) {
  const meta = socketMeta.get(ws);
  if (!meta) {
    sendError(ws, 'UNREGISTERED', '连接尚未注册');
    return;
  }
  if (meta.role !== 'host') {
    sendError(ws, 'NOT_HOST', '只有 Host 可以广播');
    return;
  }

  const room = rooms.get(meta.roomId);
  if (!room) return;
  for (const peerSocket of room.peers.values()) {
    sendJson(peerSocket, {
      kind: 'MESSAGE',
      fromPeerId: meta.clientId,
      payload: message.payload,
    });
  }
}

function handleClose(ws) {
  const meta = socketMeta.get(ws);
  if (!meta) return;

  socketMeta.delete(ws);
  isAlive.delete(ws);

  const room = rooms.get(meta.roomId);
  if (!room) return;

  if (meta.role === 'host') {
    for (const peerSocket of room.peers.values()) {
      sendJson(peerSocket, { kind: 'HOST_DISCONNECTED', message: '房主已离开。当前对局无法继续。' });
      peerSocket.close();
    }
    rooms.delete(meta.roomId);
    console.log(`host disconnected room=${meta.roomId} room deleted`);
  } else {
    room.peers.delete(meta.clientId);
    if (isOpen(room.hostSocket)) {
      sendJson(room.hostSocket, { kind: 'PEER_DISCONNECTED', peerId: meta.clientId });
    }
    console.log(`peer disconnected room=${meta.roomId} client=${meta.clientId}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({
  server,
  path: '/relay',
  maxPayload: MAX_PAYLOAD,
});

wss.on('connection', (ws) => {
  isAlive.set(ws, true);
  ws.on('pong', () => isAlive.set(ws, true));
  ws.on('message', (data) => {
    isAlive.set(ws, true);
    handleMessage(ws, data);
  });
  ws.on('close', () => handleClose(ws));
  ws.on('error', () => {
    // Avoid crashing the process on socket errors; close cleanup still runs.
  });
});

const heartbeat = setInterval(() => {
  for (const [ws, alive] of isAlive.entries()) {
    if (alive === false) {
      ws.terminate();
      continue;
    }
    isAlive.set(ws, false);
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);
heartbeat.unref?.();

server.listen(PORT, HOST, () => {
  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : PORT;
  console.log(`relay started port=${actualPort}`);
});
