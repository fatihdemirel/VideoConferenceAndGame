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
const { getInitialChessState, publicChessState, tryChessMove } = require('./chess');

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

const BATTLE_SIZE = 8;
const BATTLE_SHIPS = [4, 3, 2, 2];
const LINGO_TURN_MS = 30_000;
const LINGO_MAX_GUESSES = 6;
const LINGO_WORDS = {
  4: [
    'masa', 'kedi', 'kale', 'sarı', 'evet', 'para', 'okul', 'hava', 'kalp', 'elma',
    'kapı', 'saat', 'dert', 'gece', 'renk', 'köşe', 'dost', 'kötü', 'yeni', 'eski',
    'açık', 'mavi', 'ödev', 'ders', 'film', 'oyun', 'aile', 'anne', 'baba', 'isim',
    'kutu', 'kafa', 'ayak', 'ince', 'ufak', 'uzun', 'kısa', 'sert', 'aynı', 'tane',
    'adet', 'yazı', 'kira', 'ucuz', 'paha', 'borç', 'kart', 'orta', 'özel', 'araç',
    'evde', 'evim', 'sonu', 'yine', 'biri', 'daha'
  ],
  5: [
    'kalem', 'kitap', 'deniz', 'çiçek', 'üzgün', 'güzel', 'araba', 'dünya', 'insan', 'çocuk',
    'kadın', 'erkek', 'şehir', 'hafta', 'sabah', 'akşam', 'bugün', 'yarın', 'güneş', 'meyve',
    'bulut', 'şarkı', 'müzik', 'yemek', 'ekmek', 'kahve', 'tatlı', 'armut', 'kiraz', 'limon',
    'biber', 'soğan', 'sokak', 'cadde', 'sahil', 'orman', 'bahçe', 'çimen', 'çanta', 'ekran',
    'mesaj', 'cevap', 'fikir', 'zaman', 'hayat', 'sevgi', 'kavga', 'mutlu', 'hasta', 'sıcak',
    'soğuk', 'küçük', 'büyük', 'beyaz', 'siyah', 'hızlı', 'yavaş', 'doğru', 'temiz', 'rahat',
    'kolay', 'yakın', 'geniş', 'güçlü', 'canlı', 'yaşlı', 'yarım', 'başka', 'bütün', 'kadar',
    'çünkü', 'belki', 'hemen', 'düşün', 'güven', 'kendi', 'hepsi', 'seçim', 'işler', 'buluş',
    'şimdi', 'sonra', 'hangi', 'neden', 'böyle', 'şöyle', 'sabır', 'sevda', 'tatil', 'bilet',
    'banka', 'hesap', 'dolap', 'duvar', 'tavan', 'tabak', 'bıçak', 'kaşık', 'perde'
  ],
  6: [
    'bardak', 'bayrak', 'kaptan', 'fındık', 'ananas', 'mevsim', 'toprak', 'bakkal', 'zeytin', 'balkon',
    'mutfak', 'merkez', 'yanlış', 'önemli', 'ülkede', 'bahçem', 'şurada', 'burada', 'dışarı', 'kaleci',
    'futbol', 'doktor', 'okulda', 'evinde', 'sağlık', 'geçmiş', 'gazete', 'hikâye', 'eğitim', 'kazanç',
    'başarı', 'gerçek', 'toplum', 'devlet', 'millet', 'başkan', 'miktar', 'derece', 'rüzgar', 'hayvan',
    'tavşan', 'trafik', 'karpuz', 'insanı', 'günlük', 'çantam', 'kapıya', 'yarına', 'kışlık', 'gözlük',
    'bahane', 'yağmur', 'koltuk', 'defter', 'yorgun', 'sessiz', 'akıllı', 'renkli', 'sürücü', 'dolmuş',
    'otobüs', 'çekici', 'yardım', 'sorunu', 'konusu', 'varlık', 'kuralı', 'aralık', 'üretim', 'durumu',
    'kişiye', 'parası', 'işleri', 'gözler', 'elleri', 'sözlük', 'makine', 'kamera', 'resmen', 'sistem',
    'bölümü', 'zengin'
  ]
};

function normalizeLingoWord(value) {
  return value.toLocaleUpperCase('tr-TR');
}

