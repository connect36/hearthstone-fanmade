import { RoomStatus } from './protocol.mjs';

// 房间管理器 - 管理所有游戏房间
export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerToRoom = new Map(); // playerId -> roomId
  }

  // 生成4位房间号
  generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let roomId = '';
    for (let i = 0; i < 4; i++) {
      roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // 确保房间号唯一
    if (this.rooms.has(roomId)) {
      return this.generateRoomId();
    }
    return roomId;
  }

  // 创建房间
  createRoom(hostPlayerId, hostDeck) {
    const roomId = this.generateRoomId();
    const room = {
      id: roomId,
      status: RoomStatus.WAITING,
      hostPlayerId,
      guestPlayerId: null,
      hostDeck,
      guestDeck: null,
      hostReady: false,
      guestReady: false,
      gameState: null,
      createdAt: Date.now(),
      sockets: new Map() // playerId -> ws
    };

    this.rooms.set(roomId, room);
    this.playerToRoom.set(hostPlayerId, roomId);

    return room;
  }

  // 加入房间
  joinRoom(playerId, roomId, deck) {
    const normalizedRoomId = roomId.toUpperCase().trim();
    const room = this.rooms.get(normalizedRoomId);

    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND', roomId: normalizedRoomId };
    }

    if (room.status !== RoomStatus.WAITING) {
      return { success: false, error: 'Game already started' };
    }

    if (room.hostPlayerId === playerId) {
      return { success: false, error: 'Cannot join your own room' };
    }

    if (room.guestPlayerId !== null) {
      return { success: false, error: 'Room is full' };
    }

    room.guestPlayerId = playerId;
    room.guestDeck = deck;
    room.status = RoomStatus.READY;
    this.playerToRoom.set(playerId, normalizedRoomId);

    return { success: true, room };
  }

  // 离开房间
  leaveRoom(playerId) {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerToRoom.delete(playerId);
      return null;
    }

    this.playerToRoom.delete(playerId);
    room.sockets.delete(playerId);

    // 如果是游戏进行中，离开的玩家判负
    if (room.status === RoomStatus.PLAYING) {
      room.status = RoomStatus.FINISHED;
      const winnerId = room.hostPlayerId === playerId
        ? room.guestPlayerId
        : room.hostPlayerId;
      return { roomId, type: 'disconnect', winnerId, reason: 'Player disconnected' };
    }

    // 游戏未开始，清除房间或设置等待状态
    if (room.guestPlayerId === playerId) {
      room.guestPlayerId = null;
      room.guestDeck = null;
      room.guestReady = false;
      room.status = RoomStatus.WAITING;
    } else if (room.hostPlayerId === playerId) {
      // 房主离开，解散房间
      this.deleteRoom(roomId);
      return { roomId, type: 'closed' };
    }

    return { roomId, type: 'left' };
  }

  // 设置玩家准备状态
  setReady(playerId, ready = true) {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (room.hostPlayerId === playerId) {
      room.hostReady = ready;
    } else if (room.guestPlayerId === playerId) {
      room.guestReady = ready;
    }

    return room;
  }

  // 获取玩家所在房间
  getRoomByPlayer(playerId) {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  // 获取房间
  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  // 注册socket
  registerSocket(roomId, playerId, ws) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.sockets.set(playerId, ws);
    }
  }

  // 获取房间内所有socket
  getRoomSockets(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.sockets.values());
  }

  // 广播消息到房间
  broadcastToRoom(roomId, message, excludePlayerId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    for (const [playerId, ws] of room.sockets) {
      if (playerId !== excludePlayerId && ws.readyState === 1) {
        ws.send(messageStr);
      }
    }
  }

  // 发送给特定玩家
  sendToPlayer(playerId, message) {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const ws = room.sockets.get(playerId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  // 删除房间
  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // 清除所有玩家的房间映射
    for (const playerId of [room.hostPlayerId, room.guestPlayerId]) {
      if (playerId) {
        this.playerToRoom.delete(playerId);
      }
    }

    this.rooms.delete(roomId);
  }

  // 清理超时房间（超过30分钟未开始的房间）
  cleanupStaleRooms() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30分钟

    for (const [roomId, room] of this.rooms) {
      if (room.status === RoomStatus.WAITING && now - room.createdAt > timeout) {
        this.deleteRoom(roomId);
      }
    }
  }
}
