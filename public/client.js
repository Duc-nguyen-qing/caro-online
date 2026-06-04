let socket;
let currentToken;
let currentUsername;
let currentRoom = null;
let mySymbol = null;
let gameActive = false;
let boardElement;
let roomCurrentTurn = null;
let currentBoardState = Array(225).fill(null);

// Auth elements
const authSection = document.getElementById('auth-section');
const menuSection = document.getElementById('menu-section');
const gameSection = document.getElementById('game-section');
const resultModal = document.getElementById('resultModal');
const authForm = document.getElementById('authForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const authMessage = document.getElementById('authMessage');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
let authMode = 'login';

loginTab.addEventListener('click', () => {
  authMode = 'login';
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
  document.getElementById('submitAuth').textContent = 'Đăng nhập';
});

registerTab.addEventListener('click', () => {
  authMode = 'register';
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
  document.getElementById('submitAuth').textContent = 'Đăng ký';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) return;
  const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
  try {
    const res = await fetch(endpoint, {
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
      authMessage.textContent = data.error;
    }
  } catch (err) {
    authMessage.textContent = 'Lỗi kết nối máy chủ';
  }
});

function connectSocket() {
  socket = io({ auth: { token: currentToken } });

  socket.on('connect', () => {
    console.log('Socket connected');
    showMenu();
  });

  socket.on('connect_error', (err) => {
    authMessage.textContent = 'Lỗi xác thực socket';
    console.error(err);
  });

  socket.on('error', (msg) => alert(msg));

  // Menu buttons
  document.getElementById('createRoomBtn').addEventListener('click', () => {
    socket.emit('createRoom');
  });

  document.getElementById('joinRoomBtn').addEventListener('click', () => {
    document.getElementById('joinRoomInput').style.display = 'block';
  });

  document.getElementById('joinRoomSubmit').addEventListener('click', () => {
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (roomId) socket.emit('joinRoom', roomId);
  });

  // Room created
  socket.on('roomCreated', ({ roomId, symbol }) => {
    mySymbol = symbol;
    currentRoom = roomId;
    showGameSection(roomId, symbol);
    document.getElementById('startGameBtn').style.display = 'block';
    document.getElementById('gameMessage').textContent = 'Chờ người chơi khác...';
  });

  // Room joined
  socket.on('roomJoined', ({ roomId, symbol }) => {
    mySymbol = symbol;
    currentRoom = roomId;
    showGameSection(roomId, symbol);
    document.getElementById('startGameBtn').style.display = 'block';
    document.getElementById('gameMessage').textContent = 'Chờ chủ phòng bắt đầu...';
  });

  // Player joined
  socket.on('playerJoined', ({ players }) => {
    updatePlayers(players);
    document.getElementById('gameMessage').textContent = 'Đủ người, sẵn sàng bắt đầu!';
  });

  // Start game button
  document.getElementById('startGameBtn').addEventListener('click', () => {
    socket.emit('startGame');
  });

  // Game started
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
  socket.on('gameOver', ({ winner, winnerUsername, board, lastMove }) => {
    gameActive = false;
    roomCurrentTurn = null;
    drawBoard(board);
    if (lastMove) {
      const cells = document.querySelectorAll('.cell');
      if (cells[lastMove.index]) {
        cells[lastMove.index].style.boxShadow = '0 0 10px gold';
      }
    }
    if (winner === 'draw') {
      showResult('HÒA!');
    } else {
      const winMsg = winner === mySymbol ? 'BẠN ĐÃ CHIẾN THẮNG!' : 'BẠN ĐÃ THUA CUỘC!';
      const color = winner === mySymbol ? '#2ecc71' : '#e74c3c';
      showResult(winMsg, color);
    }
  });

  // Player left
  socket.on('playerLeft', ({ username }) => {
    document.getElementById('gameMessage').textContent = `${username} đã rời phòng`;
    if (gameActive) {
      gameActive = false;
      roomCurrentTurn = null;
      drawBoard(currentBoardState);
    }
  });
}

function showMenu() {
  authSection.style.display = 'none';
  menuSection.style.display = 'flex';
  gameSection.style.display = 'none';
  document.getElementById('displayUsername').textContent = currentUsername;
}

function showGameSection(roomId, symbol) {
  menuSection.style.display = 'none';
  gameSection.style.display = 'flex';
  document.getElementById('roomIdDisplay').textContent = `Phòng: ${roomId}`;
  // Reset bàn cờ trống
  boardElement = null;
  const emptyBoard = Array(225).fill(null);
  currentBoardState = emptyBoard;
  drawBoard(emptyBoard);
  document.getElementById('startGameBtn').style.display = 'block';
  document.getElementById('gameMessage').textContent = 'Chờ đối thủ...';
}

function updatePlayers(players) {
  const playerX = players.find(p => p.symbol === 'X');
  const playerO = players.find(p => p.symbol === 'O');
  document.getElementById('playerXName').textContent = playerX ? `X: ${playerX.username}` : 'X: -';
  document.getElementById('playerOName').textContent = playerO ? `O: ${playerO.username}` : 'O: -';
}

function updateTurnIndicator(currentTurn) {
  const indicator = document.getElementById('turnIndicator');
  if (!gameActive || !currentTurn) {
    indicator.textContent = '';
    return;
  }
  if (currentTurn === mySymbol) {
    indicator.textContent = 'Lượt của bạn';
    indicator.style.background = 'rgba(255, 215, 0, 0.3)';
  } else {
    indicator.textContent = 'Lượt đối thủ';
    indicator.style.background = 'rgba(255,255,255,0.2)';
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
    alert('Chưa đến lượt bạn');
    return;
  }
  socket.emit('makeMove', { index });
}

function showResult(message, color) {
  resultModal.style.display = 'flex';
  document.getElementById('resultText').textContent = message;
  document.getElementById('resultText').style.color = color || '#333';
  document.getElementById('backToMenuBtn').onclick = () => {
    resultModal.style.display = 'none';
    leaveRoom();
    showMenu();
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