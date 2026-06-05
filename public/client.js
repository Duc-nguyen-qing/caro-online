let socket;
let currentToken;
let currentUsername;
let currentRoom = null;
let mySymbol = null;
let gameActive = false;
let boardElement;
let roomCurrentTurn = null;
let currentBoardState = Array(225).fill(null);

// Sections
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const menuSection = document.getElementById('menu-section');
const gameSection = document.getElementById('game-section');
const resultModal = document.getElementById('resultModal');

// Forms
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// Messages
const loginMessage = document.getElementById('loginMessage');
const registerMessage = document.getElementById('registerMessage');

// Navigation
document.getElementById('goToRegister').addEventListener('click', (e) => {
  e.preventDefault();
  showSection(registerSection);
});

document.getElementById('goToLogin').addEventListener('click', (e) => {
  e.preventDefault();
  showSection(loginSection);
});

function showSection(section) {
  [loginSection, registerSection, menuSection, gameSection].forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active-section');
  });
  section.style.display = 'flex';
  section.classList.add('active-section');
}

// Đăng nhập
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) return;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      currentToken = data.token;
      currentUsername = data.username;
      connectSocket();
    } else {
      loginMessage.textContent = data.error;
      loginMessage.className = 'message';
    }
  } catch (err) {
    loginMessage.textContent = 'Lỗi kết nối máy chủ';
    loginMessage.className = 'message';
  }
});

// Đăng ký
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirmPassword').value;

  if (!username || !password || !confirmPassword) {
    registerMessage.textContent = 'Vui lòng điền đầy đủ thông tin';
    registerMessage.className = 'message';
    return;
  }
  if (password !== confirmPassword) {
    registerMessage.textContent = 'Mật khẩu xác nhận không khớp';
    registerMessage.className = 'message';
    return;
  }
  if (password.length < 3) {
    registerMessage.textContent = 'Mật khẩu phải có ít nhất 3 ký tự';
    registerMessage.className = 'message';
    return;
  }
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      registerMessage.textContent = data.message || 'Đăng ký thành công!';
      registerMessage.className = 'message success';
      registerForm.reset();
      setTimeout(() => {
        showSection(loginSection);
        registerMessage.textContent = '';
        loginMessage.textContent = 'Đăng ký thành công! Hãy đăng nhập.';
        loginMessage.className = 'message success';
      }, 1200);
    } else {
      registerMessage.textContent = data.error;
      registerMessage.className = 'message';
    }
  } catch (err) {
    registerMessage.textContent = 'Lỗi kết nối máy chủ';
    registerMessage.className = 'message';
  }
});

function connectSocket() {
  socket = io({ auth: { token: currentToken } });

  socket.on('connect', () => {
    console.log('Socket connected');
    showSection(menuSection);
    document.getElementById('displayUsername').textContent = currentUsername;
  });

  socket.on('connect_error', (err) => {
    loginMessage.textContent = 'Lỗi xác thực socket';
    loginMessage.className = 'message';
    console.error(err);
  });

  socket.on('error', (msg) => alert(msg));

  // Menu buttons
  document.getElementById('createRoomBtn').addEventListener('click', () => {
    socket.emit('createRoom');
  });

  document.getElementById('joinRoomBtn').addEventListener('click', () => {
    document.getElementById('joinRoomInput').style.display = 'flex';
    document.getElementById('joinRoomInput').style.flexDirection = 'column';
  });

  document.getElementById('joinRoomSubmit').addEventListener('click', () => {
    const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();
    if (roomId) socket.emit('joinRoom', roomId);
  });

  // Room created
  socket.on('roomCreated', ({ roomId, symbol }) => {
    mySymbol = symbol;
    currentRoom = roomId;
    showGameSection(roomId, symbol);
    document.getElementById('startGameBtn').style.display = 'inline-block';
    document.getElementById('gameMessage').textContent = 'Đang chờ người chơi khác...';
    document.getElementById('gameMessage').style.color = '#ffd200';
  });

  // Room joined
  socket.on('roomJoined', ({ roomId, symbol }) => {
    mySymbol = symbol;
    currentRoom = roomId;
    showGameSection(roomId, symbol);
    document.getElementById('startGameBtn').style.display = 'inline-block';
    document.getElementById('gameMessage').textContent = 'Đang chờ chủ phòng bắt đầu...';
    document.getElementById('gameMessage').style.color = '#ffd200';
  });

  // Player joined
  socket.on('playerJoined', ({ players }) => {
    updatePlayers(players);
    document.getElementById('gameMessage').textContent = 'Đã đủ người, sẵn sàng bắt đầu!';
    document.getElementById('gameMessage').style.color = '#51cf66';
  });

  // Start game
  document.getElementById('startGameBtn').addEventListener('click', () => {
    socket.emit('startGame');
  });

  socket.on('gameStarted', ({ board, currentTurn, players }) => {
    gameActive = true;
    roomCurrentTurn = currentTurn;
    document.getElementById('startGameBtn').style.display = 'none';
    updatePlayers(players);
    drawBoard(board);
    updateTurnIndicator(currentTurn);
    document.getElementById('gameMessage').textContent = '';
  });

  // Move made
  socket.on('moveMade', ({ board, currentTurn }) => {
    roomCurrentTurn = currentTurn;
    drawBoard(board);
    updateTurnIndicator(currentTurn);
  });

  // Game over
  socket.on('gameOver', ({ winner, winnerUsername, board, lastMove, reason }) => {
    gameActive = false;
    roomCurrentTurn = null;
    drawBoard(board);
    if (lastMove) {
      const cells = document.querySelectorAll('.cell');
      if (cells[lastMove.index]) {
        cells[lastMove.index].style.boxShadow = '0 0 12px gold';
      }
    }
    if (winner === 'draw') {
      showResult('HÒA!', '🤝', '#ffd200');
    } else {
      const isWinner = winner === mySymbol;
      const msg = isWinner ? 'BẠN ĐÃ CHIẾN THẮNG!' : 'BẠN ĐÃ THUA CUỘC!';
      const icon = isWinner ? '🏆' : '😢';
      const color = isWinner ? '#51cf66' : '#e74c3c';
      showResult(msg, icon, color);
    }
  });

  // Player left
  socket.on('playerLeft', ({ username }) => {
    document.getElementById('gameMessage').textContent = `${username} đã rời phòng`;
    document.getElementById('gameMessage').style.color = '#ff6b6b';
    if (gameActive) {
      gameActive = false;
      roomCurrentTurn = null;
      drawBoard(currentBoardState);
    }
  });
}

