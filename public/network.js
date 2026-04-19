// 网络管理器 - WebSocket客户端封装
// 处理与服务器的通信、房间管理和游戏状态同步

const CLIENT_ID_STORAGE_KEY = 'clawteam-lan-hearthstone-client-id-v1';

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStableClientId() {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = createClientId();
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return createClientId();
  }
}

class NetworkManager {
  constructor() {
    this.ws = null;
    this.clientId = getStableClientId();
    this.playerId = null;
    this.roomId = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  // 获取WebSocket URL
  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}?clientId=${encodeURIComponent(this.clientId)}`;
  }

  // 连接服务器
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.getWebSocketUrl());

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (err) {
            console.error('Failed to parse message:', err);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected', event.code, event.reason);
          this.emit('disconnected', { code: event.code, reason: event.reason });

          // 尝试重连（如果是意外断开）
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  // 尝试重连
  attemptReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CLOSED) {
        this.connect().catch(() => {
          // 重连失败，等待下一次尝试
        });
      }
    }, delay);
  }

  // 发送消息
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  // 订阅事件
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  // 取消订阅
  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // 触发事件
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`Error in event handler for ${event}:`, err);
      }
    });
  }

  // 处理收到的消息
  handleMessage(message) {
    if (message.playerId) {
      this.playerId = message.playerId;
    }

    switch (message.type) {
      case 'session':
        this.playerId = message.playerId;
        this.emit('session', message);
        break;

      case 'room_created':
        this.roomId = message.roomId;
        this.emit('room_created', message);
        break;

      case 'room_state':
        this.roomId = message.roomId;
        this.emit('room_state', message);
        break;

      case 'room_joined':
        this.roomId = message.roomId;
        this.emit('room_joined', message);
        break;

      case 'player_ready':
        this.emit('player_ready', message);
        break;

      case 'game_started':
        this.playerId = message.state?.myPlayer?.socketId || this.playerId;
        this.emit('game_started', message);
        break;

      case 'game_state_update':
        this.playerId = message.state?.myPlayer?.socketId || this.playerId;
        this.emit('state_update', message.state);
        break;

      case 'action_rejected':
        this.emit('action_rejected', message);
        break;

      case 'player_disconnected':
        this.emit('player_disconnected', message);
        break;

      case 'room_closed':
        this.roomId = null;
        this.emit('room_closed', message);
        break;

      case 'room_not_found':
        this.emit('room_not_found', message);
        break;

      case 'error':
        this.emit('error', message);
        break;
    }
  }

  // 创建房间
  createRoom(deck) {
    this.send({
      type: 'create_room',
      deck
    });
  }

  // 加入房间
  joinRoom(roomId, deck) {
    this.send({
      type: 'join_room',
      roomId: roomId.toUpperCase().trim(),
      deck
    });
  }

  // 离开房间
  leaveRoom() {
    this.send({
      type: 'leave_room'
    });
    this.roomId = null;
  }

  // 设置准备
  setReady() {
    this.send({
      type: 'set_ready'
    });
  }

  // 发送游戏操作
  sendAction(action) {
    this.send({
      type: 'action',
      action
    });
  }

  // 出牌
  playCard(cardInstanceId, targetRef = null) {
    this.sendAction({
      type: 'play_card',
      payload: {
        cardInstanceId,
        targetRef
      }
    });
  }

  // 攻击
  attack(attackerId, targetRef) {
    this.sendAction({
      type: 'attack',
      payload: {
        attackerId,
        targetRef
      }
    });
  }

  // 结束回合
  endTurn() {
    this.sendAction({
      type: 'end_turn'
    });
  }

  // 断开连接
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.roomId = null;
    this.listeners.clear();
  }

  // 检查是否已连接
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // 检查是否在房间中
  isInRoom() {
    return this.roomId !== null;
  }
}

// 创建全局单例
const network = new NetworkManager();

// 导出
export { network, NetworkManager };