function getInitialLingoState(wordLength = 5, keepScores = false, prev) {
  const answers = LINGO_WORDS[wordLength] || LINGO_WORDS[5];
  const answer = normalizeLingoWord(answers[Math.floor(Math.random() * answers.length)]);
  return {
    gameId: 'lingo',
    wordLength,
    answer,
    guesses: [],
    currentTurn: 'player1',
    turnDeadline: Date.now() + LINGO_TURN_MS,
    winner: null,
    player1: keepScores && prev ? prev.player1 : null,
    player2: keepScores && prev ? prev.player2 : null,
    score1: keepScores && prev ? (prev.score1 || 0) : 0,
    score2: keepScores && prev ? (prev.score2 || 0) : 0
  };
}

function getInitialGameState(keepScores = false, prev) {
  return {
    gameId: 'tictactoe',
    board: Array(9).fill(null),
    currentTurn: 'X',
    winner: null,
    player1: keepScores && prev ? prev.player1 : null,
    player2: keepScores && prev ? prev.player2 : null,
    score1: keepScores && prev ? (prev.score1 || 0) : 0,
    score2: keepScores && prev ? (prev.score2 || 0) : 0
  };
}

function placeShipsRandom() {
  const grid = Array(BATTLE_SIZE * BATTLE_SIZE).fill(0);
  const ships = [];
  for (const len of BATTLE_SHIPS) {
    let placed = false;
    for (let attempt = 0; attempt < 100 && !placed; attempt++) {
      const horizontal = Math.random() < 0.5;
      const maxRow = horizontal ? BATTLE_SIZE : BATTLE_SIZE - len;
      const maxCol = horizontal ? BATTLE_SIZE - len : BATTLE_SIZE;
      if (maxRow <= 0 || maxCol <= 0) continue;
      const row = Math.floor(Math.random() * maxRow);
      const col = Math.floor(Math.random() * maxCol);
      const cells = [];
      let ok = true;
      for (let i = 0; i < len; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;
        const idx = r * BATTLE_SIZE + c;
        if (grid[idx]) { ok = false; break; }
        cells.push(idx);
      }
      if (ok) {
        cells.forEach(idx => { grid[idx] = 1; });
        ships.push(cells);
        placed = true;
      }
    }
  }
  return { grid, ships };
}

function validateShips(ships) {
  if (!Array.isArray(ships) || ships.length !== BATTLE_SHIPS.length) return false;
  const sorted = [...BATTLE_SHIPS].sort((a,b)=>b-a);
  const placed = ships.map(s => Array.isArray(s) ? s.length : 0).sort((a,b)=>b-a);
  if (JSON.stringify(sorted) !== JSON.stringify(placed)) return false;
  const grid = Array(BATTLE_SIZE * BATTLE_SIZE).fill(0);
  for (const ship of ships) {
    const idxs = ship.map(i => parseInt(i, 10)).filter(i => !isNaN(i) && i >= 0 && i < BATTLE_SIZE * BATTLE_SIZE);
    if (idxs.length !== ship.length) return false;
    const rows = idxs.map(i => Math.floor(i / BATTLE_SIZE));
    const cols = idxs.map(i => i % BATTLE_SIZE);
    const minR = Math.min(...rows), maxR = Math.max(...rows);
    const minC = Math.min(...cols), maxC = Math.max(...cols);
    const isLine = (maxR - minR === idxs.length - 1 && minC === maxC) || (maxC - minC === idxs.length - 1 && minR === maxR);
    if (!isLine) return false;
    for (const idx of idxs) {
      if (grid[idx]) return false;
      grid[idx] = 1;
    }
  }
  return true;
}

function shipsToGrid(ships) {
  const grid = Array(BATTLE_SIZE * BATTLE_SIZE).fill(0);
  for (const ship of ships) {
    for (const idx of ship) grid[idx] = 1;
  }
  return grid;
}

function getInitialBattleshipState(keepScores = false, prev, forcePlacement = false) {
  const usePlacement = forcePlacement || !keepScores || !prev?.ships1;
  return {
    gameId: 'battleship',
    player1: keepScores && prev ? prev.player1 : null,
    player2: keepScores && prev ? prev.player2 : null,
    phase: usePlacement ? 'placement' : 'battle',
    grid1: usePlacement ? null : prev?.grid1,
    grid2: usePlacement ? null : prev?.grid2,
    ships1: usePlacement ? null : prev?.ships1,
    ships2: usePlacement ? null : prev?.ships2,
    shots1: [], shots2: [],
    currentTurn: 'player1',
    winner: null,
    score1: keepScores && prev ? (prev.score1 || 0) : 0,
    score2: keepScores && prev ? (prev.score2 || 0) : 0
  };
}

