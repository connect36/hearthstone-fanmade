import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { RoomManager } from './server/rooms.mjs';
import { GameEngine } from './server/game-engine.mjs';
import {
  ClientMessageTypes,
  ServerMessageTypes,
  RoomStatus,
  createErrorMessage,
  createRoomStateMessage,
  createGameStartedMessage,
  createStateUpdateMessage,
  ActionTypes
} from './server/protocol.mjs';
import { cardById } from './public/game-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const host = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const RECONNECT_GRACE_MS = 5 * 60 * 1000;

// 文件类型映射
const fileTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

// 初始化管理器
const roomManager = new RoomManager();
const gameEngine = new GameEngine();
const pendingDisconnects = new Map();

const serverCards = Object.fromEntries(
  Object.values(cardById).map((card) => [
    card.id,
    {
      ...card,
      enabled: card.enabled !== false
    }
  ])
);

// 注入卡牌查找表到游戏引擎
gameEngine.getCardsLookup = () => serverCards;

// 生成网络URL列表
function networkUrls() {
  const urls = new Set([`http://127.0.0.1:${port}`]);
  const nets = os.networkInterfaces();

  for (const values of Object.values(nets)) {
    for (const info of values || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      urls.add(`http://${info.address}:${port}`);
    }
  }

  return [...urls];
}

// JSON响应
function json(res, payload, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

// 静态文件服务
async function serveStatic(req, res) {
  const requestPath = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
  let safePath = requestPath;

  if (requestPath === '/') safePath = '/index.html';
  if (requestPath === '/agents' || requestPath === '/agents/') safePath = '/agents.html';
  if (requestPath === '/editor' || requestPath === '/editor/') safePath = '/editor.html';

  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    const content = await readFile(filePath);
    const contentType = fileTypes.get(path.extname(filePath)) || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

// 创建HTTP服务器
const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

  // API端点
  if (pathname === '/api/meta') {
    json(res, {
      title: '炉边酒馆 LAN 对决',
      subtitle: '局域网双人对战，单机Boss战',
      host,
      port,
      urls: networkUrls(),
      mode: 'multiplayer-ready'
    });
    return;
  }

  if (pathname === '/api/healthz') {
    json(res, { ok: true, host, port });
    return;
  }

  if (pathname === '/api/rooms') {
    // 获取活跃房间列表（不含敏感信息）
    const rooms = [];
    for (const room of roomManager.rooms.values()) {
      if (room.status === RoomStatus.WAITING) {
        rooms.push({
          id: room.id,
          players: room.guestPlayerId ? 2 : 1,
          createdAt: room.createdAt
        });
      }
    }
    json(res, { rooms });
    return;
  }

  await serveStatic(req, res);
});

// 创建WebSocket服务器
const wss = new WebSocketServer({ server: httpServer });

