/**
 * Video Konferans - Signaling Server
 * WebRTC bağlantıları için SDP ve ICE candidate alışverişini yönetir
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Oda bilgileri: { roomId: { users: Set<string>, userOrder: string[] } }
const rooms = new Map();

// Oyun durumu: { roomId: { board, currentTurn, winner, player1, player2 } }
const gameState = new Map();

const BATTLE_SIZE = 8;
const BATTLE_SHIPS = [4, 3, 2, 2];

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

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  // Odaya katıl
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

    socket.to(roomId).emit('user-joined', socket.id);

    const otherUsers = [...room.users].filter(id => id !== socket.id);
    socket.emit('room-users', otherUsers);

    // Mevcut oyun/pending durumunu gönder
    const game = gameState.get(roomId);
    if (game?.player1 && game?.player2) {
      socket.emit('game-state', game);
    }
    if (room.pendingGame) {
      io.to(roomId).emit('game-pending', room.pendingGame);
    }

    console.log(`${socket.id} odaya katıldı: ${roomId}`);
  });

  // WebRTC sinyalleri
  socket.on('offer', ({ to, offer }) => {
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Oyun kataloğu – seçen 1. oyuncu, katılan 2. oyuncu
  socket.on('game-select', (gameId) => {
    if (!socket.roomId || !gameId) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room || (game?.player1 && game?.player2)) return;
    if (room.pendingGame && room.pendingGame.player1 !== socket.id) return;
    room.pendingGame = { gameId, player1: socket.id };
    io.to(socket.roomId).emit('game-pending', room.pendingGame);
  });

  socket.on('game-join', (gameId) => {
    if (!socket.roomId || !gameId) return;
    const room = rooms.get(socket.roomId);
    const game = gameState.get(socket.roomId);
    if (!room?.pendingGame || room.pendingGame.gameId !== gameId) return;
    if (room.pendingGame.player1 === socket.id) return;
    const player1 = room.pendingGame.player1;
    delete room.pendingGame;
    if (gameId === 'battleship') {
      gameState.set(socket.roomId, getInitialBattleshipState());
      const g = gameState.get(socket.roomId);
      g.player1 = player1;
      g.player2 = socket.id;
      g.phase = 'placement';
    } else {
      gameState.set(socket.roomId, getInitialGameState());
      const g = gameState.get(socket.roomId);
      g.player1 = player1;
      g.player2 = socket.id;
    }
    io.to(socket.roomId).emit('game-pending-cleared');
    io.to(socket.roomId).emit('game-state', gameState.get(socket.roomId));
  });

  socket.on('game-cancel', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room?.pendingGame || room.pendingGame.player1 !== socket.id) return;
    delete room.pendingGame;
    io.to(socket.roomId).emit('game-pending-cleared');
  });

  // TicTacToe hamle
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

  const resetGameInRoom = (roomId) => {
    const prev = gameState.get(roomId);
    const g = prev?.gameId === 'battleship'
      ? getInitialBattleshipState(true, prev, true)
      : getInitialGameState(true, prev);
    g.player1 = prev?.player1 ?? null;
    g.player2 = prev?.player2 ?? null;
    gameState.set(roomId, g);
    io.to(roomId).emit('game-state', g);
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

  // Sohbet mesajı
  socket.on('chat-message', (message) => {
    if (socket.roomId && typeof message === 'string' && message.trim()) {
      io.to(socket.roomId).emit('chat-message', {
        from: socket.id,
        message: message.trim().slice(0, 500)
      });
    }
  });

  // Odadan ayrıl (buton ile)
  socket.on('leave-room', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user-left', socket.id);
      const room = rooms.get(socket.roomId);
      if (room) {
        room.users.delete(socket.id);
        room.userOrder = room.userOrder.filter(id => id !== socket.id);
        if (room.users.size === 0) {
          rooms.delete(socket.roomId);
          gameState.delete(socket.roomId);
        } else {
          const game = gameState.get(socket.roomId);
          if (game && (game.player1 === socket.id || game.player2 === socket.id)) {
            const fresh = game.gameId === 'battleship' ? getInitialBattleshipState() : getInitialGameState();
            gameState.set(socket.roomId, fresh);
            delete room.pendingGame;
            io.to(socket.roomId).emit('game-pending-cleared');
            io.to(socket.roomId).emit('game-state', gameState.get(socket.roomId));
          } else if (room.pendingGame?.player1 === socket.id) {
            delete room.pendingGame;
            io.to(socket.roomId).emit('game-pending-cleared');
          }
        }
      }
      socket.roomId = null;
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user-left', socket.id);
      const room = rooms.get(socket.roomId);
      if (room) {
        room.users.delete(socket.id);
        room.userOrder = room.userOrder.filter(id => id !== socket.id);
        if (room.users.size === 0) {
          rooms.delete(socket.roomId);
          gameState.delete(socket.roomId);
        } else {
          const game = gameState.get(socket.roomId);
          if (game && (game.player1 === socket.id || game.player2 === socket.id)) {
            const fresh = game.gameId === 'battleship' ? getInitialBattleshipState() : getInitialGameState();
            gameState.set(socket.roomId, fresh);
            delete room.pendingGame;
            io.to(socket.roomId).emit('game-pending-cleared');
            io.to(socket.roomId).emit('game-state', gameState.get(socket.roomId));
          } else if (room.pendingGame?.player1 === socket.id) {
            delete room.pendingGame;
            io.to(socket.roomId).emit('game-pending-cleared');
          }
        }
      }
    }
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Video Konferans sunucusu çalışıyor: http://localhost:${PORT}`);
});
