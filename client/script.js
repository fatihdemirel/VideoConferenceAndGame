/**
 * Video Konferans - WebRTC Client
 */

const socket = io();
const DISPLAY_NAME_STORAGE_KEY = 'videoConference.displayName';

// DOM elementleri
const lobby = document.getElementById('lobby');
const tableLobby = document.getElementById('tableLobby');
const conference = document.getElementById('conference');
const displayNameInput = document.getElementById('displayNameInput');
const joinBtn = document.getElementById('joinBtn');
const tableList = document.getElementById('tableList');
const tableCount = document.getElementById('tableCount');
const emptyTables = document.getElementById('emptyTables');
const tableLobbyError = document.getElementById('tableLobbyError');
const lobbyError = document.getElementById('lobbyError');
const newTableWordLength = document.getElementById('newTableWordLength');
const newTableWordLengthLabel = document.getElementById('newTableWordLengthLabel');
const newTableMemorySize = document.getElementById('newTableMemorySize');
const newTableMemorySizeLabel = document.getElementById('newTableMemorySizeLabel');
const newTableClockMinutes = document.getElementById('newTableClockMinutes');
const createTableClockOptions = document.getElementById('createTableClockOptions');
const createTableBtn = document.getElementById('createTableBtn');
const openCreateTableModalBtn = document.getElementById('openCreateTableModalBtn');
const createTableModal = document.getElementById('createTableModal');
const createTableModalError = document.getElementById('createTableModalError');
const createTableOptions = document.getElementById('createTableOptions');
const lobbyUserName = document.getElementById('lobbyUserName');
const localDisplayName = document.getElementById('localDisplayName');
const localVideoLabel = document.getElementById('localVideoLabel');
const localInitial = document.getElementById('localInitial');
const roomTitle = document.getElementById('roomTitle');
const tableGameLabel = document.getElementById('tableGameLabel');
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
const connectionStatus = document.getElementById('connectionStatus');
const participantCount = document.getElementById('participantCount');
const leaveBtn = document.getElementById('leaveBtn');
const toggleMuteBtn = document.getElementById('toggleMuteBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const permissionModal = document.getElementById('permissionModal');
const permissionModalText = document.getElementById('permissionModalText');
const permissionRetryBtn = document.getElementById('permissionRetryBtn');
const permissionCloseBtn = document.getElementById('permissionCloseBtn');
const chatToggleBtn = document.getElementById('chatToggleBtn');
const chatPanel = document.getElementById('chatPanel');
const chatPanelOverlay = document.getElementById('chatPanelOverlay');
const chatCloseBtn = document.getElementById('chatCloseBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const gamePanel = document.getElementById('gamePanel');
const headerMenuBtn = document.getElementById('headerMenuBtn');
const headerMenuOverlay = document.getElementById('headerMenuOverlay');
const gameCatalog = document.getElementById('gameCatalog');
const gamePending = document.getElementById('gamePending');
const gameActive = document.getElementById('gameActive');
const gamePendingStatus = document.getElementById('gamePendingStatus');
const gameJoinBtn = document.getElementById('gameJoinBtn');
const gameCancelBtn = document.getElementById('gameCancelBtn');
const gameStatus = document.getElementById('gameStatus');
const gameBoard = document.getElementById('gameBoard');
const gameResetBtn = document.getElementById('gameResetBtn');
const gameScore = document.getElementById('gameScore');
const gameResetModal = document.getElementById('gameResetModal');
const gameActiveBattleship = document.getElementById('gameActiveBattleship');
const battleMyBoard = document.getElementById('battleMyBoard');
const battleEnemyBoard = document.getElementById('battleEnemyBoard');
const battleScore = document.getElementById('battleScore');
const battleStatus = document.getElementById('battleStatus');
const battleResetBtn = document.getElementById('battleResetBtn');
const battlePlacement = document.getElementById('battlePlacement');
const battleBoards = document.getElementById('battleBoards');
const battlePlacementBoard = document.getElementById('battlePlacementBoard');
const battlePlacementStatus = document.getElementById('battlePlacementStatus');
const battlePlacementShip = document.getElementById('battlePlacementShip');
const battleReadyBtn = document.getElementById('battleReadyBtn');
const gameActiveChess = document.getElementById('gameActiveChess');
const chessBoard = document.getElementById('chessBoard');
const chessScore = document.getElementById('chessScore');
const chessStatus = document.getElementById('chessStatus');
const chessResetBtn = document.getElementById('chessResetBtn');
const chessPromo = document.getElementById('chessPromo');
const gameActiveLingo = document.getElementById('gameActiveLingo');
const gameActiveMemory = document.getElementById('gameActiveMemory');
const memoryBoard = document.getElementById('memoryBoard');
const memoryStatus = document.getElementById('memoryStatus');
const memoryScore = document.getElementById('memoryScore');
const memoryResetBtn = document.getElementById('memoryResetBtn');
const lingoBoard = document.getElementById('lingoBoard');
const lingoStatus = document.getElementById('lingoStatus');
const lingoScore = document.getElementById('lingoScore');
const lingoTimer = document.getElementById('lingoTimer');
const lingoKeyboard = document.getElementById('lingoKeyboard');
const lingoGuessBtn = document.getElementById('lingoGuessBtn');
const lingoResetBtn = document.getElementById('lingoResetBtn');
const catalogLingoWordLength = document.getElementById('catalogLingoWordLength');
const createLingoGameBtn = document.getElementById('createLingoGameBtn');
const catalogMemorySize = document.getElementById('catalogMemorySize');
const createMemoryGameBtn = document.getElementById('createMemoryGameBtn');
const catalogClockMinutes = document.getElementById('catalogClockMinutes');
const gameActiveBackgammon = document.getElementById('gameActiveBackgammon');
const backgammonResetBtn = document.getElementById('backgammonResetBtn');
const backgammonRollBtn = document.getElementById('backgammonRollBtn');
const backgammonStateRoot = document.getElementById('gameActiveBackgammon');
const gameResetAcceptBtn = document.getElementById('gameResetAcceptBtn');
const gameResetRejectBtn = document.getElementById('gameResetRejectBtn');

const savedDisplayName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
if (savedDisplayName) displayNameInput.value = savedDisplayName;

// State
let localStream = null;
let peerConnections = {};
let iceCandidateQueue = {}; // userId -> [candidates] (remote description gelmeden önce buffer)
const remoteStreams = {};   // userId -> MediaStream (uzak kullanıcının tüm track'leri tek stream'de; sadece kamera gelse de görünsün)
let currentRoomId = null;
let currentUserName = '';
const participantNames = {};
let isMuted = false;
let isVideoOff = false;
let pendingGame = null; // { gameId, player1 }
let activeClockState = null;
const audioAnalysers = {}; // participantId -> { context, analyser, source, animationId }

const GAME_NAMES = { tictactoe: 'XOX', battleship: 'Amiral Battı', chess: 'Satranç', backgammon: 'Tavla', lingo: 'Lingo', memory: 'Aynısını Bul' };
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

function formatClockTime(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function renderGameClocks(state) {
  activeClockState = state;
  updateGameClockDisplays();
}

function updateGameClockDisplays() {
  const state = activeClockState;
  document.querySelectorAll('.game-clocks').forEach((clocks) => {
    const visible = !!state?.clockMinutes;
    clocks.classList.toggle('hidden', !visible);
    if (!visible) return;

    clocks.querySelectorAll('.game-clock').forEach((clock) => {
      const player = clock.dataset.clockPlayer;
      const baseTime = state.clockRemainingMs?.[player] ?? state.clockMinutes * 60_000;
      const elapsed = state.clockRunningPlayer === player && state.clockStartedAt
        ? Date.now() - state.clockStartedAt
        : 0;
      const remaining = Math.max(0, baseTime - elapsed);
      clock.querySelector('time').textContent = formatClockTime(remaining);
      clock.classList.toggle('is-active', state.clockRunningPlayer === player && !state.winner);
      clock.classList.toggle('is-low', remaining <= 30_000 && !state.winner);
    });
  });
}

setInterval(updateGameClockDisplays, 200);

function enterTableRoom({ roomId, gameId }) {
  localStream = new MediaStream();
  localVideo.srcObject = localStream;
  participantNames[socket.id] = currentUserName;
  updateLocalVideoPlaceholder();
  currentRoomId = roomId;
  const gameName = GAME_NAMES[gameId] || 'Oyun';
  lobby.classList.add('hidden');
  tableLobby.classList.add('hidden');
  conference.classList.remove('hidden');
  roomTitle.textContent = `${gameName} masası`;
  tableGameLabel.textContent = gameName;
  connectionStatus.textContent = 'Bağlanıyor...';
  connectionStatus.classList.remove('connected');
  showGameView('pending');
  history.replaceState({}, '', window.location.pathname);
  updateMediaButtons();
  pendingGame = null;
}

joinBtn.addEventListener('click', () => {
  const name = displayNameInput.value.trim().slice(0, 24);
  if (!name) {
    lobbyError.textContent = 'Lütfen masalarda görünecek bir isim yaz.';
    lobbyError.classList.remove('hidden');
    displayNameInput.focus();
    return;
  }
  lobbyError.classList.add('hidden');
  joinBtn.disabled = true;
  socket.emit('lobby-join', name);
});

socket.on('connect', () => {
  if (!currentUserName && savedDisplayName && displayNameInput.value === savedDisplayName) {
    joinBtn.click();
  }
});
if (socket.connected && savedDisplayName) joinBtn.click();

displayNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinBtn.click();
});

document.getElementById('changeNameBtn')?.addEventListener('click', () => {
  tableLobby.classList.add('hidden');
  lobby.classList.remove('hidden');
  displayNameInput.value = currentUserName;
});

socket.on('lobby-ready', ({ name }) => {
  currentUserName = name;
  localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, name);
  lobbyUserName.textContent = name;
  if (localDisplayName) localDisplayName.textContent = name;
  if (localVideoLabel) localVideoLabel.textContent = name;
  if (localInitial) localInitial.textContent = name.charAt(0).toUpperCase();
  lobby.classList.add('hidden');
  tableLobby.classList.remove('hidden');
  joinBtn.disabled = false;
});