function checkWinner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.includes(null) ? null : 'draw';
}

function createGameById(gameId, keepScores = false, prev, forcePlacement = false, wordLength = 5) {
  if (gameId === 'battleship') return getInitialBattleshipState(keepScores, prev, forcePlacement);
  if (gameId === 'chess') return getInitialChessState(keepScores, prev);
  if (gameId === 'lingo') return getInitialLingoState(wordLength, keepScores, prev);
  return getInitialGameState(keepScores, prev);
}

function publicLingoState(game) {
  const { answer, ...state } = game;
  return { ...state, answer: game.winner ? answer : null };
}

function clearLingoTimer(roomId) {
  const timer = lingoTimers.get(roomId);
  if (timer) clearTimeout(timer);
  lingoTimers.delete(roomId);
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
  if (!game || game.gameId !== 'lingo' || game.winner) return;
  if (timedOut) game.guesses.push({ player: game.currentTurn, guess: '', feedback: [], timedOut: true });
  if (game.guesses.length >= LINGO_MAX_GUESSES) {
    game.winner = 'draw';
    game.turnDeadline = null;
  } else {
    game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
    game.turnDeadline = Date.now() + LINGO_TURN_MS;
  }
  emitGameState(roomId);
  scheduleLingoTurn(roomId);
}

function emitGameState(roomId) {
  const game = gameState.get(roomId);
  if (!game) return;
  const payload = game.gameId === 'chess'
    ? publicChessState(game)
    : game.gameId === 'lingo' ? publicLingoState(game) : { ...game };
  io.to(roomId).emit('game-state', payload);
}

