// 消息协议定义 - 客户端与服务器之间的通信协议

// 服务器 → 客户端 消息类型
export const ServerMessageTypes = Object.freeze({
  SESSION: 'session',
  ROOM_CREATED: 'room_created',
  ROOM_STATE: 'room_state',
  ROOM_JOINED: 'room_joined',
  PLAYER_JOINED: 'player_joined',
  PLAYER_READY: 'player_ready',
  GAME_STARTED: 'game_started',
  GAME_STATE_UPDATE: 'game_state_update',
  ACTION_REJECTED: 'action_rejected',
  PLAYER_DISCONNECTED: 'player_disconnected',
  ROOM_CLOSED: 'room_closed',
  ROOM_NOT_FOUND: 'room_not_found',
  ERROR: 'error'
});

// 客户端 → 服务器 消息类型
export const ClientMessageTypes = Object.freeze({
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SET_READY: 'set_ready',
  ACTION: 'action'
});

// 操作类型
export const ActionTypes = Object.freeze({
  PLAY_CARD: 'play_card',
  ATTACK: 'attack',
  END_TURN: 'end_turn'
});

// 房间状态
export const RoomStatus = Object.freeze({
  WAITING: 'waiting',
  READY: 'ready',
  PLAYING: 'playing',
  FINISHED: 'finished'
});

// 玩家槽位
export const PlayerSlot = Object.freeze({
  PLAYER1: 'player1',
  PLAYER2: 'player2'
});

// 目标类型
export const TargetKind = Object.freeze({
  HERO: 'hero',
  MINION: 'minion'
});

// 过滤游戏状态，只显示玩家应该看到的信息
export function filterStateForPlayer(gameState, playerId) {
  if (!gameState) return null;

  const isPlayer1 = gameState.player1.socketId === playerId;
  const mySlot = isPlayer1 ? PlayerSlot.PLAYER1 : PlayerSlot.PLAYER2;
  const myPlayer = isPlayer1 ? gameState.player1 : gameState.player2;
  const opponentPlayer = isPlayer1 ? gameState.player2 : gameState.player1;

  return {
    turn: gameState.turn,
    activePlayerId: gameState.activePlayerId,
    phase: gameState.phase,
    winnerId: gameState.winnerId,
    actionLog: gameState.actionLog || [],
    mySlot,
    myPlayer: {
      ...myPlayer,
      hand: myPlayer.hand,
      deck: myPlayer.deck,
      handCount: myPlayer.hand.length,
      deckCount: myPlayer.deck.length
    },
    opponentPlayer: {
      ...opponentPlayer,
      hand: [],
      deck: [],
      handCount: opponentPlayer.hand.length,
      deckCount: opponentPlayer.deck.length
    }
  };
}

// 创建错误消息
export function createErrorMessage(message) {
  return {
    type: ServerMessageTypes.ERROR,
    message
  };
}

// 创建房间状态消息
export function createRoomStateMessage(room, playerId) {
  const isHost = room.hostPlayerId === playerId;
  return {
    type: ServerMessageTypes.ROOM_STATE,
    playerId,
    roomId: room.id,
    status: room.status,
    isHost,
    hostReady: room.hostReady,
    guestReady: room.guestReady,
    guestPlayerId: room.guestPlayerId
  };
}

// 创建游戏开始消息
export function createGameStartedMessage(gameState, playerId) {
  return {
    type: ServerMessageTypes.GAME_STARTED,
    playerId,
    state: filterStateForPlayer(gameState, playerId)
  };
}

// 创建状态更新消息
export function createStateUpdateMessage(gameState, playerId) {
  return {
    type: ServerMessageTypes.GAME_STATE_UPDATE,
    playerId,
    state: filterStateForPlayer(gameState, playerId)
  };
}