socket.on('lobby-error', (message) => {
  tableLobby.classList.add('hidden');
  lobby.classList.remove('hidden');
  lobbyError.textContent = message;
  lobbyError.classList.remove('hidden');
  joinBtn.disabled = false;
  displayNameInput.focus();
});

function renderTableList(tables) {
  if (!tableList || !Array.isArray(tables)) return;
  tableList.replaceChildren();
  tableCount.textContent = `${tables.length} masa`;
  emptyTables.classList.toggle('hidden', tables.length > 0);
  const icons = { chess: '♞', tictactoe: '✕', battleship: '⚓', lingo: '🔤', memory: '🧩' };
  const descriptions = {
    chess: 'Strateji · 2 oyuncu',
    tictactoe: 'Hızlı oyun · 2 oyuncu',
    battleship: 'Filo savaşı · 2 oyuncu',
    lingo: 'Kelime tahmini · 2 oyuncu',
    memory: 'Hafıza eşleştirme · 2 oyuncu'
  };

  tables.forEach((table) => {
    const card = document.createElement('article');
    card.className = 'table-card';

    const gameIcon = document.createElement('span');
    gameIcon.textContent = icons[table.gameId] || '♟';
    gameIcon.setAttribute('aria-hidden', 'true');

    const scene = document.createElement('div');
    scene.className = `table-scene ${table.gameId}`;
    const surface = document.createElement('div');
    surface.className = 'table-surface';
    surface.append(gameIcon);
    const title = document.createElement('h3');
    title.textContent = GAME_NAMES[table.gameId] || 'Oyun';
    surface.append(title);

    const seats = document.createElement('div');
    seats.className = 'table-seats';
    [table.hostName, table.opponentName].forEach((playerName, index) => {
      const seat = document.createElement('div');
      seat.className = `table-seat${playerName ? ' occupied' : ' empty'} ${index === 0 ? 'host-seat' : 'guest-seat'}`;
      seat.setAttribute('aria-label', playerName ? `Dolu sandalye: ${playerName}` : 'Boş sandalye');

      const chair = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chair.setAttribute('viewBox', '0 0 24 24');
      chair.setAttribute('aria-hidden', 'true');
      chair.classList.add('chair-icon');
      const chairPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      chairPath.setAttribute('d', 'M7 11V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6M5 12h14v4H5zM7 16v5m10-5v5');
      chair.append(chairPath);

      const name = document.createElement('span');
      name.className = 'table-seat-name';
      name.textContent = playerName || 'Boş';
      seat.append(chair, name);
      seats.appendChild(seat);
    });
    scene.append(seats, surface);

    const meta = document.createElement('span');
    meta.className = 'table-card-meta';
    const description = table.gameId === 'lingo'
      ? `Kelime tahmini · ${table.wordLength || 5} harf · 2 oyuncu`
      : table.gameId === 'memory'
        ? `Hafıza eşleştirme · ${table.boardSize || '4x5'} · 2 oyuncu`
        : descriptions[table.gameId] || '2 oyuncu';
    const timeDescription = table.timeMinutes ? ` · ${table.timeMinutes} dk` : '';
    meta.textContent = `${description}${timeDescription} · ${table.playerCount}/2 oyuncu`;

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn btn-primary table-join-btn';
    action.textContent = table.status === 'playing' ? 'Oyun sürüyor' : 'Masaya katıl';
    action.disabled = table.status === 'playing';
    if (table.status !== 'playing') {
      action.addEventListener('click', () => {
        tableLobbyError.classList.add('hidden');
        socket.emit('table-join', table.roomId);
      });
    }

    card.append(scene, meta, action);
    tableList.appendChild(card);
  });
}

