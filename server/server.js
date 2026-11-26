/**
 * Video Konferans - Signaling Server
 * WebRTC bağlantıları için SDP ve ICE candidate alışverişini yönetir
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const CERT_DIR = path.join(ROOT_DIR, 'cert');

const app = express();

const useHttps = process.env.HTTPS === '1' || process.env.HTTPS === 'true';
const certPath = process.env.SSL_CRT_FILE || path.join(CERT_DIR, 'cert.pem');
const keyPath = process.env.SSL_KEY_FILE || path.join(CERT_DIR, 'key.pem');

let server;
if (useHttps && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  server = https.createServer(
    { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
    app
  );
} else {
  server = http.createServer(app);
}
const io = new Server(server);
const { getInitialChessState, publicChessState, tryChessMove } = require('./games/chess');
const ticTacToe = require('./games/tictactoe');
const battleship = require('./games/battleship');
const lingo = require('./games/lingo');
const memory = require('./games/memory');
const backgammon = require('./games/backgammon');
const botAi = require('./games/bot');

// Statik dosyalar (ön yüz)
app.use(express.static(CLIENT_DIR));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

app.get('/kamera', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'kamera.html'));
});

// Oda bilgileri: { roomId: { users: Set<string>, userOrder: string[] } }
const rooms = new Map();

// Oyun durumu: { roomId: { board, currentTurn, winner, player1, player2 } }
const gameState = new Map();
const lingoTimers = new Map();
const memoryTimers = new Map();
const gameClockTimers = new Map();
const botTimers = new Map();
const roomResumeSessions = new Map();
const ROOM_RESUME_GRACE_MS = 5 * 60 * 1000;
const cameraPublishers = new Map();
const cameraViewers = new Map();
const pendingCameraPublishers = new Map();
const cameraPasswordAttempts = new Map();
const CAMERA_PASSWORD_ATTEMPT_LIMIT = 5;
const CAMERA_PASSWORD_ATTEMPT_WINDOW_MS = 60 * 1000;

function createGameById(gameId, {
  keepScores = false,
  previous,
  forcePlacement = false,
  wordLength = 5,
  boardSize = '4x5',
  timeMinutes = 0,
  startingPlayer = 'player1'
} = {}) {
  let game;
  if (gameId === 'battleship') game = battleship.getInitialState(keepScores, previous, forcePlacement, startingPlayer);
  else if (gameId === 'chess') game = getInitialChessState(keepScores, previous, startingPlayer);
  else if (gameId === 'backgammon') game = backgammon.getInitialState(keepScores, previous, startingPlayer);
  else if (gameId === 'lingo') game = lingo.getInitialState(wordLength, keepScores, previous, startingPlayer);
  else if (gameId === 'memory') game = memory.getInitialState(boardSize, keepScores, previous, startingPlayer);
  else game = ticTacToe.getInitialState(keepScores, previous, startingPlayer);
  if (gameId === 'chess' || gameId === 'backgammon') {
    game.clockMinutes = [0, 5, 10, 15].includes(Number(timeMinutes)) ? Number(timeMinutes) : 0;
  }
  return game;
}

function isGamePlayerConnected(game, player) {
  const playerId = player === 'player1' ? game.player1 : game.player2;
  if (typeof playerId !== 'string') return false;
  if (playerId.startsWith('bot-')) return true;
  const playerSocket = io.sockets.sockets.get(playerId);
  return Boolean(playerSocket && playerSocket.gameVisible !== false);
}

function clearLingoTimer(roomId) {
  const timer = lingoTimers.get(roomId);
  if (timer) clearTimeout(timer);
  lingoTimers.delete(roomId);
}

function clearMemoryTimer(roomId) {
  const timer = memoryTimers.get(roomId);
  if (timer) clearTimeout(timer);
  memoryTimers.delete(roomId);
}

function clearGameClockTimer(roomId) {
  const timer = gameClockTimers.get(roomId);
  if (timer) clearTimeout(timer);
  gameClockTimers.delete(roomId);
}

function clearBotTimer(roomId) {
  const timer = botTimers.get(roomId);
  if (timer) clearTimeout(timer);
  botTimers.delete(roomId);
}

function clearRoomTimers(roomId) {
  clearLingoTimer(roomId);
  clearMemoryTimer(roomId);
  clearGameClockTimer(roomId);
  clearBotTimer(roomId);
}

function invalidateRoomResumeSession(socket) {
  const token = socket.roomResumeToken;
  if (!token) return;
  const session = roomResumeSessions.get(token);
  if (session?.timer) clearTimeout(session.timer);
  roomResumeSessions.delete(token);
  socket.roomResumeToken = null;
}

function createRoomResumeSession(socket, roomId) {
  invalidateRoomResumeSession(socket);
  const token = crypto.randomBytes(32).toString('hex');
  roomResumeSessions.set(token, {
    roomId,
    socketId: socket.id,
    displayName: socket.displayName,
    socket,
    timer: null
  });
  socket.roomResumeToken = token;
  return token;
}

function hashCameraPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

function consumeCameraPasswordAttempt(viewerId, publisherId) {
  const now = Date.now();
  let attemptsByCamera = cameraPasswordAttempts.get(viewerId);
  if (!attemptsByCamera) {
    attemptsByCamera = new Map();
    cameraPasswordAttempts.set(viewerId, attemptsByCamera);
  }
  let attempt = attemptsByCamera.get(publisherId);
  if (!attempt || now >= attempt.resetAt) {
    attempt = { count: 0, resetAt: now + CAMERA_PASSWORD_ATTEMPT_WINDOW_MS };
  }
  if (attempt.count >= CAMERA_PASSWORD_ATTEMPT_LIMIT) {
    return Math.ceil((attempt.resetAt - now) / 1000);
  }
  attempt.count += 1;
  attemptsByCamera.set(publisherId, attempt);
  return 0;
}

function clearCameraPasswordAttempts(socketId) {
  cameraPasswordAttempts.delete(socketId);
  cameraPasswordAttempts.forEach((attemptsByCamera, viewerId) => {
    attemptsByCamera.delete(socketId);
    if (attemptsByCamera.size === 0) cameraPasswordAttempts.delete(viewerId);
  });
}

function getCameraList() {
  return [...cameraPublishers.entries()].map(([id, publisher]) => ({
    id,
    name: publisher.name,
    requiresPassword: Boolean(publisher.passwordHash),
    viewerCount: cameraViewers.get(id)?.size || 0
  }));
}

function emitCameraList() {
  io.emit('camera-list', getCameraList());
}

function stopCameraPublishing(socket) {
  const publisher = cameraPublishers.get(socket.id);
  if (!publisher) return;
  cameraPublishers.delete(socket.id);
  clearCameraPasswordAttempts(socket.id);
  const viewers = cameraViewers.get(socket.id) || new Set();
  cameraViewers.delete(socket.id);
  viewers.forEach((viewerId) => {
    io.to(viewerId).emit('camera-publisher-ended', { publisherId: socket.id });
  });
  emitCameraList();
}

function stopWatchingCameras(socket) {
  let changed = false;
  cameraViewers.forEach((viewers, publisherId) => {
    if (!viewers.delete(socket.id)) return;
    changed = true;
    io.to(publisherId).emit('camera-watcher-ended', { viewerId: socket.id });
  });
  if (changed) emitCameraList();
}

function roomBotParticipants(room) {
  if (!room?.vsBot || !room.botId) return [];
  return [{ id: room.botId, name: room.botName || 'Bot', isBot: true }];
}

function scheduleBotTurn(roomId, extraDelay = 0) {
  const room = rooms.get(roomId);
  const game = gameState.get(roomId);
  clearBotTimer(roomId);
  if (!room?.vsBot || !room.botId || !game || game.winner) return;
  if (!botAi.isBotsTurn(game, room.botId)) return;

  const delay = Math.max(0, botAi.thinkDelayMs(room.botLevel) + extraDelay);
  const timer = setTimeout(() => {
    botTimers.delete(roomId);
    runBotTurn(roomId);
  }, delay);
  botTimers.set(roomId, timer);
}

function runBotTurn(roomId) {
  const room = rooms.get(roomId);
  const game = gameState.get(roomId);
  if (!room?.vsBot || !room.botId || !game || game.winner) return;
  if (!botAi.isBotsTurn(game, room.botId)) return;

  const action = botAi.chooseAction(game, room.botLevel, room.botId);
  if (!action) return;

  let acted = false;
  let continueImmediately = false;

  if (action.type === 'tictactoe') {
    acted = ticTacToe.playMove(game, room.botId, action.index);
  } else if (action.type === 'chess') {
    if (!canMakeTimedMove(roomId, game, room.botId)) return;
    acted = tryChessMove(game, room.botId, action.from, action.to, action.promo);
    if (acted) settleGameClockAfterMove(roomId, game);
  } else if (action.type === 'backgammon-roll') {
    if (!canMakeTimedMove(roomId, game, room.botId)) return;
    const previousTurn = game.currentTurn;
    acted = backgammon.rollDice(game, room.botId);
    if (acted && game.currentTurn !== previousTurn) settleGameClockAfterMove(roomId, game);
    continueImmediately = acted && botAi.isBotsTurn(game, room.botId);
  } else if (action.type === 'backgammon-move') {
    if (!canMakeTimedMove(roomId, game, room.botId)) return;
    acted = backgammon.playMove(game, room.botId, {
      from: action.from,
      to: action.to,
      die: action.die,
      dice: action.dice,
      via: action.via
    });
    if (acted) settleGameClockAfterMove(roomId, game);
    continueImmediately = acted && botAi.isBotsTurn(game, room.botId);
  } else if (action.type === 'battleship-place') {
    acted = battleship.placePlayerShips(game, room.botId, action.ships);
  } else if (action.type === 'battleship-shot') {
    acted = battleship.shoot(game, room.botId, action.index);
    continueImmediately = acted && botAi.isBotsTurn(game, room.botId);
  } else if (action.type === 'lingo') {
    acted = lingo.submitGuess(game, room.botId, action.guess);
    if (acted) scheduleLingoTurn(roomId);
  } else if (action.type === 'memory') {
    const result = memory.flipCard(game, room.botId, action.index);
    if (!result) return;
    acted = true;
    if (result === 'mismatch') {
      clearMemoryTimer(roomId);
      const mismatchTimer = setTimeout(() => {
        if (gameState.get(roomId) !== game) return;
        memory.resolveMismatch(game);
        memoryTimers.delete(roomId);
        notifyGameUpdate(roomId);
      }, memory.MISMATCH_DELAY_MS);
      memoryTimers.set(roomId, mismatchTimer);
    } else {
      continueImmediately = botAi.isBotsTurn(game, room.botId);
    }
  }

  if (!acted) return;
  notifyGameUpdate(roomId, continueImmediately ? 220 : 0);
}

function notifyGameUpdate(roomId, botExtraDelay = 0) {
  emitGameState(roomId);
  scheduleBotTurn(roomId, botExtraDelay);
}

function prepareBotSide(roomId, game) {
  const room = rooms.get(roomId);
  if (!room?.vsBot || !room.botId || !game) return;
  if (game.gameId === 'battleship' && game.phase === 'placement') {
    const ships = battleship.placeShipsRandom().ships;
    battleship.placePlayerShips(game, room.botId, ships);
  }
  scheduleBotTurn(roomId, 350);
}

function clockPlayerForTurn(game) {
  if (game.gameId === 'chess') {
    const whitePlayer = game.whitePlayer || 'player1';
    return game.currentTurn === 'w' ? whitePlayer : whitePlayer === 'player1' ? 'player2' : 'player1';
  }
  return game.currentTurn;
}

function remainingClockTime(game, player, now = Date.now()) {
  const base = game.clockRemainingMs?.[player] ?? game.clockMinutes * 60_000;
  const elapsed = game.clockRunningPlayer === player && game.clockStartedAt
    ? now - game.clockStartedAt
    : 0;
  return Math.max(0, base - elapsed);
}

function finishGameOnTime(roomId, game, loser) {
  clearGameClockTimer(roomId);
  clearBotTimer(roomId);
  game.clockRemainingMs[loser] = 0;
  game.clockRunningPlayer = null;
  game.clockStartedAt = null;
  game.endReason = 'timeout';
  if (game.gameId === 'chess') {
    const winner = loser === 'player1' ? 'player2' : 'player1';
    const whitePlayer = game.whitePlayer || 'player1';
    game.winner = winner === whitePlayer ? 'w' : 'b';
    game[winner === 'player1' ? 'score1' : 'score2'] =
      (game[winner === 'player1' ? 'score1' : 'score2'] || 0) + 1;
  } else {
    game.winner = loser === 'player1' ? 'player2' : 'player1';
    game[game.winner === 'player1' ? 'score1' : 'score2'] = (game[game.winner === 'player1' ? 'score1' : 'score2'] || 0) + 1;
    game.legalMoves = [];
  }
  emitGameState(roomId);
}

function scheduleGameClock(roomId, game) {
  clearGameClockTimer(roomId);
  if (!game.clockMinutes || game.winner || !game.clockRunningPlayer) return;
  if (!isGamePlayerConnected(game, game.clockRunningPlayer)) {
    game.clockRemainingMs[game.clockRunningPlayer] = remainingClockTime(game, game.clockRunningPlayer);
    game.clockStartedAt = null;
    return;
  }
  if (!game.clockStartedAt) game.clockStartedAt = Date.now();
  const delay = remainingClockTime(game, game.clockRunningPlayer);
  const timer = setTimeout(() => {
    if (gameState.get(roomId) !== game || game.winner) return;
    const remaining = remainingClockTime(game, game.clockRunningPlayer);
    if (remaining > 0) {
      scheduleGameClock(roomId, game);
      return;
    }
    finishGameOnTime(roomId, game, game.clockRunningPlayer);
  }, delay);
  gameClockTimers.set(roomId, timer);
}

function startGameClock(roomId, game) {
  clearGameClockTimer(roomId);
  if (!game.clockMinutes || game.winner) return;
  game.clockRemainingMs = {
    player1: game.clockRemainingMs?.player1 ?? game.clockMinutes * 60_000,
    player2: game.clockRemainingMs?.player2 ?? game.clockMinutes * 60_000
  };
  game.clockRunningPlayer = clockPlayerForTurn(game);
  game.clockStartedAt = Date.now();
  scheduleGameClock(roomId, game);
}

function canMakeTimedMove(roomId, game, socketId) {
  if (!game.clockMinutes) return true;
  const player = game.player1 === socketId ? 'player1' : game.player2 === socketId ? 'player2' : null;
  if (!player || game.clockRunningPlayer !== player) return false;
  if (remainingClockTime(game, player) <= 0) {
    finishGameOnTime(roomId, game, player);
    return false;
  }
  return true;
}

function settleGameClockAfterMove(roomId, game) {
  if (!game.clockMinutes) return;
  const mover = game.clockRunningPlayer;
  game.clockRemainingMs[mover] = remainingClockTime(game, mover);
  clearGameClockTimer(roomId);
  if (game.winner) {
    game.clockRunningPlayer = null;
    game.clockStartedAt = null;
    return;
  }
  game.clockRunningPlayer = clockPlayerForTurn(game);
  game.clockStartedAt = Date.now();
  scheduleGameClock(roomId, game);
}

function scheduleLingoTurn(roomId) {
  clearLingoTimer(roomId);
  const game = gameState.get(roomId);
  if (!game || game.gameId !== 'lingo' || game.winner || !game.player1 || !game.player2) return;
  if (!isGamePlayerConnected(game, game.currentTurn)) {
    if (game.turnDeadline) game.pausedTurnMs = Math.max(0, game.turnDeadline - Date.now());
    game.turnDeadline = null;
    return;
  }
  if (game.pausedTurnMs !== undefined) {
    game.turnDeadline = Date.now() + game.pausedTurnMs;
    delete game.pausedTurnMs;
  }
  const delay = Math.max(0, game.turnDeadline - Date.now());
  const timer = setTimeout(() => {
    if (gameState.get(roomId) !== game || game.winner) return;
    if (game.turnDeadline > Date.now()) {
      scheduleLingoTurn(roomId);
      return;
    }
    advanceLingoTurn(roomId, true);
  }, delay);
  lingoTimers.set(roomId, timer);
}

function advanceLingoTurn(roomId, timedOut = false) {
  const game = gameState.get(roomId);
  if (!lingo.advanceTurn(game, timedOut)) return;
  notifyGameUpdate(roomId);
  scheduleLingoTurn(roomId);
}

function emitGameState(roomId) {
  const game = gameState.get(roomId);
  if (!game) return;
  const payload = game.gameId === 'chess'
    ? publicChessState(game)
    : game.gameId === 'lingo' ? lingo.publicState(game)
      : game.gameId === 'memory' ? memory.publicState(game)
        : game.gameId === 'backgammon' ? backgammon.publicState(game) : { ...game };
  io.to(roomId).emit('game-state', payload);
}

function getTableList() {
  return [...rooms.entries()]
    .filter(([, room]) => room.isTable && room.users.size > 0 && !room.vsBot)
    .map(([roomId, room]) => ({
      roomId,
      gameId: room.gameId,
      wordLength: room.wordLength,
      boardSize: room.boardSize,
      timeMinutes: room.timeMinutes || 0,
      hostName: io.sockets.sockets.get(room.userOrder[0])?.displayName || 'Oyuncu',
      opponentName: room.userOrder[1]
        ? io.sockets.sockets.get(room.userOrder[1])?.displayName || 'Oyuncu'
        : null,
      playerCount: room.users.size,
      status: room.users.size > 1 ? 'playing' : 'waiting'
    }));
}

function emitTableList() {
  io.emit('table-list', getTableList());
}

function addSocketToRoom(socket, roomId, room) {
  room.users.add(socket.id);
  room.userOrder.push(socket.id);
  socket.roomId = roomId;
  socket.join(roomId);
  const resumeToken = createRoomResumeSession(socket, roomId);

  socket.to(roomId).emit('user-joined', { id: socket.id, name: socket.displayName });
  const otherUsers = [
    ...room.userOrder
      .filter(id => id !== socket.id && io.sockets.sockets.has(id))
      .map(id => ({ id, name: io.sockets.sockets.get(id)?.displayName || 'Oyuncu' })),
    ...roomBotParticipants(room)
  ];
  socket.emit('room-users', otherUsers);
  return resumeToken;
}

function removeSocketFromRoom(socket) {
  const roomId = socket.roomId;
  if (!roomId) return;
  invalidateRoomResumeSession(socket);
  const room = rooms.get(roomId);

  socket.to(roomId).emit('user-left', socket.id);
  socket.leave(roomId);
  socket.roomId = null;

  if (room) {
    room.users.delete(socket.id);
    room.userOrder = room.userOrder.filter(id => id !== socket.id);
    if (room.users.size === 0 || room.vsBot) {
      clearRoomTimers(roomId);
      rooms.delete(roomId);
      gameState.delete(roomId);
    } else if (room.isTable) {
      clearRoomTimers(roomId);
      const hostId = room.userOrder[0];
      room.pendingGame = {
        gameId: room.gameId,
        wordLength: room.wordLength,
        boardSize: room.boardSize,
        timeMinutes: room.timeMinutes,
        player1: hostId,
        playerName: io.sockets.sockets.get(hostId)?.displayName || 'Oyuncu'
      };
      gameState.delete(roomId);
      delete room.pendingResetFrom;
      io.to(roomId).emit('game-pending', room.pendingGame);
    } else {
      const game = gameState.get(roomId);
      if (game && (game.player1 === socket.id || game.player2 === socket.id)) {
        clearRoomTimers(roomId);
        gameState.set(roomId, createGameById(game.gameId, {
          wordLength: game.wordLength,
          boardSize: game.boardSize,
          timeMinutes: game.clockMinutes
        }));
        delete room.pendingGame;
        io.to(roomId).emit('game-pending-cleared');
        emitGameState(roomId);
      } else if (room.pendingGame?.player1 === socket.id) {
        delete room.pendingGame;
        io.to(roomId).emit('game-pending-cleared');
      }
    }
  }
  emitTableList();
}

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);
  socket.gameVisible = true;

  socket.on('game-visibility', (isVisible) => {
    if (typeof isVisible !== 'boolean') return;
    socket.gameVisible = isVisible;
    if (!socket.roomId) return;
    const game = gameState.get(socket.roomId);
    if (game?.gameId === 'lingo') scheduleLingoTurn(socket.roomId);
    if (game?.clockMinutes) scheduleGameClock(socket.roomId, game);
    if (game) emitGameState(socket.roomId);
  });

  socket.on('camera-list-request', () => {
    socket.emit('camera-list', getCameraList());
  });

  socket.on('camera-publish-start', async (payload) => {
    const rawName = typeof payload === 'string' ? payload : payload?.name;
    const name = typeof rawName === 'string' ? rawName.trim().slice(0, 32) : '';
    const rawPassword = payload && typeof payload === 'object' ? payload.password : undefined;
    if (!name) {
      socket.emit('camera-publish-error', 'Yayın için bir kamera adı yaz.');
      return;
    }
    if (rawPassword !== undefined &&
        (typeof rawPassword !== 'string' || rawPassword.length > 128)) {
      socket.emit('camera-publish-error', 'Şifre en fazla 128 karakter olabilir.');
      return;
    }
    if (cameraPublishers.has(socket.id) || pendingCameraPublishers.has(socket.id)) {
      socket.emit('camera-publish-error', 'Bu bağlantı zaten yayın yapıyor.');
      return;
    }
    const publishAttempt = {};
    pendingCameraPublishers.set(socket.id, publishAttempt);
    const password = rawPassword || '';
    let passwordSalt = null;
    let passwordHash = null;
    if (password) {
      passwordSalt = crypto.randomBytes(16);
      try {
        passwordHash = await hashCameraPassword(password, passwordSalt);
      } catch (error) {
        if (pendingCameraPublishers.get(socket.id) !== publishAttempt) return;
        pendingCameraPublishers.delete(socket.id);
        console.error('Kamera izleme şifresi oluşturulamadı:', error);
        socket.emit('camera-publish-error', 'Kamera şifresi ayarlanamadı. Tekrar dene.');
        return;
      }
    }
    if (pendingCameraPublishers.get(socket.id) !== publishAttempt) return;
    pendingCameraPublishers.delete(socket.id);
    if (!io.sockets.sockets.has(socket.id)) return;
    if (cameraPublishers.has(socket.id)) {
      socket.emit('camera-publish-error', 'Bu bağlantı zaten yayın yapıyor.');
      return;
    }
    cameraPublishers.set(socket.id, { name, passwordSalt, passwordHash });
    cameraViewers.set(socket.id, new Set());
    socket.emit('camera-publish-started');
    emitCameraList();
  });

  socket.on('camera-publish-stop', () => {
    pendingCameraPublishers.delete(socket.id);
    stopCameraPublishing(socket);
  });

  socket.on('camera-watch', async (payload) => {
    const publisherId = typeof payload === 'string' ? payload : payload?.publisherId;
    const password = payload && typeof payload === 'object' ? payload.password : undefined;
    let publisher = typeof publisherId === 'string' ? cameraPublishers.get(publisherId) : null;
    if (!publisher || publisherId === socket.id) {
      socket.emit('camera-watch-error', {
        publisherId,
        message: 'Bu kamera yayını artık kullanılabilir değil.'
      });
      return;
    }
    if (publisher.passwordHash) {
      const publisherAtAttempt = publisher;
      if (typeof password !== 'string' || !password) {
        socket.emit('camera-watch-password-required', {
          publisherId,
          message: 'Bu kamerayı izlemek için şifre gir.'
        });
        return;
      }
      if (password.length > 128) {
        socket.emit('camera-watch-password-required', {
          publisherId,
          message: 'Şifre hatalı. Tekrar deneyin.'
        });
        return;
      }
      const retryAfter = consumeCameraPasswordAttempt(socket.id, publisherId);
      if (retryAfter) {
        socket.emit('camera-watch-error', {
          publisherId,
          message: `Çok fazla hatalı deneme. ${retryAfter} saniye sonra tekrar dene.`
        });
        return;
      }
      let passwordHash;
      try {
        passwordHash = await hashCameraPassword(password, publisher.passwordSalt);
      } catch (error) {
        console.error('Kamera izleme şifresi doğrulanamadı:', error);
        socket.emit('camera-watch-error', {
          publisherId,
          message: 'Şifre doğrulanamadı. Biraz sonra tekrar dene.'
        });
        return;
      }
      if (!io.sockets.sockets.has(socket.id)) return;
      publisher = cameraPublishers.get(publisherId);
      if (publisher !== publisherAtAttempt) {
        socket.emit('camera-watch-error', {
          publisherId,
          message: 'Bu kamera yayını artık kullanılabilir değil.'
        });
        return;
      }
      if (!crypto.timingSafeEqual(passwordHash, publisher.passwordHash)) {
        socket.emit('camera-watch-password-required', {
          publisherId,
          message: 'Şifre yanlış. Tekrar deneyin.'
        });
        return;
      }
      const attemptsByCamera = cameraPasswordAttempts.get(socket.id);
      attemptsByCamera?.delete(publisherId);
      if (attemptsByCamera?.size === 0) cameraPasswordAttempts.delete(socket.id);
    }
    if (!io.sockets.sockets.has(socket.id)) return;
    const viewers = cameraViewers.get(publisherId);
    if (viewers.has(socket.id)) return;
    viewers.add(socket.id);
    socket.emit('camera-watch-started', { publisherId });
    io.to(publisherId).emit('camera-watch-request', {
      viewerId: socket.id,
      viewerName: socket.displayName || 'İzleyici'
    });
    emitCameraList();
  });

  socket.on('camera-unwatch', (publisherId) => {
    if (typeof publisherId !== 'string') return;
    const viewers = cameraViewers.get(publisherId);
    if (!viewers?.delete(socket.id)) return;
    io.to(publisherId).emit('camera-watcher-ended', { viewerId: socket.id });
    emitCameraList();
  });

  socket.on('camera-signal-offer', (payload) => {
    const to = payload?.to;
    const offer = payload?.offer;
    if (typeof to !== 'string' || !offer || typeof offer.type !== 'string' ||
        typeof offer.sdp !== 'string' || !cameraViewers.get(socket.id)?.has(to)) return;
    io.to(to).emit('camera-signal-offer', { from: socket.id, offer });
  });

  socket.on('camera-signal-answer', (payload) => {
    const to = payload?.to;
    const answer = payload?.answer;
    if (typeof to !== 'string' || !answer || typeof answer.type !== 'string' ||
        typeof answer.sdp !== 'string' || !cameraViewers.get(to)?.has(socket.id)) return;
    io.to(to).emit('camera-signal-answer', { from: socket.id, answer });
  });

  socket.on('camera-signal-ice', (payload) => {
    const to = payload?.to;
    const candidate = payload?.candidate;
    if (typeof to !== 'string' || !candidate || typeof candidate.candidate !== 'string') return;
    const isPublisherToViewer = cameraViewers.get(socket.id)?.has(to);
    const isViewerToPublisher = cameraPublishers.has(to) &&
      cameraViewers.get(to)?.has(socket.id);
    if (!isPublisherToViewer && !isViewerToPublisher) return;
    io.to(to).emit('camera-signal-ice', { from: socket.id, candidate });
  });

  socket.on('resume-room', (rawToken) => {
    if (typeof rawToken !== 'string') {
      socket.emit('room-resume-failed');
      return;
    }

    const session = roomResumeSessions.get(rawToken);
    const room = session && rooms.get(session.roomId);
    if (!session || !room || !room.users.has(session.socketId) ||
        (session.socketId !== socket.id && io.sockets.sockets.has(session.socketId))) {
      if (session?.timer) clearTimeout(session.timer);
      roomResumeSessions.delete(rawToken);
      socket.emit('room-resume-failed');
      return;
    }

    if (session.timer) clearTimeout(session.timer);
    const previousSocketId = session.socketId;
    const roomId = session.roomId;
    const previousSocket = session.socket;
    if (previousSocketId !== socket.id) {
      room.users.delete(previousSocketId);
      room.users.add(socket.id);
      room.userOrder = room.userOrder.map((id) => id === previousSocketId ? socket.id : id);
      const game = gameState.get(roomId);
      if (game?.player1 === previousSocketId) game.player1 = socket.id;
      if (game?.player2 === previousSocketId) game.player2 = socket.id;
      if (room.pendingGame?.player1 === previousSocketId) room.pendingGame.player1 = socket.id;
      if (previousSocket) previousSocket.roomId = null;
    }

    socket.displayName = session.displayName;
    socket.roomId = roomId;
    socket.roomResumeToken = rawToken;
    session.socketId = socket.id;
    session.socket = socket;
    session.timer = null;
    socket.join(roomId);
    const game = gameState.get(roomId);
    if (game?.gameId === 'lingo') scheduleLingoTurn(roomId);
    if (game?.clockMinutes) scheduleGameClock(roomId, game);

    socket.to(roomId).emit('user-joined', { id: socket.id, name: socket.displayName });
    const otherUsers = [
      ...room.userOrder
        .filter((id) => id !== socket.id && io.sockets.sockets.has(id))
        .map((id) => ({ id, name: io.sockets.sockets.get(id)?.displayName || 'Oyuncu' })),
      ...roomBotParticipants(room)
    ];
    socket.emit('room-resumed', {
      roomId,
      gameId: room.gameId,
      vsBot: room.vsBot,
      botName: room.botName,
      displayName: session.displayName,
      resumeToken: rawToken
    });
    socket.emit('room-users', otherUsers);
    if (room.pendingGame) socket.emit('game-pending', room.pendingGame);
    emitGameState(roomId);
    emitTableList();
  });

  socket.on('lobby-join', (rawName) => {
    if (socket.roomId) {
      socket.emit('lobby-error', 'Önce bulunduğun masadan ayrıl.');
      return;
    }
    const name = typeof rawName === 'string' ? rawName.trim().slice(0, 24) : '';
    if (!name) {
      socket.emit('lobby-error', 'Lütfen bir isim yaz.');
      return;
    }
    const normalizedName = name.toLocaleLowerCase('tr-TR');
    const nameInUse = [...io.sockets.sockets.entries()].some(([socketId, connectedSocket]) =>
      socketId !== socket.id &&
      connectedSocket.displayName?.toLocaleLowerCase('tr-TR') === normalizedName
    );
    if (nameInUse) {
      socket.emit('lobby-error', 'Bu kullanıcı adı kullanımda. Lütfen başka bir isim seç.');
      return;
    }
    socket.displayName = name;
    socket.emit('lobby-ready', { name });
    socket.emit('table-list', getTableList());
  });

  socket.on('table-create', (selection) => {
    if (!socket.displayName) {
      socket.emit('table-error', 'Önce adını girip lobiye katıl.');
      return;
    }
    if (socket.roomId) {
      socket.emit('table-error', 'Yeni masa açmadan önce bulunduğun masadan ayrıl.');
      return;
    }
    const gameId = typeof selection === 'string' ? selection : selection?.gameId;
    const requestedLength = selection && typeof selection === 'object' ? Number(selection.wordLength) : 5;
    const wordLength = [4, 5, 6, 7, 8].includes(requestedLength) ? requestedLength : 5;
    const requestedBoardSize = selection && typeof selection === 'object' ? selection.boardSize : '4x5';
    const boardSize = ['4x5', '5x6'].includes(requestedBoardSize) ? requestedBoardSize : '4x5';
    const requestedTime = selection && typeof selection === 'object' ? Number(selection.timeMinutes) : 0;
    const timeMinutes = ['chess', 'backgammon'].includes(gameId) && [0, 5, 10, 15].includes(requestedTime)
      ? requestedTime
      : 0;
    const vsBot = !!(selection && typeof selection === 'object' && selection.vsBot);
    const botLevel = botAi.clampLevel(selection && typeof selection === 'object' ? selection.botLevel : 5);
    if (!['tictactoe', 'battleship', 'chess', 'backgammon', 'lingo', 'memory'].includes(gameId)) {
      socket.emit('table-error', 'Bu oyun türü kullanılamıyor.');
      return;
    }

    let roomId;
    do {
      roomId = `table-${crypto.randomBytes(4).toString('hex')}`;
    } while (rooms.has(roomId));
    const room = {
      isTable: true,
      gameId,
      wordLength,
      boardSize,
      timeMinutes,
      vsBot,
      botLevel: vsBot ? botLevel : null,
      botId: vsBot ? botAi.makeBotId(roomId) : null,
      botName: vsBot ? botAi.botDisplayName(botLevel) : null,
      users: new Set(),
      userOrder: [],
      pendingGame: vsBot
        ? null
        : { gameId, wordLength, boardSize, timeMinutes, player1: socket.id, playerName: socket.displayName }
    };
    rooms.set(roomId, room);
    const resumeToken = addSocketToRoom(socket, roomId, room);
    socket.emit('table-joined', { roomId, gameId, vsBot, botLevel: room.botLevel, botName: room.botName, resumeToken });

    if (vsBot) {
      const game = createGameById(gameId, { wordLength, boardSize, timeMinutes });
      game.player1 = socket.id;
      game.player2 = room.botId;
      gameState.set(roomId, game);
      startGameClock(roomId, game);
      if (game.gameId === 'lingo') scheduleLingoTurn(roomId);
      io.to(roomId).emit('game-pending-cleared');
      prepareBotSide(roomId, game);
      notifyGameUpdate(roomId);
    } else {
      io.to(roomId).emit('game-pending', room.pendingGame);
    }
    emitTableList();
  });

  socket.on('table-join', (roomId) => {
    if (!socket.displayName) {
      socket.emit('table-error', 'Önce adını girip lobiye katıl.');
      return;
    }
    if (socket.roomId) {
      socket.emit('table-error', 'Önce bulunduğun masadan ayrıl.');
      return;
    }
    const room = rooms.get(roomId);
    if (!room?.isTable || room.vsBot || !room.pendingGame || room.users.size !== 1) {
      socket.emit('table-error', 'Bu masa artık açık değil. Lütfen başka bir masa seç.');
      emitTableList();
      return;
    }

    const { gameId, player1 } = room.pendingGame;
    const resumeToken = addSocketToRoom(socket, roomId, room);
    delete room.pendingGame;
    const game = createGameById(gameId, {
      wordLength: room.wordLength,
      boardSize: room.boardSize,
      timeMinutes: room.timeMinutes
    });
    game.player1 = player1;
    game.player2 = socket.id;
    gameState.set(roomId, game);
    startGameClock(roomId, game);
    if (game.gameId === 'lingo') scheduleLingoTurn(roomId);

    socket.emit('table-joined', { roomId, gameId, resumeToken });
    io.to(roomId).emit('game-pending-cleared');
    emitGameState(roomId);
    emitTableList();
  });

  socket.on('join-room', (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set(), userOrder: [] });
    }
    const room = rooms.get(roomId);
    room.users.add(socket.id);
    if (!room.userOrder.includes(socket.id)) room.userOrder.push(socket.id);
    socket.roomId = roomId;
    socket.join(roomId);

    if (!gameState.has(roomId)) gameState.set(roomId, ticTacToe.getInitialState());

    socket.to(roomId).emit('user-joined', { id: socket.id, name: socket.displayName || 'Oyuncu' });

    const otherUsers = [...room.users]
      .filter(id => id !== socket.id)
      .map(id => ({ id, name: io.sockets.sockets.get(id)?.displayName || 'Oyuncu' }));
    socket.emit('room-users', otherUsers);

    const game = gameState.get(roomId);
    if (game?.player1 && game?.player2) {
      socket.emit('game-state', game.gameId === 'chess'
        ? publicChessState(game)
        : game.gameId === 'lingo' ? lingo.publicState(game)
          : game.gameId === 'memory' ? memory.publicState(game)
            : game.gameId === 'backgammon' ? backgammon.publicState(game) : game);
    }
    if (room.pendingGame) {
      io.to(roomId).emit('game-pending', room.pendingGame);
    }

    console.log(`${socket.id} odaya katıldı: ${roomId}`);
  });

  socket.on('offer', ({ to, offer }) => {
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('game-select', (selection) => {
    const gameId = typeof selection === 'string' ? selection : selection?.gameId;
    const requestedLength = selection && typeof selection === 'object' ? Number(selection.wordLength) : 5;
    const wordLength = [4, 5, 6, 7, 8].includes(requestedLength) ? requestedLength : 5;
    const requestedBoardSize = selection && typeof selection === 'object' ? selection.boardSize : '4x5';
    const boardSize = ['4x5', '5x6'].includes(requestedBoardSize) ? requestedBoardSize : '4x5';
    const requestedTime = selection && typeof selection === 'object' ? Number(selection.timeMinutes) : 0;
    const timeMinutes = ['chess', 'backgammon'].includes(gameId) && [0, 5, 10, 15].includes(requestedTime)
      ? requestedTime
      : 0;
    if (!socket.roomId || !gameId) return;
    if (!['tictactoe', 'battleship', 'chess', 'backgammon', 'lingo', 'memory'].includes(gameId)) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room || (game?.player1 && game?.player2)) return;
    if (room.pendingGame && room.pendingGame.player1 !== socket.id) return;
    room.wordLength = wordLength;
    room.boardSize = boardSize;
    room.timeMinutes = timeMinutes;
    room.pendingGame = { gameId, wordLength, boardSize, timeMinutes, player1: socket.id };
    io.to(socket.roomId).emit('game-pending', room.pendingGame);
  });

  socket.on('game-join', (gameId) => {
    if (!socket.roomId || !gameId) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room?.pendingGame || room.pendingGame.gameId !== gameId) return;
    if (room.pendingGame.player1 === socket.id) return;
    const { player1, wordLength, boardSize, timeMinutes } = room.pendingGame;
    delete room.pendingGame;
    room.timeMinutes = timeMinutes || 0;
    const g = createGameById(gameId, { wordLength, boardSize, timeMinutes });
    g.player1 = player1;
    g.player2 = socket.id;
    if (gameId === 'battleship') g.phase = 'placement';
    gameState.set(socket.roomId, g);
    startGameClock(socket.roomId, g);
    if (g.gameId === 'lingo') scheduleLingoTurn(socket.roomId);
    io.to(socket.roomId).emit('game-pending-cleared');
    emitGameState(socket.roomId);
  });

  socket.on('game-cancel', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room?.pendingGame || room.pendingGame.player1 !== socket.id) return;
    delete room.pendingGame;
    io.to(socket.roomId).emit('game-pending-cleared');
  });

  socket.on('game-move', (index) => {
    index = parseInt(index, 10);
    if (!socket.roomId || isNaN(index)) return;
    const game = gameState.get(socket.roomId);
    if (!ticTacToe.playMove(game, socket.id, index)) return;
    notifyGameUpdate(socket.roomId);
  });

  socket.on('game-chess-move', (data) => {
    if (!socket.roomId || !data) return;
    const game = gameState.get(socket.roomId);
    if (!canMakeTimedMove(socket.roomId, game, socket.id)) return;
    if (!tryChessMove(game, socket.id, data.from, data.to, data.promo)) return;
    settleGameClockAfterMove(socket.roomId, game);
    notifyGameUpdate(socket.roomId);
  });

  socket.on('game-backgammon-roll', () => {
    if (!socket.roomId) return;
    const game = gameState.get(socket.roomId);
    if (!canMakeTimedMove(socket.roomId, game, socket.id)) return;
    const previousTurn = game?.currentTurn;
    if (!backgammon.rollDice(game, socket.id)) return;
    if (game.currentTurn !== previousTurn) settleGameClockAfterMove(socket.roomId, game);
    notifyGameUpdate(socket.roomId);
  });

  socket.on('game-backgammon-move', (selection) => {
    if (!socket.roomId) return;
    const game = gameState.get(socket.roomId);
    if (!canMakeTimedMove(socket.roomId, game, socket.id)) return;
    if (!backgammon.playMove(game, socket.id, selection)) return;
    settleGameClockAfterMove(socket.roomId, game);
    notifyGameUpdate(socket.roomId);
  });

  socket.on('game-backgammon-undo', () => {
    if (!socket.roomId) return;
    const game = gameState.get(socket.roomId);
    if (!game || game.gameId !== 'backgammon' || !game.undoState ||
        game.undoState.playerId !== socket.id) return;
    if (game.clockMinutes && game.clockRunningPlayer &&
        remainingClockTime(game, game.clockRunningPlayer) <= 0) {
      finishGameOnTime(socket.roomId, game, game.clockRunningPlayer);
      return;
    }
    const wasWinner = !!game.winner;
    if (!backgammon.undoMove(game, socket.id)) return;
    if (game.clockMinutes) {
      if (wasWinner) startGameClock(socket.roomId, game);
      else settleGameClockAfterMove(socket.roomId, game);
    }
    notifyGameUpdate(socket.roomId);
  });

  socket.on('game-ships-place', (ships) => {
    if (!socket.roomId || !Array.isArray(ships)) return;
    const game = gameState.get(socket.roomId);
    if (!battleship.placePlayerShips(game, socket.id, ships)) return;
    notifyGameUpdate(socket.roomId);
  });

  socket.on('game-shot', (rawIndex) => {
    const index = parseInt(rawIndex, 10);
    if (!socket.roomId || isNaN(index)) return;
    const game = gameState.get(socket.roomId);
    if (!battleship.shoot(game, socket.id, index)) return;
    notifyGameUpdate(socket.roomId);
  });

  socket.on('game-lingo-guess', (rawGuess) => {
    if (!socket.roomId || typeof rawGuess !== 'string') return;
    const game = gameState.get(socket.roomId);
    if (!lingo.submitGuess(game, socket.id, rawGuess)) return;
    notifyGameUpdate(socket.roomId);
    scheduleLingoTurn(socket.roomId);
  });

  socket.on('game-memory-flip', (rawIndex) => {
    const index = Number(rawIndex);
    if (!socket.roomId || !Number.isInteger(index)) return;
    const game = gameState.get(socket.roomId);
    const result = memory.flipCard(game, socket.id, index);
    if (!result) return;
    notifyGameUpdate(socket.roomId);
    if (result === 'mismatch') {
      const roomId = socket.roomId;
      clearMemoryTimer(roomId);
      const timer = setTimeout(() => {
        if (gameState.get(roomId) !== game) return;
        memory.resolveMismatch(game);
        memoryTimers.delete(roomId);
        notifyGameUpdate(roomId);
      }, memory.MISMATCH_DELAY_MS);
      memoryTimers.set(roomId, timer);
    }
  });

  const resetGameInRoom = (roomId) => {
    const prev = gameState.get(roomId);
    const room = rooms.get(roomId);
    const startingPlayer = prev?.startingPlayer === 'player2' ? 'player1' : 'player2';
    clearMemoryTimer(roomId);
    clearGameClockTimer(roomId);
    clearBotTimer(roomId);
    const g = createGameById(prev?.gameId, {
      keepScores: true,
      previous: prev,
      forcePlacement: true,
      wordLength: prev?.wordLength,
      boardSize: prev?.boardSize,
      timeMinutes: prev?.clockMinutes,
      startingPlayer
    });
    g.player1 = prev?.player1 ?? null;
    g.player2 = prev?.player2 ?? null;
    gameState.set(roomId, g);
    startGameClock(roomId, g);
    if (g.gameId === 'lingo') scheduleLingoTurn(roomId);
    if (room?.vsBot) prepareBotSide(roomId, g);
    notifyGameUpdate(roomId);
  };

  socket.on('game-reset-request', () => {
    if (!socket.roomId) return;
    const game = gameState.get(socket.roomId);
    const room = rooms.get(socket.roomId);
    if (!game || !room || (game.player1 !== socket.id && game.player2 !== socket.id)) return;
    if (!game.player2 || room.vsBot || botAi.isBotId(game.player1) || botAi.isBotId(game.player2)) {
      resetGameInRoom(socket.roomId);
      return;
    }
    if (room.pendingResetFrom) return;
    const opponent = game.player1 === socket.id ? game.player2 : game.player1;
    room.pendingResetFrom = socket.id;
    socket.to(opponent).emit('game-reset-request');
  });

  socket.on('game-reset-accept', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room?.pendingResetFrom || !game) return;
    const requester = room.pendingResetFrom;
    if (game.player1 !== socket.id && game.player2 !== socket.id) return;
    if (requester !== game.player1 && requester !== game.player2) return;
    delete room.pendingResetFrom;
    resetGameInRoom(socket.roomId);
    socket.to(requester).emit('game-reset-accepted');
  });

  socket.on('game-reset-reject', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room?.pendingResetFrom) return;
    const requester = room.pendingResetFrom;
    delete room.pendingResetFrom;
    socket.to(requester).emit('game-reset-rejected');
  });

  socket.on('chat-message', (message) => {
    if (socket.roomId && typeof message === 'string' && message.trim()) {
      io.to(socket.roomId).emit('chat-message', {
        from: socket.id,
        message: message.trim().slice(0, 500)
      });
    }
  });

  socket.on('video-off', () => {
    if (socket.roomId) socket.to(socket.roomId).emit('peer-video-off', { userId: socket.id });
  });
  socket.on('video-on', () => {
    if (socket.roomId) socket.to(socket.roomId).emit('peer-video-on', { userId: socket.id });
  });

  socket.on('leave-room', () => {
    removeSocketFromRoom(socket);
  });

  socket.on('disconnect', (reason) => {
    pendingCameraPublishers.delete(socket.id);
    stopCameraPublishing(socket);
    stopWatchingCameras(socket);
    clearCameraPasswordAttempts(socket.id);
    const token = socket.roomResumeToken;
    const session = token && roomResumeSessions.get(token);
    if (socket.roomId && session) {
      socket.to(socket.roomId).emit('user-left', socket.id);
      const game = gameState.get(socket.roomId);
      if (game?.gameId === 'lingo') scheduleLingoTurn(socket.roomId);
      if (game?.clockMinutes) scheduleGameClock(socket.roomId, game);
      emitGameState(socket.roomId);
      session.timer = setTimeout(() => {
        if (roomResumeSessions.get(token) !== session) return;
        roomResumeSessions.delete(token);
        session.socket.roomResumeToken = null;
        removeSocketFromRoom(session.socket);
      }, ROOM_RESUME_GRACE_MS);
      console.log(`Kullanıcı bağlantısı kesildi (${reason}); oda ${ROOM_RESUME_GRACE_MS / 60000} dakika korunacak:`, socket.id);
      return;
    }
    removeSocketFromRoom(socket);
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
const protocol = server instanceof https.Server ? 'https' : 'http';
server.listen(PORT, () => {
  console.log(`Video Konferans sunucusu çalışıyor: ${protocol}://localhost:${PORT}`);
});
