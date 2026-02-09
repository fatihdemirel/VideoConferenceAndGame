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

// Oda bilgileri: { roomId: { users: Set<string> } }
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  // Odaya katıl
  socket.on('join-room', (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set() });
    }
    rooms.get(roomId).users.add(socket.id);
    socket.roomId = roomId;
    socket.join(roomId);

    // Odadaki diğer kullanıcıları bilgilendir
    socket.to(roomId).emit('user-joined', socket.id);

    // Odaya katılan kullanıcıya mevcut kullanıcıları gönder
    const room = rooms.get(roomId);
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
        if (room.users.size === 0) {
          rooms.delete(socket.roomId);
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
        if (room.users.size === 0) {
          rooms.delete(socket.roomId);
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