socket.on('table-list', renderTableList);

let selectedNewTableGame = null;

function closeCreateTableModal() {
  createTableModal?.classList.add('hidden');
  createTableModal?.setAttribute('aria-hidden', 'true');
  openCreateTableModalBtn?.focus();
}

function selectNewTableGame(gameId) {
  selectedNewTableGame = gameId;
  document.querySelectorAll('.game-choice-card').forEach((card) => {
    card.setAttribute('aria-pressed', String(card.dataset.game === gameId));
  });

  const isLingo = gameId === 'lingo';
  const isMemory = gameId === 'memory';
  const hasClock = gameId === 'chess' || gameId === 'backgammon';
  createTableOptions?.classList.toggle('hidden', !isLingo && !isMemory);
  createTableClockOptions?.classList.toggle('hidden', !hasClock);
  newTableWordLength?.classList.toggle('hidden', !isLingo);
  newTableWordLengthLabel?.classList.toggle('hidden', !isLingo);
  newTableMemorySize?.classList.toggle('hidden', !isMemory);
  newTableMemorySizeLabel?.classList.toggle('hidden', !isMemory);
  createTableBtn.disabled = false;
}

openCreateTableModalBtn?.addEventListener('click', () => {
  selectedNewTableGame = null;
  createTableModalError?.classList.add('hidden');
  createTableModal?.classList.remove('hidden');
  createTableModal?.setAttribute('aria-hidden', 'false');
  document.querySelectorAll('.game-choice-card').forEach((card) => card.setAttribute('aria-pressed', 'false'));
  createTableOptions?.classList.add('hidden');
  createTableClockOptions?.classList.add('hidden');
  newTableWordLength?.classList.add('hidden');
  newTableWordLengthLabel?.classList.add('hidden');
  newTableMemorySize?.classList.add('hidden');
  newTableMemorySizeLabel?.classList.add('hidden');
  createTableBtn.disabled = true;
  document.querySelector('.game-choice-card')?.focus();
});

document.querySelectorAll('.game-choice-card').forEach((card) => {
  card.addEventListener('click', () => selectNewTableGame(card.dataset.game));
});

document.getElementById('closeCreateTableModalBtn')?.addEventListener('click', closeCreateTableModal);
document.getElementById('cancelCreateTableBtn')?.addEventListener('click', closeCreateTableModal);
createTableModal?.addEventListener('click', (event) => {
  if (event.target === createTableModal) closeCreateTableModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !createTableModal?.classList.contains('hidden')) closeCreateTableModal();
});

createTableBtn?.addEventListener('click', () => {
  if (!currentUserName || !selectedNewTableGame) return;
  createTableModalError?.classList.add('hidden');
  createTableBtn.disabled = true;
  socket.emit('table-create', {
    gameId: selectedNewTableGame,
    wordLength: Number(newTableWordLength?.value || 5),
    boardSize: newTableMemorySize?.value || '4x5',
    timeMinutes: Number(newTableClockMinutes?.value || 0)
  });
});

socket.on('table-error', (message) => {
  if (createTableModal && !createTableModal.classList.contains('hidden')) {
    createTableModalError.textContent = message;
    createTableModalError.classList.remove('hidden');
  } else {
    tableLobbyError.textContent = message;
    tableLobbyError.classList.remove('hidden');
  }
  createTableBtn.disabled = false;
});

socket.on('table-joined', (data) => {
  createTableBtn.disabled = false;
  closeCreateTableModal();
  enterTableRoom(data);
});

// Hamburger menü
function openHeaderMenu() {
  headerMenuOverlay?.classList.remove('hidden');
  headerMenuBtn?.setAttribute('aria-expanded', 'true');
}

function closeHeaderMenu() {
  headerMenuOverlay?.classList.add('hidden');
  headerMenuBtn?.setAttribute('aria-expanded', 'false');
}

headerMenuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (headerMenuOverlay?.classList.contains('hidden')) {
    openHeaderMenu();
  } else {
    closeHeaderMenu();
  }
});

headerMenuOverlay?.addEventListener('click', (e) => {
  if (e.target === headerMenuOverlay) closeHeaderMenu();
});

// Chat panel
function setChatOpen(isOpen) {
  chatPanel?.classList.toggle('is-open', isOpen);
  chatPanel?.setAttribute('aria-hidden', String(!isOpen));
  chatPanelOverlay?.classList.toggle('hidden', !isOpen);
  chatToggleBtn?.setAttribute('aria-expanded', String(isOpen));
  chatToggleBtn?.setAttribute('aria-label', isOpen ? 'Sohbeti kapat' : 'Sohbeti aç');
  if (isOpen) chatInput?.focus();
}

