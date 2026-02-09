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

function getInitialGameState(keepScores = false, prev) {
  return {
    board: Array(9).fill(null),
    currentTurn: 'X',
    winner: null,
    player1: keepScores && prev ? prev.player1 : null,
    player2: keepScores && prev ? prev.player2 : null,
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

    // İlk 2 oyuncu için oyun durumu
    if (!gameState.has(roomId)) gameState.set(roomId, getInitialGameState());
    const game = gameState.get(roomId);
    const order = room.userOrder;
    if (!game.player1 && order[0]) game.player1 = order[0];
    if (!game.player2 && order[1] && order[1] !== order[0]) game.player2 = order[1];

    if (game.player1 || game.player2) {
      io.to(roomId).emit('game-state', game);
    }

    socket.to(roomId).emit('user-joined', socket.id);

    const otherUsers = [...room.users].filter(id => id !== socket.id);
    socket.emit('room-users', otherUsers);

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

  // TicTacToe hamle
  socket.on('game-move', (index) => {
    index = parseInt(index, 10);
    if (!socket.roomId || isNaN(index) || index < 0 || index > 8) return;
    const game = gameState.get(socket.roomId);
    if (!game || game.board[index] || game.winner) return;

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

  const resetGameInRoom = (roomId) => {
    const prev = gameState.get(roomId);
    gameState.set(roomId, getInitialGameState(true, prev));
    const room = rooms.get(roomId);
    const g = gameState.get(roomId);
    if (room?.userOrder?.length >= 1) {
      g.player1 = room.userOrder[0];
      if (room.userOrder[1]) g.player2 = room.userOrder[1];
    }
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
            gameState.set(socket.roomId, getInitialGameState());
            const g = gameState.get(socket.roomId);
            g.player1 = room.userOrder[0] || null;
            g.player2 = room.userOrder[1] || null;
            io.to(socket.roomId).emit('game-state', g);
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
            gameState.set(socket.roomId, getInitialGameState());
            const g = gameState.get(socket.roomId);
            g.player1 = room.userOrder[0] || null;
            g.player2 = room.userOrder[1] || null;
            io.to(socket.roomId).emit('game-state', g);
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