// 生成玩家ID
function generatePlayerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `player-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function clearPendingDisconnect(playerId) {
  const timeoutId = pendingDisconnects.get(playerId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    pendingDisconnects.delete(playerId);
  }
}

// 广播消息到房间
function broadcastToRoom(room, message, excludePlayerId = null) {
  const messageStr = JSON.stringify(message);
  for (const [playerId, ws] of room.sockets) {
    if (playerId !== excludePlayerId && ws.readyState === 1) {
      ws.send(messageStr);
    }
  }
}

// 发送给特定玩家
function sendToPlayer(room, playerId, message) {
  const ws = room.sockets.get(playerId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastRoomState(room) {
  for (const playerId of [room.hostPlayerId, room.guestPlayerId]) {
    if (!playerId) continue;
    sendToPlayer(room, playerId, createRoomStateMessage(room, playerId));
  }
}

function notifyRoomClosed(room, excludePlayerId = null) {
  if (!room) return;
  broadcastToRoom(room, {
    type: ServerMessageTypes.ROOM_CLOSED
  }, excludePlayerId);
}

function handleRoomDeparture(playerId, disconnectReason) {
  clearPendingDisconnect(playerId);
  const room = roomManager.getRoomByPlayer(playerId);
  const result = roomManager.leaveRoom(playerId);

  if (!result) return;

  if (result.type === 'closed') {
    notifyRoomClosed(room, playerId);
    console.log(`Room ${result.roomId} closed`);
    return;
  }

  if (result.type === 'left') {
    const updatedRoom = roomManager.getRoom(result.roomId);
    if (updatedRoom) {
      broadcastRoomState(updatedRoom);
    }
    return;
  }

  if (result.type === 'disconnect') {
    if (room && result.winnerId) {
      broadcastToRoom(room, {
        type: ServerMessageTypes.PLAYER_DISCONNECTED,
        winnerId: result.winnerId,
        reason: disconnectReason
      }, playerId);
    }
    roomManager.deleteRoom(result.roomId);
  }
}

// WebSocket连接处理
wss.on('connection', (ws, req) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const requestedClientId = requestUrl.searchParams.get('clientId');
  const playerId = requestedClientId?.trim() || generatePlayerId();
  ws.playerId = playerId;

  console.log(`Player connected: ${playerId}`);
  ws.send(JSON.stringify({
    type: ServerMessageTypes.SESSION,
    playerId
  }));

  clearPendingDisconnect(playerId);

  const existingRoom = roomManager.getRoomByPlayer(playerId);
  if (existingRoom) {
    roomManager.registerSocket(existingRoom.id, playerId, ws);
    if (existingRoom.status === RoomStatus.PLAYING && existingRoom.gameState) {
      ws.send(JSON.stringify(createGameStartedMessage(existingRoom.gameState, playerId)));
    } else {
      ws.send(JSON.stringify(createRoomStateMessage(existingRoom, playerId)));
    }
  }

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(ws, playerId, message);
    } catch (err) {
      console.error('Failed to parse message:', err);
      ws.send(JSON.stringify(createErrorMessage('Invalid message format')));
    }
  });

  ws.on('close', () => {
    console.log(`Player disconnected: ${playerId}`);
    handleDisconnect(playerId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${playerId}:`, err);
  });
});

// 处理客户端消息
function handleClientMessage(ws, playerId, message) {
  const { type, ...payload } = message;

  switch (type) {
    case ClientMessageTypes.CREATE_ROOM:
      handleCreateRoom(ws, playerId, payload);
      break;

    case ClientMessageTypes.JOIN_ROOM:
      handleJoinRoom(ws, playerId, payload);
      break;

    case ClientMessageTypes.LEAVE_ROOM:
      handleLeaveRoom(ws, playerId);
      break;

    case ClientMessageTypes.SET_READY:
      handleSetReady(ws, playerId);
      break;

    case ClientMessageTypes.ACTION:
      handleAction(ws, playerId, payload);
      break;

    default:
      ws.send(JSON.stringify(createErrorMessage(`Unknown message type: ${type}`)));
  }
}

// 创建房间
function handleCreateRoom(ws, playerId, payload) {
  const { deck } = payload;

  if (!deck || !Array.isArray(deck) || deck.length === 0) {
    ws.send(JSON.stringify(createErrorMessage('Invalid deck')));
    return;
  }

  const room = roomManager.createRoom(playerId, deck);
  roomManager.registerSocket(room.id, playerId, ws);

  ws.send(JSON.stringify({
    type: ServerMessageTypes.ROOM_CREATED,
    roomId: room.id,
    playerId,
    isHost: true
  }));

  ws.send(JSON.stringify(createRoomStateMessage(room, playerId)));

  console.log(`Room created: ${room.id} by ${playerId}`);
}

// 加入房间
function handleJoinRoom(ws, playerId, payload) {
  const { roomId, deck } = payload;

  if (!roomId || !deck || !Array.isArray(deck)) {
    ws.send(JSON.stringify(createErrorMessage('Invalid request')));
    return;
  }

  const result = roomManager.joinRoom(playerId, roomId, deck);

  if (!result.success) {
    if (result.error === 'ROOM_NOT_FOUND') {
      ws.send(JSON.stringify({
        type: ServerMessageTypes.ROOM_NOT_FOUND,
        roomId
      }));
    } else {
      ws.send(JSON.stringify(createErrorMessage(result.error)));
    }
    return;
  }

  const room = result.room;
  roomManager.registerSocket(room.id, playerId, ws);

  // 通知加入者
  ws.send(JSON.stringify({
    type: ServerMessageTypes.ROOM_JOINED,
    roomId: room.id,
    playerId,
    isHost: false
  }));

  ws.send(JSON.stringify(createRoomStateMessage(room, playerId)));

  // 通知房主有新玩家加入
  sendToPlayer(room, room.hostPlayerId, createRoomStateMessage(room, room.hostPlayerId));

  console.log(`Player ${playerId} joined room ${room.id}`);
}