chatToggleBtn?.addEventListener('click', () => {
  setChatOpen(!chatPanel?.classList.contains('is-open'));
  closeHeaderMenu();
});

chatCloseBtn?.addEventListener('click', () => setChatOpen(false));
chatPanelOverlay?.addEventListener('click', () => setChatOpen(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && chatPanel?.classList.contains('is-open')) setChatOpen(false);
});

function addChatMessage(from, message, isOwn = false) {
  const div = document.createElement('div');
  div.className = `chat-message ${isOwn ? 'own' : 'remote'}`;
  const sender = document.createElement('div');
  sender.className = 'chat-message-sender';
  sender.textContent = isOwn ? 'Sen' : getParticipantDisplayName(from);
  const text = document.createElement('div');
  text.textContent = message;
  div.appendChild(sender);
  div.appendChild(text);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !currentRoomId) return;
  socket.emit('chat-message', text);
  addChatMessage(socket.id, text, true);
  chatInput.value = '';
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendChatMessage();
  }
});

// Oyun kataloğu / pending / aktif görünüm
function showGameView(mode, gameId) {
  gameCatalog?.classList.toggle('hidden', mode !== 'catalog');
  gamePending?.classList.toggle('hidden', mode !== 'pending');
  gameActive?.classList.toggle('hidden', mode !== 'active' || gameId !== 'tictactoe');
  gameActiveBattleship?.classList.toggle('hidden', mode !== 'active' || gameId !== 'battleship');
  gameActiveChess?.classList.toggle('hidden', mode !== 'active' || gameId !== 'chess');
  gameActiveLingo?.classList.toggle('hidden', mode !== 'active' || gameId !== 'lingo');
  gameActiveMemory?.classList.toggle('hidden', mode !== 'active' || gameId !== 'memory');
  gameActiveBackgammon?.classList.toggle('hidden', mode !== 'active' || gameId !== 'backgammon');
  gamePanel?.classList.toggle('game-panel-chess', mode === 'active' && gameId === 'chess');
}

function isAnyGameActive() {
  return !gameActive?.classList.contains('hidden')
    || !gameActiveBattleship?.classList.contains('hidden')
    || !gameActiveChess?.classList.contains('hidden')
    || !gameActiveLingo?.classList.contains('hidden')
    || !gameActiveMemory?.classList.contains('hidden')
    || !gameActiveBackgammon?.classList.contains('hidden');
}

document.querySelectorAll('.game-catalog-item')?.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!currentRoomId) return;
    const gameId = btn.dataset.game;
    if (!gameId) return;
    const selection = { gameId };
    if (gameId === 'chess' || gameId === 'backgammon') {
      selection.timeMinutes = Number(catalogClockMinutes?.value || 0);
    }
    socket.emit('game-select', selection);
  });
});

createLingoGameBtn?.addEventListener('click', () => {
  if (!currentRoomId) return;
  socket.emit('game-select', {
    gameId: 'lingo',
    wordLength: Number(catalogLingoWordLength?.value || 5)
  });
});

createMemoryGameBtn?.addEventListener('click', () => {
  if (!currentRoomId) return;
  socket.emit('game-select', {
    gameId: 'memory',
    boardSize: catalogMemorySize?.value || '4x5'
  });
});

gameJoinBtn?.addEventListener('click', () => {
  if (!currentRoomId || !pendingGame?.gameId) return;
  socket.emit('game-join', pendingGame.gameId);
});

gameCancelBtn?.addEventListener('click', () => {
  socket.emit('game-cancel');
});

socket.on('game-pending', (data) => {
  pendingGame = data;
  if (!data) return;
  const isMe = data.player1 === socket.id;
  showGameView('pending');
  if (isMe) {
    gamePendingStatus.textContent = `${GAME_NAMES[data.gameId] || data.gameId} masası açık · rakip bekleniyor`;
    gameJoinBtn?.classList.add('hidden');
    gameCancelBtn?.classList.add('hidden');
  } else {
    gamePendingStatus.textContent = `${data.playerName || getParticipantDisplayName(data.player1)} masası açık · rakip bekleniyor`;
    gameJoinBtn?.classList.add('hidden');
    gameCancelBtn?.classList.add('hidden');
  }
});

socket.on('game-pending-cleared', () => {
  pendingGame = null;
  if (isAnyGameActive()) return;
  showGameView(currentRoomId ? 'pending' : 'catalog');
});

socket.on('game-state', (state) => {
  if (state?.player1 && state?.player2) {
    pendingGame = null;
    const gid = state.gameId || 'tictactoe';
    showGameView('active', gid);
    if (gid === 'battleship') {
      renderBattleshipState(state);
    } else if (gid === 'chess') {
      renderChessState(state);
    } else if (gid === 'lingo') {
      renderLingoState(state);
    } else if (gid === 'memory') {
      renderMemoryState(state);
    } else if (gid === 'backgammon') {
      renderBackgammonState(state);
    } else {
      renderGameState(state);
    }
  } else {
    showGameView('catalog');
    renderGameState(null);
    renderBattleshipState(null);
    renderChessState(null);
    renderLingoState(null);
    renderMemoryState(null);
    renderBackgammonState(null);
    activeClockState = null;
    updateGameClockDisplays();
  }
});

gameResetBtn?.addEventListener('click', () => {
  if (currentRoomId) socket.emit('game-reset-request');
});

battleResetBtn?.addEventListener('click', () => {
  if (currentRoomId) socket.emit('game-reset-request');
});

chessResetBtn?.addEventListener('click', () => {
  if (currentRoomId) socket.emit('game-reset-request');
});

backgammonResetBtn?.addEventListener('click', () => {
  if (currentRoomId) socket.emit('game-reset-request');
});

lingoResetBtn?.addEventListener('click', () => {
  if (currentRoomId) socket.emit('game-reset-request');
});

memoryResetBtn?.addEventListener('click', () => {
  if (currentRoomId) socket.emit('game-reset-request');
});

gameResetAcceptBtn?.addEventListener('click', () => {
  socket.emit('game-reset-accept');
  gameResetModal?.classList.add('hidden');
});