function getTableList() {
  return [...rooms.entries()]
    .filter(([, room]) => room.isTable && room.users.size > 0)
    .map(([roomId, room]) => ({
      roomId,
      gameId: room.gameId,
      wordLength: room.wordLength,
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
      rooms.delete(roomId);
      gameState.delete(roomId);
    } else if (room.isTable) {
      clearLingoTimer(roomId);
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
        gameState.set(roomId, createGameById(game.gameId, false, undefined, false, game.wordLength));
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
    if (!['tictactoe', 'battleship', 'chess', 'lingo'].includes(gameId)) {
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
      users: new Set(),
      userOrder: [],
      pendingGame: { gameId, wordLength, player1: socket.id, playerName: socket.displayName }
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
    const game = createGameById(gameId, false, undefined, false, room.wordLength);
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

    if (!gameState.has(roomId)) gameState.set(roomId, getInitialGameState());

    socket.to(roomId).emit('user-joined', { id: socket.id, name: socket.displayName || 'Oyuncu' });

    const otherUsers = [...room.users]
      .filter(id => id !== socket.id)
      .map(id => ({ id, name: io.sockets.sockets.get(id)?.displayName || 'Oyuncu' }));
    socket.emit('room-users', otherUsers);

    const game = gameState.get(roomId);
    if (game?.player1 && game?.player2) {
      socket.emit('game-state', game.gameId === 'chess'
        ? publicChessState(game)
        : game.gameId === 'lingo' ? publicLingoState(game) : game);
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
    if (!socket.roomId || !gameId) return;
    if (!['tictactoe', 'battleship', 'chess', 'lingo'].includes(gameId)) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room || (game?.player1 && game?.player2)) return;
    if (room.pendingGame && room.pendingGame.player1 !== socket.id) return;
    room.pendingGame = { gameId, wordLength, player1: socket.id };
    io.to(socket.roomId).emit('game-pending', room.pendingGame);
  });

  socket.on('game-join', (gameId) => {
    if (!socket.roomId || !gameId) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room?.pendingGame || room.pendingGame.gameId !== gameId) return;
    if (room.pendingGame.player1 === socket.id) return;
    const { player1, wordLength } = room.pendingGame;
    delete room.pendingGame;
    const g = createGameById(gameId, false, undefined, false, wordLength);
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
    if (!socket.roomId || isNaN(index) || index < 0 || index > 8) return;
    const game = gameState.get(socket.roomId);
    if (!game || game.gameId !== 'tictactoe' || game.board[index] || game.winner) return;

    const mySymbol = game.player1 === socket.id ? 'X' : game.player2 === socket.id ? 'O' : null;
    if (!mySymbol || game.currentTurn !== mySymbol) return;

    game.board[index] = mySymbol;
    game.winner = checkWinner(game.board);
    game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';

    if (game.winner && game.winner !== 'draw') {
      if (game.winner === 'X') game.score1 = (game.score1 || 0) + 1;
      else game.score2 = (game.score2 || 0) + 1;
    }

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
    if (!game || game.gameId !== 'battleship' || game.phase !== 'placement') return;
    if (!validateShips(ships)) return;

    const isP1 = game.player1 === socket.id;
    const isP2 = game.player2 === socket.id;
    if (!isP1 && !isP2) return;

    if (isP1) game.ships1 = ships;
    else game.ships2 = ships;

    if (game.ships1 && game.ships2) {
      game.phase = 'battle';
      game.grid1 = shipsToGrid(game.ships1);
      game.grid2 = shipsToGrid(game.ships2);
    }
    io.to(socket.roomId).emit('game-state', { ...game });
  });

  socket.on('game-shot', (idx) => {
    idx = parseInt(idx, 10);
    if (!socket.roomId || isNaN(idx) || idx < 0 || idx >= BATTLE_SIZE * BATTLE_SIZE) return;
    const game = gameState.get(socket.roomId);
    if (!game || game.gameId !== 'battleship' || game.phase !== 'battle' || game.winner) return;

    const isP1 = game.player1 === socket.id;
    const isP2 = game.player2 === socket.id;
    if (!isP1 && !isP2) return;
    const current = game.currentTurn === 'player1' ? game.player1 : game.player2;
    if (socket.id !== current) return;

    const myShots = isP1 ? game.shots1 : game.shots2;
    if (myShots.includes(idx)) return;

    const enemyGrid = isP1 ? game.grid2 : game.grid1;
    const enemyShips = isP1 ? game.ships2 : game.ships1;
    myShots.push(idx);

    const hit = enemyGrid[idx] === 1;
    enemyGrid[idx] = hit ? 2 : 3;

    let allSunk = true;
    for (const ship of enemyShips) {
      const shipSunk = ship.every(i => enemyGrid[i] === 2);
      if (!shipSunk) allSunk = false;
    }
    if (allSunk) {
      game.winner = isP1 ? 'player1' : 'player2';
      if (game.winner === 'player1') game.score1 = (game.score1 || 0) + 1;
      else game.score2 = (game.score2 || 0) + 1;
    } else if (!hit) {
      game.currentTurn = isP1 ? 'player2' : 'player1';
    }

    io.to(socket.roomId).emit('game-state', { ...game });
  });

  socket.on('game-lingo-guess', (rawGuess) => {
    if (!socket.roomId || typeof rawGuess !== 'string') return;
    const game = gameState.get(socket.roomId);
    if (!game || game.gameId !== 'lingo' || game.winner || game.turnDeadline <= Date.now()) return;
    if (game.currentTurn === 'player1' ? game.player1 !== socket.id : game.player2 !== socket.id) return;

    const guess = normalizeLingoWord(rawGuess.trim());
    if ([...guess].length !== game.wordLength || !/^[A-ZÇĞİÖŞÜ]+$/u.test(guess)) return;
    const answerLetters = [...game.answer];
    const guessLetters = [...guess];
    const feedback = Array(game.wordLength).fill('absent');
    const remaining = new Map();

    answerLetters.forEach((letter, index) => {
      if (guessLetters[index] === letter) feedback[index] = 'correct';
      else remaining.set(letter, (remaining.get(letter) || 0) + 1);
    });
    guessLetters.forEach((letter, index) => {
      if (feedback[index] === 'correct') return;
      const count = remaining.get(letter) || 0;
      if (count > 0) {
        feedback[index] = 'present';
        remaining.set(letter, count - 1);
      }
    });

    game.guesses.push({ player: game.currentTurn, guess, feedback, timedOut: false });
    if (guess === game.answer) {
      game.winner = game.currentTurn;
      game[game.currentTurn === 'player1' ? 'score1' : 'score2'] += 1;
      game.turnDeadline = null;
    } else if (game.guesses.length >= LINGO_MAX_GUESSES) {
      game.winner = 'draw';
      game.turnDeadline = null;
    } else {
      game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
      game.turnDeadline = Date.now() + LINGO_TURN_MS;
    }
    emitGameState(socket.roomId);
    scheduleLingoTurn(socket.roomId);
  });

  const resetGameInRoom = (roomId) => {
    const prev = gameState.get(roomId);
    const g = createGameById(prev?.gameId, true, prev, true, prev?.wordLength);
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