// 离开房间
function handleLeaveRoom(ws, playerId) {
  handleRoomDeparture(playerId, 'Opponent left the room');
}

// 设置准备状态
function handleSetReady(ws, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);

  if (!room) {
    ws.send(JSON.stringify(createErrorMessage('Not in a room')));
    return;
  }

  const updatedRoom = roomManager.setReady(playerId, true);

  // 检查双方是否都准备
  if (updatedRoom.hostReady && updatedRoom.guestReady) {
    // 双方都准备，开始游戏
    updatedRoom.status = RoomStatus.PLAYING;

    try {
      updatedRoom.gameState = gameEngine.initializeGameState(updatedRoom);
      console.log(`Game initialized for room ${room.id}`);

      // 广播游戏开始给两位玩家
      for (const pid of [room.hostPlayerId, room.guestPlayerId]) {
        const msg = createGameStartedMessage(updatedRoom.gameState, pid);
        console.log(`Sending game_started to ${pid}:`, JSON.stringify(msg).substring(0, 100));
        sendToPlayer(updatedRoom, pid, msg);
      }

      console.log(`Game started in room ${room.id}`);
    } catch (err) {
      console.error('Failed to initialize game:', err);
      ws.send(JSON.stringify(createErrorMessage('Failed to start game')));
    }
  } else {
    // 广播准备状态给房间内所有玩家
    broadcastRoomState(updatedRoom);
    console.log(`Player ${playerId} ready, waiting for opponent`);
  }
}

// 处理游戏操作
function handleAction(ws, playerId, payload) {
  const room = roomManager.getRoomByPlayer(playerId);

  if (!room || room.status !== RoomStatus.PLAYING) {
    ws.send(JSON.stringify(createErrorMessage('Not in a game')));
    return;
  }

  const result = gameEngine.processAction(room, playerId, payload.action || {});

  if (!result.valid) {
    ws.send(JSON.stringify({
      type: ServerMessageTypes.ACTION_REJECTED,
      reason: result.reason
    }));
    return;
  }

  // 广播状态更新给所有玩家
  for (const pid of [room.hostPlayerId, room.guestPlayerId]) {
    sendToPlayer(room, pid, createStateUpdateMessage(result.state, pid));
  }

  // 如果游戏结束，更新房间状态
  if (result.gameOver) {
    room.status = RoomStatus.FINISHED;
    console.log(`Game ended in room ${room.id}`);
  }
}

// 处理断线
function handleDisconnect(playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room) return;

  room.sockets.delete(playerId);
  clearPendingDisconnect(playerId);

  const timeoutId = setTimeout(() => {
    pendingDisconnects.delete(playerId);
    handleRoomDeparture(playerId, 'Opponent disconnected');
  }, RECONNECT_GRACE_MS);

  pendingDisconnects.set(playerId, timeoutId);
}

// 启动服务器
httpServer.listen(port, host, () => {
  const urls = networkUrls();
  console.log(`\n🏰 炉边酒馆 LAN 对决`);
  console.log(`   Server running on ${host}:${port}`);
  console.log(`\n   Local:  http://127.0.0.1:${port}`);
  for (const url of urls) {
    if (url !== `http://127.0.0.1:${port}`) {
      console.log(`   LAN:    ${url}`);
    }
  }
  console.log(`\n   WebSocket: ws://${host}:${port}`);
  console.log(`\n   Mode: LAN Multiplayer + Solo Boss\n`);
});

// 定期清理超时房间
setInterval(() => {
  roomManager.cleanupStaleRooms();
}, 5 * 60 * 1000); // 每5分钟清理一次