gameResetRejectBtn?.addEventListener('click', () => {
  socket.emit('game-reset-reject');
  gameResetModal?.classList.add('hidden');
});

socket.on('game-reset-request', () => {
  gameResetModal?.classList.remove('hidden');
});

socket.on('game-reset-rejected', () => {
  const statusEl = !gameActiveChess?.classList.contains('hidden')
    ? chessStatus
    : !gameActiveBackgammon?.classList.contains('hidden')
      ? document.getElementById('backgammonStatus')
    : !gameActiveMemory?.classList.contains('hidden')
      ? memoryStatus
      : (gameActiveBattleship?.classList.contains('hidden') ? gameStatus : battleStatus);
  if (statusEl) statusEl.textContent = 'Rakip reddetti.';
});

socket.on('game-reset-accepted', () => {
  const statusEl = !gameActiveChess?.classList.contains('hidden')
    ? chessStatus
    : !gameActiveBackgammon?.classList.contains('hidden')
      ? document.getElementById('backgammonStatus')
    : !gameActiveMemory?.classList.contains('hidden')
      ? memoryStatus
      : (gameActiveBattleship?.classList.contains('hidden') ? gameStatus : battleStatus);
  if (statusEl) statusEl.textContent = 'Rakip kabul etti!';
});

socket.on('chat-message', ({ from, message }) => {
  if (from !== socket.id) {
    addChatMessage(from, message, false);
  }
});

// Yeni peer connection oluştur (isOfferer: true = biz offer gönderiyoruz)
async function createPeerConnection(userId, isOfferer = false) {
  const pc = new RTCPeerConnection({ iceServers });

  if (localStream?.getTracks().length) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  } else if (isOfferer) {
    // Track yoksa data channel (ICE bağlantısı için, en stabil yöntem)
    pc.createDataChannel('init');
  }

  pc.ontrack = (event) => {
    const track = event.track;
    if (!remoteStreams[userId]) remoteStreams[userId] = new MediaStream();
    const stream = remoteStreams[userId];
    stream.addTrack(track);
    if (track.kind === 'video') {
      track.onmute = () => showRemotePlaceholder(userId);
      track.onunmute = () => addRemoteVideo(userId, stream);
      track.onended = () => showRemotePlaceholder(userId);
      if (track.muted) showRemotePlaceholder(userId);
    }
    addRemoteVideo(userId, stream);
    if (stream.getAudioTracks().length) setupAudioLevelDetection(userId, stream);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        to: userId,
        candidate: event.candidate
      });
    }
  };

  pc.onnegotiationneeded = async () => {
    if (addingTrackToPeers) return; // addTrackToPeerConnections kendi renegotiation'ını yapıyor
    if (pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: userId, offer: pc.localDescription });
    } catch (e) {
      console.warn('Yeniden müzakere hatası:', e);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      connectionStatus.textContent = 'Bağlı';
      connectionStatus.classList.add('connected');
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      connectionStatus.textContent = 'Bağlantı hatası';
    }
    updateParticipantCount();
  };

  peerConnections[userId] = pc;
  addParticipantPlaceholder(userId);
  return pc;
}

function getParticipantDisplayName(userId) {
  return participantNames[userId] || `Oyuncu ${String(userId).slice(-4)}`;
}

function getParticipantInitial(userId) {
  return getParticipantDisplayName(userId).charAt(0).toUpperCase();
}

// Konuşan katılımcı göstergesi (ses seviyesi)
const SPEAKING_THRESHOLD = 8;
const SPEAKING_SMOOTHING = 0.6;

function setupAudioLevelDetection(participantId, stream) {
  const audioTracks = stream?.getAudioTracks().filter(t => t.enabled);
  if (!audioTracks?.length) return;

  if (audioAnalysers[participantId]) {
    try {
      audioAnalysers[participantId].context.close();
      cancelAnimationFrame(audioAnalysers[participantId].animationId);
    } catch (_) {}
    delete audioAnalysers[participantId];
  }

  try {
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = SPEAKING_SMOOTHING;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const wrapper = participantId === 'local'
      ? document.getElementById('localVideoWrapper')
      : document.getElementById(`remote-${participantId}`);
    if (!wrapper) return;

    let lastSpeaking = false;
    async function checkLevel() {
      if (context.state === 'suspended') await context.resume();
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const speaking = average > SPEAKING_THRESHOLD;
      if (speaking !== lastSpeaking) {
        lastSpeaking = speaking;
        wrapper.classList.toggle('speaking', speaking);
      }
      if (audioAnalysers[participantId]) {
        audioAnalysers[participantId].animationId = requestAnimationFrame(checkLevel);
      }
    }
    audioAnalysers[participantId] = { context, analyser, source, animationId: 0 };
    checkLevel();
  } catch (e) {
    console.warn('Ses analizi başlatılamadı:', e);
  }
}

function stopAudioLevelDetection(participantId) {
  if (audioAnalysers[participantId]) {
    try {
      audioAnalysers[participantId].context.close();
      cancelAnimationFrame(audioAnalysers[participantId].animationId);
    } catch (_) {}
    delete audioAnalysers[participantId];
    const wrapper = participantId === 'local'
      ? document.getElementById('localVideoWrapper')
      : document.getElementById(`remote-${participantId}`);
    if (wrapper) wrapper.classList.remove('speaking');
  }
}

// Katılımcı placeholder (kamera kapalıyken)
function addParticipantPlaceholder(userId) {
  if (document.getElementById(`remote-${userId}`)) return;

  const wrapper = document.createElement('div');
  wrapper.id = `remote-${userId}`;
  wrapper.className = 'video-wrapper remote';
  wrapper.dataset.hasVideo = 'false';

  const placeholder = createParticipantPlaceholder(userId);

  const label = document.createElement('div');
  label.className = 'video-label';
  label.textContent = getParticipantDisplayName(userId);

  wrapper.appendChild(placeholder);
  wrapper.appendChild(label);
  remoteVideos.appendChild(wrapper);
}

