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

// Statik dosyalar (ön yüz)
app.use(express.static(CLIENT_DIR));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// Oda bilgileri: { roomId: { users: Set<string>, userOrder: string[] } }
const rooms = new Map();

// Oyun durumu: { roomId: { board, currentTurn, winner, player1, player2 } }
const gameState = new Map();
const lingoTimers = new Map();
const memoryTimers = new Map();

function createGameById(gameId, {
  keepScores = false,
  previous,
  forcePlacement = false,
  wordLength = 5,
  boardSize = '4x5',
  startingPlayer = 'player1'
} = {}) {
  if (gameId === 'battleship') return battleship.getInitialState(keepScores, previous, forcePlacement, startingPlayer);
  if (gameId === 'chess') return getInitialChessState(keepScores, previous, startingPlayer);
  if (gameId === 'lingo') return lingo.getInitialState(wordLength, keepScores, previous, startingPlayer);
  if (gameId === 'memory') return memory.getInitialState(boardSize, keepScores, previous, startingPlayer);
  return ticTacToe.getInitialState(keepScores, previous, startingPlayer);
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

function scheduleLingoTurn(roomId) {
  clearLingoTimer(roomId);
  const game = gameState.get(roomId);
  if (!game || game.gameId !== 'lingo' || game.winner || !game.player1 || !game.player2) return;
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
  emitGameState(roomId);
  scheduleLingoTurn(roomId);
}

function emitGameState(roomId) {
  const game = gameState.get(roomId);
  if (!game) return;
  const payload = game.gameId === 'chess'
    ? publicChessState(game)
    : game.gameId === 'lingo' ? lingo.publicState(game)
      : game.gameId === 'memory' ? memory.publicState(game) : { ...game };
  io.to(roomId).emit('game-state', payload);
}

function getTableList() {
  return [...rooms.entries()]
    .filter(([, room]) => room.isTable && room.users.size > 0)
    .map(([roomId, room]) => ({
      roomId,
      gameId: room.gameId,
      wordLength: room.wordLength,
      boardSize: room.boardSize,
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

  socket.to(roomId).emit('user-joined', { id: socket.id, name: socket.displayName });
  const otherUsers = room.userOrder
    .filter(id => id !== socket.id)
    .map(id => ({ id, name: io.sockets.sockets.get(id)?.displayName || 'Oyuncu' }));
  socket.emit('room-users', otherUsers);
}

function removeSocketFromRoom(socket) {
  const roomId = socket.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);

  socket.to(roomId).emit('user-left', socket.id);
  socket.leave(roomId);
  socket.roomId = null;

  if (room) {
    room.users.delete(socket.id);
    room.userOrder = room.userOrder.filter(id => id !== socket.id);
    if (room.users.size === 0) {
      clearLingoTimer(roomId);
      clearMemoryTimer(roomId);
      rooms.delete(roomId);
      gameState.delete(roomId);
    } else if (room.isTable) {
      clearLingoTimer(roomId);
      clearMemoryTimer(roomId);
      const hostId = room.userOrder[0];
      room.pendingGame = {
        gameId: room.gameId,
        player1: hostId,
        playerName: io.sockets.sockets.get(hostId)?.displayName || 'Oyuncu'
      };
      gameState.delete(roomId);
      delete room.pendingResetFrom;
      io.to(roomId).emit('game-pending', room.pendingGame);
    } else {
      const game = gameState.get(roomId);
      if (game && (game.player1 === socket.id || game.player2 === socket.id)) {
        clearLingoTimer(roomId);
        clearMemoryTimer(roomId);
        gameState.set(roomId, createGameById(game.gameId, {
          wordLength: game.wordLength,
          boardSize: game.boardSize
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
    const wordLength = [4, 5, 6].includes(requestedLength) ? requestedLength : 5;
    const requestedBoardSize = selection && typeof selection === 'object' ? selection.boardSize : '4x5';
    const boardSize = ['4x5', '5x6'].includes(requestedBoardSize) ? requestedBoardSize : '4x5';
    if (!['tictactoe', 'battleship', 'chess', 'lingo', 'memory'].includes(gameId)) {
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
      users: new Set(),
      userOrder: [],
      pendingGame: { gameId, wordLength, boardSize, player1: socket.id, playerName: socket.displayName }
    };
    rooms.set(roomId, room);
    addSocketToRoom(socket, roomId, room);
    socket.emit('table-joined', { roomId, gameId });
    io.to(roomId).emit('game-pending', room.pendingGame);
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
    if (!room?.isTable || !room.pendingGame || room.users.size !== 1) {
      socket.emit('table-error', 'Bu masa artık açık değil. Lütfen başka bir masa seç.');
      emitTableList();
      return;
    }

    const { gameId, player1 } = room.pendingGame;
    addSocketToRoom(socket, roomId, room);
    delete room.pendingGame;
    const game = createGameById(gameId, {
      wordLength: room.wordLength,
      boardSize: room.boardSize
    });
    game.player1 = player1;
    game.player2 = socket.id;
    gameState.set(roomId, game);
    if (game.gameId === 'lingo') scheduleLingoTurn(roomId);

    socket.emit('table-joined', { roomId, gameId });
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
          : game.gameId === 'memory' ? memory.publicState(game) : game);
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
    const wordLength = [4, 5, 6].includes(requestedLength) ? requestedLength : 5;
    const requestedBoardSize = selection && typeof selection === 'object' ? selection.boardSize : '4x5';
    const boardSize = ['4x5', '5x6'].includes(requestedBoardSize) ? requestedBoardSize : '4x5';
    if (!socket.roomId || !gameId) return;
    if (!['tictactoe', 'battleship', 'chess', 'lingo', 'memory'].includes(gameId)) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room || (game?.player1 && game?.player2)) return;
    if (room.pendingGame && room.pendingGame.player1 !== socket.id) return;
    room.pendingGame = { gameId, wordLength, boardSize, player1: socket.id };
    io.to(socket.roomId).emit('game-pending', room.pendingGame);
  });

  socket.on('game-join', (gameId) => {
    if (!socket.roomId || !gameId) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room?.pendingGame || room.pendingGame.gameId !== gameId) return;
    if (room.pendingGame.player1 === socket.id) return;
    const { player1, wordLength, boardSize } = room.pendingGame;
    delete room.pendingGame;
    const g = createGameById(gameId, { wordLength, boardSize });
    g.player1 = player1;
    g.player2 = socket.id;
    if (gameId === 'battleship') g.phase = 'placement';
    gameState.set(socket.roomId, g);
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
    io.to(socket.roomId).emit('game-state', { ...game });
  });

  socket.on('game-chess-move', (data) => {
    if (!socket.roomId || !data) return;
    const game = gameState.get(socket.roomId);
    if (!tryChessMove(game, socket.id, data.from, data.to, data.promo)) return;
    emitGameState(socket.roomId);
  });

  socket.on('game-ships-place', (ships) => {
    if (!socket.roomId || !Array.isArray(ships)) return;
    const game = gameState.get(socket.roomId);
    if (!battleship.placePlayerShips(game, socket.id, ships)) return;
    io.to(socket.roomId).emit('game-state', { ...game });
  });

  socket.on('game-shot', (rawIndex) => {
    const index = parseInt(rawIndex, 10);
    if (!socket.roomId || isNaN(index)) return;
    const game = gameState.get(socket.roomId);
    if (!battleship.shoot(game, socket.id, index)) return;
    io.to(socket.roomId).emit('game-state', { ...game });
  });

  socket.on('game-lingo-guess', (rawGuess) => {
    if (!socket.roomId || typeof rawGuess !== 'string') return;
    const game = gameState.get(socket.roomId);
    if (!lingo.submitGuess(game, socket.id, rawGuess)) return;
    emitGameState(socket.roomId);
    scheduleLingoTurn(socket.roomId);
  });

  socket.on('game-memory-flip', (rawIndex) => {
    const index = Number(rawIndex);
    if (!socket.roomId || !Number.isInteger(index)) return;
    const game = gameState.get(socket.roomId);
    const result = memory.flipCard(game, socket.id, index);
    if (!result) return;
    emitGameState(socket.roomId);
    if (result === 'mismatch') {
      const roomId = socket.roomId;
      clearMemoryTimer(roomId);
      const timer = setTimeout(() => {
        if (gameState.get(roomId) !== game) return;
        memory.resolveMismatch(game);
        memoryTimers.delete(roomId);
        emitGameState(roomId);
      }, memory.MISMATCH_DELAY_MS);
      memoryTimers.set(roomId, timer);
    }
  });

  const resetGameInRoom = (roomId) => {
    const prev = gameState.get(roomId);
    const startingPlayer = prev?.startingPlayer === 'player2' ? 'player1' : 'player2';
    clearMemoryTimer(roomId);
    const g = createGameById(prev?.gameId, {
      keepScores: true,
      previous: prev,
      forcePlacement: true,
      wordLength: prev?.wordLength,
      boardSize: prev?.boardSize,
      startingPlayer
    });
    g.player1 = prev?.player1 ?? null;
    g.player2 = prev?.player2 ?? null;
    gameState.set(roomId, g);
    emitGameState(roomId);
    if (g.gameId === 'lingo') scheduleLingoTurn(roomId);
  };

  socket.on('game-reset-request', () => {
    if (!socket.roomId) return;
    const game = gameState.get(socket.roomId);
    const room = rooms.get(socket.roomId);
    if (!game || !room || (game.player1 !== socket.id && game.player2 !== socket.id)) return;
    if (!game.player2) {
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

  socket.on('disconnect', () => {
    removeSocketFromRoom(socket);
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
const protocol = server instanceof https.Server ? 'https' : 'http';
server.listen(PORT, () => {
  console.log(`Video Konferans sunucusu çalışıyor: ${protocol}://localhost:${PORT}`);
});
