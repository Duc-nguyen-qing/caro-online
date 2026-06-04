const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Phục vụ file tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Lưu trữ tạm người dùng và phòng
const users = new Map(); // token -> { username, passwordHash, socketId }
const tokens = new Map(); // username -> token
const rooms = new Map();  // roomId -> { players, board, currentTurn, gameStarted, winner }

// Tạo token ngẫu nhiên
function generateToken() {
  return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

// API đăng ký
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.trim().length === 0 || password.length < 3) {
    return res.status(400).json({ error: 'Tên và mật khẩu (ít nhất 3 ký tự) không được để trống' });
  }
  if (tokens.has(username)) {
    return res.status(400).json({ error: 'Tên đã tồn tại' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const token = generateToken();
    tokens.set(username, token);
    users.set(token, { username, passwordHash: hashedPassword, socketId: null });
    res.json({ token, username });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// API đăng nhập
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Thiếu tên hoặc mật khẩu' });
  }
  const token = tokens.get(username);
  if (!token || !users.has(token)) {
    return res.status(400).json({ error: 'Tài khoản không tồn tại' });
  }
  const user = users.get(token);
  try {
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: 'Sai mật khẩu' });
    }
    res.json({ token, username });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// Middleware xác thực socket qua token
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token && users.has(token)) {
    const user = users.get(token);
    socket.username = user.username;
    user.socketId = socket.id;
    next();
  } else {
    next(new Error('Xác thực thất bại'));
  }
});

io.on('connection', (socket) => {
  console.log(`${socket.username} đã kết nối`);

  // Tạo phòng mới
  socket.on('createRoom', () => {
    const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
    rooms.set(roomId, {
      players: [{ socketId: socket.id, username: socket.username, symbol: 'X' }],
      board: Array(225).fill(null),
      currentTurn: 'X',
      gameStarted: false,
      winner: null
    });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomCreated', { roomId, symbol: 'X' });
    console.log(`${socket.username} tạo phòng ${roomId}`);
  });

  // Gia nhập phòng
  socket.on('joinRoom', (roomId) => {
    if (!rooms.has(roomId)) {
      socket.emit('error', 'Phòng không tồn tại');
      return;
    }
    const room = rooms.get(roomId);
    if (room.players.length >= 2) {
      socket.emit('error', 'Phòng đã đầy');
      return;
    }
    // Thêm người chơi với quân O
    room.players.push({ socketId: socket.id, username: socket.username, symbol: 'O' });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomJoined', { roomId, symbol: 'O' });
    io.to(roomId).emit('playerJoined', {
      players: room.players.map(p => ({ username: p.username, symbol: p.symbol }))
    });
    console.log(`${socket.username} tham gia phòng ${roomId}`);
  });

  // Bắt đầu trận đấu
  socket.on('startGame', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    if (room.players.length < 2) {
      socket.emit('error', 'Cần 2 người chơi để bắt đầu');
      return;
    }
    if (room.gameStarted) {
      socket.emit('error', 'Trận đấu đã bắt đầu');
      return;
    }
    room.gameStarted = true;
    io.to(roomId).emit('gameStarted', {
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players.map(p => ({ username: p.username, symbol: p.symbol }))
    });
  });

  // Nhận nước đi
  socket.on('makeMove', (data) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    if (!room.gameStarted || room.winner) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.symbol !== room.currentTurn) {
      socket.emit('error', 'Không phải lượt của bạn');
      return;
    }
    const index = data.index;
    if (index < 0 || index >= 225 || room.board[index] !== null) {
      socket.emit('error', 'Nước đi không hợp lệ');
      return;
    }
    // Cập nhật bàn cờ
    room.board[index] = player.symbol;
    const row = Math.floor(index / 15);
    const col = index % 15;
    if (checkWin(room.board, row, col, player.symbol)) {
      room.winner = player.symbol;
      io.to(roomId).emit('gameOver', {
        winner: player.symbol,
        winnerUsername: player.username,
        board: room.board,
        lastMove: { index, symbol: player.symbol }
      });
      return;
    }
    // Kiểm tra hòa
    if (room.board.every(cell => cell !== null)) {
      io.to(roomId).emit('gameOver', {
        winner: 'draw',
        board: room.board,
        lastMove: { index, symbol: player.symbol }
      });
      room.winner = 'draw';
      return;
    }
    // Đổi lượt
    room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';
    io.to(roomId).emit('moveMade', {
      index,
      symbol: player.symbol,
      currentTurn: room.currentTurn,
      board: room.board
    });
  });

  // Xử lý ngắt kết nối
  socket.on('disconnect', () => {
    console.log(`${socket.username} ngắt kết nối`);
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.players = room.players.filter(p => p.socketId !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('playerLeft', { username: socket.username });
        if (room.gameStarted && !room.winner) {
          const remaining = room.players[0];
          room.winner = remaining.symbol;
          io.to(roomId).emit('gameOver', {
            winner: remaining.symbol,
            winnerUsername: remaining.username,
            reason: 'Đối thủ đã thoát',
            board: room.board
          });
        }
      }
    }
    // Cập nhật socketId trong user
    const userEntry = [...users.entries()].find(([_, u]) => u.username === socket.username);
    if (userEntry) userEntry[1].socketId = null;
  });
});

// Hàm kiểm tra thắng (5 quân liên tiếp)
function checkWin(board, row, col, symbol) {
  const size = 15;
  const directions = [
    [0, 1],  // ngang
    [1, 0],  // dọc
    [1, 1],  // chéo xuôi
    [1, -1]  // chéo ngược
  ];
  for (const [dx, dy] of directions) {
    let count = 1;
    for (let step = 1; step < 5; step++) {
      const r = row + dx * step;
      const c = col + dy * step;
      if (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === symbol) {
        count++;
      } else break;
    }
    for (let step = 1; step < 5; step++) {
      const r = row - dx * step;
      const c = col - dy * step;
      if (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === symbol) {
        count++;
      } else break;
    }
    if (count >= 5) return true;
  }
  return false;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
});