function createParticipantPlaceholder(userId) {
  const placeholder = document.createElement('div');
  placeholder.className = 'video-placeholder';
  const initial = document.createElement('span');
  initial.className = 'placeholder-initial';
  initial.textContent = getParticipantInitial(userId);
  const name = document.createElement('span');
  name.className = 'placeholder-name';
  name.textContent = getParticipantDisplayName(userId);
  placeholder.append(initial, name);
  return placeholder;
}

// Uzak katılımcının sesini her zaman ayrı <audio> ile oynat (video varken de); bazı tarayıcılarda <video> sesi güvenilir oynatmıyor
function ensureRemoteAudioElement(wrapper, stream) {
  if (!stream?.getAudioTracks().length) return;
  let remoteAudio = wrapper.querySelector('.remote-audio');
  if (!remoteAudio) {
    remoteAudio = document.createElement('audio');
    remoteAudio.className = 'remote-audio';
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute('playsinline', '');
    remoteAudio.style.position = 'absolute';
    remoteAudio.style.opacity = '0';
    remoteAudio.style.pointerEvents = 'none';
    remoteAudio.style.width = '0';
    remoteAudio.style.height = '0';
    wrapper.appendChild(remoteAudio);
  }
  remoteAudio.srcObject = stream;
  remoteAudio.play().catch(() => {});
}

// Uzak video ekle veya güncelle (kamera açıldığında)
function addRemoteVideo(userId, stream) {
  let wrapper = document.getElementById(`remote-${userId}`);
  // Sadece aktif (muted olmayan) video track varsa video göster
  const hasVideo = stream?.getVideoTracks().some(t => !t.muted) ?? false;

  if (!wrapper) {
    addParticipantPlaceholder(userId);
    wrapper = document.getElementById(`remote-${userId}`);
  }

  if (hasVideo) {
    wrapper.dataset.hasVideo = 'true';
    let video = wrapper.querySelector('video');
    let placeholder = wrapper.querySelector('.video-placeholder');
    if (!video) {
      video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = false;
      wrapper.insertBefore(video, wrapper.querySelector('.video-label'));
    }
    video.srcObject = stream;
    video.style.display = 'none'; // İlk bağlanan kullanıcı siyah görmesin: video gelene kadar ikon göster
    if (placeholder) placeholder.style.display = 'flex';
    video.play().catch(() => {});
    // Video gerçekten oynayana kadar placeholder göster, sonra videoya geç (ilk bağlanan siyah görmesin)
    let timeoutId;
    const showVideoWhenReady = () => {
      if (timeoutId) clearTimeout(timeoutId);
      video.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      video.removeEventListener('loadeddata', showVideoWhenReady);
      video.removeEventListener('playing', showVideoWhenReady);
    };
    video.addEventListener('loadeddata', showVideoWhenReady);
    video.addEventListener('playing', showVideoWhenReady);
    timeoutId = setTimeout(showVideoWhenReady, 1500); // Yüklenmezse en fazla 1.5 sn sonra videoya geç
    // Kamera kapatıldığında karşı tarafta siyah kalmasın: video track mute olunca placeholder göster (bazı ortamlarda ontrack.onmute gecikebilir)
    stream.getVideoTracks().forEach(t => {
      t.onmute = () => showRemotePlaceholder(userId);
      t.onunmute = () => addRemoteVideo(userId, stream);
    });
    // Video varken de sesi ayrı <audio> ile oynat; bazı tarayıcılarda <video> sesi oynatmıyor (autoplay politikası vb.)
    ensureRemoteAudioElement(wrapper, stream);
  } else {
    // Sadece ses veya kamera kapalı - placeholder göster, ses için gizli audio
    let placeholder = wrapper.querySelector('.video-placeholder');
    if (!placeholder) {
      placeholder = createParticipantPlaceholder(userId);
      wrapper.insertBefore(placeholder, wrapper.querySelector('.video-label'));
    }
    placeholder.style.display = 'flex';
    const v = wrapper.querySelector('video');
    if (v) {
      v.style.display = 'none';
      v.srcObject = null;
    }

    if (stream?.getAudioTracks().length) {
      ensureRemoteAudioElement(wrapper, stream);
    }
  }

  if (stream?.getAudioTracks().length) setupAudioLevelDetection(userId, stream);
}

// Uzak katılımcıda kamera kapatıldığında placeholder göster (siyah ekran kalmasın)
function showRemotePlaceholder(userId) {
  const wrapper = document.getElementById(`remote-${userId}`);
  if (!wrapper) return;
  wrapper.dataset.hasVideo = 'false';
  let placeholder = wrapper.querySelector('.video-placeholder');
  if (!placeholder) {
    placeholder = createParticipantPlaceholder(userId);
    wrapper.insertBefore(placeholder, wrapper.querySelector('.video-label'));
  }
  placeholder.style.display = 'flex';
  const v = wrapper.querySelector('video');
  if (v) {
    v.style.display = 'none';
    v.srcObject = null; // Siyah kare kalmaması için stream'i kaldır
  }
}

// Uzak videoyu kaldır
function removeRemoteVideo(userId) {
  stopAudioLevelDetection(userId);
  const wrapper = document.getElementById(`remote-${userId}`);
  if (wrapper) wrapper.remove();
  if (remoteStreams[userId]) {
    remoteStreams[userId].getTracks().forEach(t => t.stop());
    delete remoteStreams[userId];
  }
  if (peerConnections[userId]) {
    peerConnections[userId].close();
    delete peerConnections[userId];
  }
  delete iceCandidateQueue[userId];
  updateParticipantCount();
}

// Katılımcı sayısını güncelle
function updateParticipantCount() {
  const count = Object.keys(peerConnections).length + 1;
  participantCount.textContent = `${count} katılımcı`;
  // Tek başınayken "Bağlantı hazır" göster
  if (count === 1 && connectionStatus.textContent === 'Bağlanıyor...') {
    connectionStatus.textContent = 'Bağlantı hazır';
    connectionStatus.classList.add('connected');
  }
}

// Socket olayları
socket.on('room-users', async (users) => {
  for (const user of users) {
    const userId = typeof user === 'string' ? user : user.id;
    if (typeof user !== 'string' && user.name) participantNames[userId] = user.name;
    await handleNewUser(userId);
  }
  updateParticipantCount();
});