function showGameSection(roomId, symbol) {
  showSection(gameSection);
  document.getElementById('roomIdDisplay').textContent = roomId;
  boardElement = null;
  const emptyBoard = Array(225).fill(null);
  currentBoardState = emptyBoard;
  drawBoard(emptyBoard);
  document.getElementById('startGameBtn').style.display = 'inline-block';
  document.getElementById('gameMessage').textContent = 'Đang chờ đối thủ...';
  document.getElementById('gameMessage').style.color = '#ffd200';
}

function updatePlayers(players) {
  const playerX = players.find(p => p.symbol === 'X');
  const playerO = players.find(p => p.symbol === 'O');
  document.getElementById('playerXName').textContent = playerX ? playerX.username : '-';
  document.getElementById('playerOName').textContent = playerO ? playerO.username : '-';
}

function updateTurnIndicator(currentTurn) {
  const indicator = document.getElementById('turnIndicator');
  if (!gameActive || !currentTurn) {
    indicator.textContent = '---';
    indicator.style.background = 'rgba(255,255,255,0.1)';
    return;
  }
  if (currentTurn === mySymbol) {
    indicator.textContent = '🔥 Lượt của bạn';
    indicator.style.background = 'rgba(247, 151, 30, 0.3)';
    indicator.style.border = '1px solid rgba(247, 151, 30, 0.5)';
  } else {
    indicator.textContent = '⏳ Lượt đối thủ';
    indicator.style.background = 'rgba(255,255,255,0.12)';
    indicator.style.border = '1px solid rgba(255,255,255,0.15)';
  }
}

function drawBoard(boardArray) {
  currentBoardState = boardArray;
  const container = document.getElementById('board-container');
  if (!container) return;
  if (!boardElement) {
    boardElement = document.createElement('div');
    boardElement.className = 'board';
    container.innerHTML = '';
    container.appendChild(boardElement);
  }
  boardElement.innerHTML = '';
  boardArray.forEach((cell, index) => {
    const cellDiv = document.createElement('div');
    cellDiv.className = 'cell';
    if (cell === 'X') cellDiv.classList.add('X');
    if (cell === 'O') cellDiv.classList.add('O');
    cellDiv.textContent = cell || '';
    cellDiv.dataset.index = index;
    if (!gameActive || cell !== null || mySymbol !== roomCurrentTurn) {
      cellDiv.classList.add('locked');
    }
    cellDiv.addEventListener('click', () => onCellClick(index, cell));
    boardElement.appendChild(cellDiv);
  });
}

function onCellClick(index, currentValue) {
  if (!gameActive || currentValue !== null) return;
  if (mySymbol !== roomCurrentTurn) {
    return;
  }
  socket.emit('makeMove', { index });
}

function showResult(message, icon, color) {
  resultModal.style.display = 'flex';
  document.getElementById('resultText').textContent = message;
  document.getElementById('resultText').style.color = color;
  document.getElementById('modalIcon').textContent = icon;
  document.getElementById('backToMenuBtn').onclick = () => {
    resultModal.style.display = 'none';
    leaveRoom();
    showSection(menuSection);
  };
}

function leaveRoom() {
  if (socket && currentRoom) {
    socket.emit('leaveRoom', currentRoom);
  }
  currentRoom = null;
  gameActive = false;
  mySymbol = null;
  roomCurrentTurn = null;
  boardElement = null;
  currentBoardState = Array(225).fill(null);
}