// user-joined: Sadece bilgi - offer'ı yeni katılan gönderecek (room-users ile)
socket.on('user-joined', (user) => {
  if (user?.id && user.name) participantNames[user.id] = user.name;
  updateParticipantCount();
});

socket.on('user-left', (userId) => {
  removeRemoteVideo(userId);
  delete participantNames[userId];
});

// Bir katılımcı kamerayı kapattığında karşı tarafta ikon (placeholder) göster
socket.on('peer-video-off', ({ userId }) => {
  showRemotePlaceholder(userId);
});

// Bir katılımcı kamerayı tekrar açtığında karşı tarafta videoyu göster (onunmute bazen tetiklenmediği için)
socket.on('peer-video-on', ({ userId }) => {
  const stream = remoteStreams[userId];
  if (stream) addRemoteVideo(userId, stream);
});

async function handleNewUser(userId) {
  if (peerConnections[userId]) return; // Zaten bağlantı var, tekrar oluşturma
  iceCandidateQueue[userId] = [];

  const pc = await createPeerConnection(userId, true); // Biz offerer'ız
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit('offer', {
    to: userId,
    offer: pc.localDescription
  });
}

socket.on('offer', async ({ from, offer }) => {
  const isRenegotiation = !!peerConnections[from];
  if (!isRenegotiation) iceCandidateQueue[from] = [];

  let pc = peerConnections[from];
  if (!pc) {
    pc = await createPeerConnection(from, false); // Biz answerer'ız
  }

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit('answer', {
    to: from,
    answer: pc.localDescription
  });

  // Buffer'daki ICE candidate'leri ekle
  if (iceCandidateQueue[from]?.length) {
    for (const c of iceCandidateQueue[from]) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('ICE candidate eklenemedi:', e);
      }
    }
  }
  delete iceCandidateQueue[from];
});

socket.on('answer', async ({ from, answer }) => {
  const pc = peerConnections[from];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    // Buffer'daki ICE candidate'leri ekle
    if (iceCandidateQueue[from]?.length) {
      for (const c of iceCandidateQueue[from]) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          console.warn('ICE candidate eklenemedi:', e);
        }
      }
    }
    delete iceCandidateQueue[from];
    // Önce kamera açıldıysa: ilk offer sadece data channel ile gitti, cevap gelince artık stable olduk — bekleyen track'leri gönder
    ensureLocalTracksSent();
  }
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  const pc = peerConnections[from];
  if (pc && pc.remoteDescription) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('ICE candidate eklenemedi:', e);
    }
  } else {
    // Remote description henüz gelmedi, buffer'a ekle
    if (!iceCandidateQueue[from]) iceCandidateQueue[from] = [];
    iceCandidateQueue[from].push(candidate);
  }
});

// Ayrıl
leaveBtn.addEventListener('click', () => {
  leaveRoom();
});

function leaveRoom() {
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};

  Object.keys(audioAnalysers).forEach(id => stopAudioLevelDetection(id));
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  remoteVideos.innerHTML = '';
  localVideo.srcObject = null;
  Object.keys(participantNames).forEach(id => delete participantNames[id]);

  if (chatMessages) chatMessages.innerHTML = '';
  setChatOpen(false);
  if (gameResetModal) gameResetModal.classList.add('hidden');
  closeHeaderMenu();
  pendingGame = null;
  renderLingoState(null);
  showGameView('catalog');
  renderGameState(null);
  renderBattleshipState(null);
  renderChessState(null);
  renderMemoryState(null);

  if (currentRoomId) {
    socket.emit('leave-room');
  }

  currentRoomId = null;
  conference.classList.add('hidden');
  tableLobby.classList.remove('hidden');
  connectionStatus.textContent = 'Lobi';
  connectionStatus.classList.remove('connected');
}

// Medya butonlarını güncelle — kamera kapalıyken yerel kullanıcı ikonu (placeholder) göster
function updateLocalVideoPlaceholder() {
  const hasActiveVideo = localStream?.getVideoTracks().some(t => t.enabled) ?? false;
  const placeholder = document.getElementById('localPlaceholder');
  if (placeholder) {
    placeholder.style.display = hasActiveVideo ? 'none' : 'flex';
  }
  if (localVideo) {
    localVideo.style.display = hasActiveVideo ? 'block' : 'none';
  }
}

function updateMediaButtons() {
  const hasAudio = localStream?.getAudioTracks().length > 0;
  const hasVideo = localStream?.getVideoTracks().length > 0;
  const muteIsOff = !hasAudio || isMuted;
  const videoIsOff = !hasVideo || isVideoOff;
  const muteLabel = muteIsOff ? 'Mikrofonu aç' : 'Mikrofonu kapat';
  const videoLabel = videoIsOff ? 'Kamerayı aç' : 'Kamerayı kapat';
  toggleMuteBtn?.classList.toggle('is-off', muteIsOff);
  toggleMuteBtn?.setAttribute('aria-pressed', String(!muteIsOff));
  toggleMuteBtn?.setAttribute('aria-label', muteLabel);
  if (toggleMuteBtn) toggleMuteBtn.title = muteLabel;
  toggleVideoBtn?.classList.toggle('is-off', videoIsOff);
  toggleVideoBtn?.setAttribute('aria-pressed', String(!videoIsOff));
  toggleVideoBtn?.setAttribute('aria-label', videoLabel);
  if (toggleVideoBtn) toggleVideoBtn.title = videoLabel;
  updateLocalVideoPlaceholder();
}

// Renegotiation sırasında onnegotiationneeded'ın çift offer göndermesini engelle
let addingTrackToPeers = false;
// Önce kamera açıldığında: track eklendi ama stable olmadığı için offer atılamadı — answer gelince bu userId'ler için offer at
const pendingRenegotiation = new Set();

// Answer gelip bağlantı stable olduktan sonra: bekleyen track'ler veya localStream'de olup gönderilmeyen track'ler için offer at
async function ensureLocalTracksSent() {
  if (!localStream) return;
  addingTrackToPeers = true;
  try {
    for (const [userId, pc] of Object.entries(peerConnections)) {
      if (pc.signalingState !== 'stable') continue;
      const senders = pc.getSenders();
      const hasVideo = senders.some(s => s.track?.kind === 'video');
      const hasAudio = senders.some(s => s.track?.kind === 'audio');
      const needVideo = localStream.getVideoTracks().length > 0 && !hasVideo;
      const needAudio = localStream.getAudioTracks().length > 0 && !hasAudio;
      const hadPending = pendingRenegotiation.has(userId);
      pendingRenegotiation.delete(userId);
      if (!hadPending && !needVideo && !needAudio) continue;
      if (needVideo) pc.addTrack(localStream.getVideoTracks()[0], localStream);
      if (needAudio) pc.addTrack(localStream.getAudioTracks()[0], localStream);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer: pc.localDescription });
      } catch (e) {
        console.warn('ensureLocalTracksSent renegotiation hatası:', userId, e);
      }
    }
  } finally {
    addingTrackToPeers = false;
  }
}

// Eklenen track'leri tüm peer connections'a yayımla ve karşı tarafa hemen iletilmesi için renegotiation yap
async function addTrackToPeerConnections(track, stream) {
  addingTrackToPeers = true;
  try {
    Object.entries(peerConnections).forEach(([userId, pc]) => {
      const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
      if (sender) sender.replaceTrack(track);
      else pc.addTrack(track, stream);
    });
    // Kamera/mikrofon açıldığında karşıya hemen gitsin — açık renegotiation (bazı ortamlarda onnegotiationneeded gecikmeli tetiklenebilir)
    for (const [userId, pc] of Object.entries(peerConnections)) {
      if (pc.signalingState !== 'stable') {
        // Cevap henüz gelmedi; cevap gelince ensureLocalTracksSent bu peer için offer atacak
        pendingRenegotiation.add(userId);
        continue;
      }
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer: pc.localDescription });
      } catch (e) {
        console.warn('Yeniden müzakere hatası:', userId, e);
      }
    }
  } finally {
    addingTrackToPeers = false;
  }
}

// İzin modal
let pendingPermissionRequest = null; // { type: 'video'|'audio', resolver }

function showPermissionModal(type) {
  const isVideo = type === 'video';
  permissionModalText.textContent = isVideo
    ? 'Kamera erişimi reddedildi.'
    : 'Mikrofon erişimi reddedildi.';
  permissionModal.classList.remove('hidden');
}

function hidePermissionModal() {
  permissionModal.classList.add('hidden');
  pendingPermissionRequest = null;
}

permissionCloseBtn.addEventListener('click', hidePermissionModal);

permissionRetryBtn.addEventListener('click', () => {
  if (!pendingPermissionRequest) return;
  const { type } = pendingPermissionRequest;
  const promise = type === 'video'
    ? navigator.mediaDevices.getUserMedia({ video: true })
    : navigator.mediaDevices.getUserMedia({ audio: true });
  promise.then(async (stream) => {
    const track = type === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
    localStream.addTrack(track);
    await addTrackToPeerConnections(track, localStream);
    if (type === 'audio') setupAudioLevelDetection('local', localStream);
    updateMediaButtons();
    hidePermissionModal();
  }).catch(err => {
    console.warn('İzin hatası:', err);
    permissionModalText.textContent = type === 'video'
      ? 'Kamera erişimi hâlâ reddedildi. Tarayıcı ayarlarından izin verin.'
      : 'Mikrofon erişimi hâlâ reddedildi. Tarayıcı ayarlarından izin verin.';
  });
});

async function requestMediaWithRetry(type) {
  const constraints = type === 'video'
    ? { video: { width: { ideal: 1280 }, height: { ideal: 720 } } }
    : { audio: true };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = type === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
    localStream.addTrack(track);
    await addTrackToPeerConnections(track, localStream);
    updateMediaButtons();
    return true;
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      pendingPermissionRequest = { type };
      showPermissionModal(type);
    }
    return false;
  }
}

// Mikrofon aç/kapa - mobilde getUserMedia tıklamada HEMEN çağrılmalı (await öncesi)
toggleMuteBtn.addEventListener('click', () => {
  const hasAudio = localStream?.getAudioTracks().length > 0;
  if (!hasAudio) {
    const promise = navigator.mediaDevices.getUserMedia({ audio: true });
    promise.then(async (stream) => {
      const track = stream.getAudioTracks()[0];
      localStream.addTrack(track);
      isMuted = false;
      await addTrackToPeerConnections(track, localStream);
      setupAudioLevelDetection('local', localStream);
      updateMediaButtons();
    }).catch(err => {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        pendingPermissionRequest = { type: 'audio' };
        showPermissionModal('audio');
      }
    });
    return;
  }
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => { track.enabled = !isMuted; });
  updateMediaButtons();
});

// Kamera aç/kapa - mobilde getUserMedia tıklamada HEMEN çağrılmalı (await öncesi)
toggleVideoBtn.addEventListener('click', () => {
  const hasVideo = localStream?.getVideoTracks().length > 0;
  if (!hasVideo) {
    const promise = navigator.mediaDevices.getUserMedia({ video: true });
    promise.then(async (stream) => {
      const track = stream.getVideoTracks()[0];
      localStream.addTrack(track);
      isVideoOff = false;
      await addTrackToPeerConnections(track, localStream);
      updateMediaButtons();
      updateLocalVideoPlaceholder();
    }).catch(err => {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        pendingPermissionRequest = { type: 'video' };
        showPermissionModal('video');
      }
    });
    return;
  }
  isVideoOff = !isVideoOff;
  localStream.getVideoTracks().forEach(track => { track.enabled = !isVideoOff; });
  if (isVideoOff && currentRoomId) socket.emit('video-off'); // Diğer kullanıcılarda ikona dönsün
  if (!isVideoOff && currentRoomId) {
    socket.emit('video-on'); // Kamera tekrar açıldı, karşı taraf güncellesin (onunmute güvenilir değil)
    // Yerel videoyu yeniden bağla (bazı tarayıcılar track.enabled=true sonrası güncellemiyor)
    if (localVideo && localStream) {
      localVideo.srcObject = null;
      localVideo.srcObject = localStream;
      localVideo.play().catch(() => {});
    }
  }
  updateMediaButtons();
  updateLocalVideoPlaceholder();
});
