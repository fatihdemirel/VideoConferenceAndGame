/**
 * Video Konferans - WebRTC Client
 */

const socket = io();

// DOM elementleri
const lobby = document.getElementById('lobby');
const conference = document.getElementById('conference');
const roomIdInput = document.getElementById('roomId');
const joinBtn = document.getElementById('joinBtn');
const roomTitle = document.getElementById('roomTitle');
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
const connectionStatus = document.getElementById('connectionStatus');
const participantCount = document.getElementById('participantCount');
const leaveBtn = document.getElementById('leaveBtn');
const toggleMuteBtn = document.getElementById('toggleMuteBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const permissionModal = document.getElementById('permissionModal');
const permissionModalText = document.getElementById('permissionModalText');
const permissionRetryBtn = document.getElementById('permissionRetryBtn');
const permissionCloseBtn = document.getElementById('permissionCloseBtn');
const chatToggleBtn = document.getElementById('chatToggleBtn');
const chatPanel = document.getElementById('chatPanel');
const chatCloseBtn = document.getElementById('chatCloseBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const gamePanel = document.getElementById('gamePanel');
const gameToggleBtn = document.getElementById('gameToggleBtn');
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
const gameResetAcceptBtn = document.getElementById('gameResetAcceptBtn');
const gameResetRejectBtn = document.getElementById('gameResetRejectBtn');

// State
let localStream = null;
let peerConnections = {};
let iceCandidateQueue = {}; // userId -> [candidates] (remote description gelmeden önce buffer)
const remoteStreams = {};   // userId -> MediaStream (uzak kullanıcının tüm track'leri tek stream'de; sadece kamera gelse de görünsün)
let currentRoomId = null;
let isMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
let pendingGame = null; // { gameId, player1 }
const audioAnalysers = {}; // participantId -> { context, analyser, source, animationId }

const GAME_NAMES = { tictactoe: 'XOX', battleship: 'Amiral Battı' };
const BATTLE_SIZE = 8;
const BATTLE_SHIPS = [4, 3, 2, 2];

let battlePlacementShips = [];
let battlePlacementDir = 'h';
let battlePlacementShipIndex = 0;

// STUN sunucuları (NAT traversal için)
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// Rastgele oda ID oluştur
function generateRoomId() {
  return 'room-' + Math.random().toString(36).substring(2, 10);
}

// URL'den oda ID yükle veya yeni oluştur
const urlParams = new URLSearchParams(window.location.search);
roomIdInput.value = urlParams.get('room') || generateRoomId();

// Odaya katıl (kamera/mikrofon izni zorunlu değil)
joinBtn.addEventListener('click', async () => {
  const roomId = roomIdInput.value.trim() || generateRoomId();
  roomIdInput.value = roomId;

  localStream = new MediaStream();
  localVideo.srcObject = localStream;
  updateLocalVideoPlaceholder();
  currentRoomId = roomId;
  socket.emit('join-room', roomId);

  lobby.classList.add('hidden');
  conference.classList.remove('hidden');
  roomTitle.textContent = `Oda: ${roomId}`;
  connectionStatus.textContent = 'Bağlanıyor...';
  connectionStatus.classList.remove('connected');

  history.replaceState({}, '', getConferenceUrl(roomId));
  updateMediaButtons();
  pendingGame = null;
  showGameView('catalog');
});

function getConferenceUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  return url.toString();
}

const gamePanelOverlay = document.getElementById('gamePanelOverlay');

// Oyun paneli aç/kapa
function toggleGamePanel() {
  gamePanel?.classList.toggle('game-panel-collapsed');
  if (gamePanelOverlay) {
    gamePanelOverlay.classList.toggle('hidden', gamePanel?.classList.contains('game-panel-collapsed'));
  }
}

gameToggleBtn?.addEventListener('click', toggleGamePanel);

gamePanelOverlay?.addEventListener('click', () => {
  gamePanel?.classList.add('game-panel-collapsed');
  gamePanelOverlay?.classList.add('hidden');
});

// Hamburger menü
function openHeaderMenu() {
  headerMenuOverlay?.classList.remove('hidden');
}

function closeHeaderMenu() {
  headerMenuOverlay?.classList.add('hidden');
}

headerMenuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  headerMenuOverlay?.classList.toggle('hidden');
});

headerMenuOverlay?.addEventListener('click', (e) => {
  if (e.target === headerMenuOverlay) closeHeaderMenu();
});

document.getElementById('gameToggleBtnMenu')?.addEventListener('click', () => {
  toggleGamePanel();
  closeHeaderMenu();
});
document.getElementById('chatToggleBtnMenu')?.addEventListener('click', () => {
  chatToggleBtn?.click();
  closeHeaderMenu();
});
document.getElementById('screenShareBtnMenu')?.addEventListener('click', () => {
  screenShareBtn?.click();
  closeHeaderMenu();
});
document.getElementById('toggleMuteBtnMenu')?.addEventListener('click', () => {
  toggleMuteBtn?.click();
  closeHeaderMenu();
});
document.getElementById('toggleVideoBtnMenu')?.addEventListener('click', () => {
  toggleVideoBtn?.click();
  closeHeaderMenu();
});
document.getElementById('leaveBtnMenu')?.addEventListener('click', () => {
  leaveBtn?.click();
  closeHeaderMenu();
});

// Chat panel
chatToggleBtn.addEventListener('click', () => {
  chatPanel.classList.toggle('hidden');
});

chatCloseBtn.addEventListener('click', () => {
  chatPanel.classList.add('hidden');
});

function addChatMessage(from, message, isOwn = false) {
  const div = document.createElement('div');
  div.className = `chat-message ${isOwn ? 'own' : 'remote'}`;
  const sender = document.createElement('div');
  sender.className = 'chat-message-sender';
  sender.textContent = isOwn ? 'Sen' : `Katılımcı ${String(from).slice(-6)}`;
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
  gameActive?.classList.toggle('hidden', mode !== 'active' || gameId === 'battleship');
  gameActiveBattleship?.classList.toggle('hidden', mode !== 'active' || gameId !== 'battleship');
}

document.querySelectorAll('.game-catalog-item')?.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!currentRoomId) return;
    const gameId = btn.dataset.game;
    if (gameId) socket.emit('game-select', gameId);
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
    gamePendingStatus.textContent = `${GAME_NAMES[data.gameId] || data.gameId} – Rakip bekleniyor...`;
    gameJoinBtn?.classList.add('hidden');
    gameCancelBtn?.classList.remove('hidden');
  } else {
    gamePendingStatus.textContent = `Katılımcı ${String(data.player1).slice(-6)} ${GAME_NAMES[data.gameId] || data.gameId} oynamak istiyor`;
    gameJoinBtn?.classList.remove('hidden');
    gameCancelBtn?.classList.add('hidden');
  }
});

socket.on('game-pending-cleared', () => {
  pendingGame = null;
  if (!gameActive?.classList.contains('hidden') || !gameActiveBattleship?.classList.contains('hidden')) return;
  showGameView('catalog');
});

socket.on('game-state', (state) => {
  if (state?.player1 && state?.player2) {
    pendingGame = null;
    const gid = state.gameId || 'tictactoe';
    showGameView('active', gid);
    if (gid === 'battleship') {
      renderBattleshipState(state);
    } else {
      renderGameState(state);
    }
  } else {
    showGameView('catalog');
    renderGameState(null);
    renderBattleshipState(null);
  }
});

// TicTacToe
function getWinningLine(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return [a,b,c];
  }
  return null;
}

function renderGameState(state) {
  if (!gameBoard || !gameStatus) return;
  if (gameScore) {
    const s1 = state?.score1 ?? 0;
    const s2 = state?.score2 ?? 0;
    gameScore.textContent = `X: ${s1} — O: ${s2}`;
  }
  const cells = gameBoard.querySelectorAll('.game-cell');
  const winningLine = state?.board ? getWinningLine(state.board) : null;
  cells.forEach((cell, i) => {
    const val = state?.board?.[i] || '';
    cell.textContent = val;
    cell.className = 'game-cell' + (val ? ` ${val.toLowerCase()}` : '');
    cell.classList.toggle('winning', winningLine?.includes(i) ?? false);
    if (state?.winner) {
      cell.classList.remove('disabled');
      cell.style.cursor = 'default';
    } else {
      const mySymbol = state?.player1 === socket.id ? 'X' : state?.player2 === socket.id ? 'O' : null;
      const canPlay = mySymbol && state?.currentTurn === mySymbol;
      cell.classList.toggle('disabled', !canPlay);
      cell.style.cursor = canPlay ? 'pointer' : 'not-allowed';
    }
  });

  let status = 'Bekleniyor...';
  if (state?.player1 && state?.player2) {
    if (state.winner === 'draw') status = 'Berabere!';
    else if (state.winner) status = `${state.winner} kazandı!`;
    else {
      const mySymbol = state.player1 === socket.id ? 'X' : state.player2 === socket.id ? 'O' : null;
      if (mySymbol) status = state.currentTurn === mySymbol ? 'Senin sıran!' : 'Rakibin sırası';
      else status = `${state.currentTurn} sırası`;
    }
  } else if (state?.player1) status = 'İkinci oyuncu bekleniyor...';
  gameStatus.textContent = status;
}

gameBoard?.addEventListener('click', (e) => {
  const cell = e.target.closest('.game-cell');
  if (!cell || !currentRoomId || cell.classList.contains('disabled') || cell.textContent) return;
  const index = parseInt(cell.dataset.index, 10);
  if (isNaN(index) || index < 0 || index > 8) return;
  socket.emit('game-move', index);
});

gameResetBtn?.addEventListener('click', () => {
  if (currentRoomId) socket.emit('game-reset-request');
});

battleResetBtn?.addEventListener('click', () => {
  if (currentRoomId) socket.emit('game-reset-request');
});

// Amiral Battı
function renderBattleshipPlacement() {
  battlePlacementShips = [];
  battlePlacementShipIndex = 0;
  battlePlacementDir = 'h';
  if (battlePlacementBoard) {
    battlePlacementBoard.innerHTML = '';
    battlePlacementBoard.style.gridTemplateColumns = `repeat(${BATTLE_SIZE}, 1fr)`;
    for (let i = 0; i < BATTLE_SIZE * BATTLE_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'battle-cell placement-cell';
      cell.dataset.index = i;
      battlePlacementBoard.appendChild(cell);
    }
  }
  updatePlacementUI();
}

function updatePlacementUI() {
  const len = BATTLE_SHIPS[battlePlacementShipIndex];
  battlePlacementStatus.textContent = battlePlacementShips.length === 0 ? 'Gemilerini yerleştir' : `${battlePlacementShips.length}/${BATTLE_SHIPS.length} gemi yerleştirildi`;
  battlePlacementShip.innerHTML = `${len} hücre: <button type="button" class="btn btn-icon btn-small" data-dir="h">Yatay</button> <button type="button" class="btn btn-icon btn-small" data-dir="v">Dikey</button>`;
  battlePlacementShip.querySelectorAll('[data-dir]').forEach(btn => {
    btn.classList.toggle('active', battlePlacementDir === btn.dataset.dir);
    btn.onclick = () => { battlePlacementDir = btn.dataset.dir; updatePlacementUI(); };
  });
  battleReadyBtn?.classList.toggle('hidden', battlePlacementShips.length !== BATTLE_SHIPS.length);
  renderPlacementBoard();
}

function renderPlacementBoard() {
  const used = new Set();
  battlePlacementShips.forEach(ship => ship.forEach(i => used.add(i)));
  battlePlacementBoard?.querySelectorAll('.battle-cell').forEach((cell, i) => {
    cell.className = 'battle-cell placement-cell' + (used.has(i) ? ' ship' : '');
  });
}

function tryPlaceShip(startIdx) {
  const len = BATTLE_SHIPS[battlePlacementShipIndex];
  const row = Math.floor(startIdx / BATTLE_SIZE);
  const col = startIdx % BATTLE_SIZE;
  const cells = [];
  for (let i = 0; i < len; i++) {
    const r = battlePlacementDir === 'h' ? row : row + i;
    const c = battlePlacementDir === 'h' ? col + i : col;
    if (r < 0 || r >= BATTLE_SIZE || c < 0 || c >= BATTLE_SIZE) return false;
    cells.push(r * BATTLE_SIZE + c);
  }
  const used = new Set();
  battlePlacementShips.forEach(ship => ship.forEach(i => used.add(i)));
  if (cells.some(i => used.has(i))) return false;
  battlePlacementShips.push(cells);
  battlePlacementShipIndex++;
  if (battlePlacementShipIndex >= BATTLE_SHIPS.length) battlePlacementShipIndex = 0;
  return true;
}

function renderBattleshipState(state) {
  if (!battleStatus) return;
  if (!state?.player1 || !state?.player2) {
    battleMyBoard && (battleMyBoard.innerHTML = '');
    battleEnemyBoard && (battleEnemyBoard.innerHTML = '');
    battlePlacement?.classList.add('hidden');
    battleBoards?.classList.add('hidden');
    return;
  }

  const isP1 = state.player1 === socket.id;
  const myShips = isP1 ? state.ships1 : state.ships2;
  const otherShips = isP1 ? state.ships2 : state.ships1;

  battleScore.textContent = `${state.score1 || 0} — ${state.score2 || 0}`;

  if (state.phase === 'placement') {
    battlePlacement?.classList.remove('hidden');
    battleBoards?.classList.add('hidden');
    if (!myShips) {
      const isFreshGame = !state.ships1 && !state.ships2;
      if (isFreshGame || battlePlacementShips.length === 0) {
        battlePlacementShips = [];
        battlePlacementShipIndex = 0;
        renderBattleshipPlacement();
      } else {
        updatePlacementUI();
      }
      battlePlacementShip?.classList.remove('hidden');
    } else {
      battlePlacementStatus.textContent = 'Rakip gemilerini yerleştiriyor...';
      battlePlacementShip?.classList.add('hidden');
      battleReadyBtn?.classList.add('hidden');
      battlePlacementBoard.innerHTML = '';
      battlePlacementBoard.style.gridTemplateColumns = `repeat(${BATTLE_SIZE}, 1fr)`;
      const used = new Set();
      myShips.forEach(ship => ship.forEach(i => used.add(i)));
      for (let i = 0; i < BATTLE_SIZE * BATTLE_SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'battle-cell' + (used.has(i) ? ' ship' : '');
        battlePlacementBoard.appendChild(cell);
      }
    }
    return;
  }

  battlePlacement?.classList.add('hidden');
  battleBoards?.classList.remove('hidden');

  const myGrid = isP1 ? state.grid1 : state.grid2;
  const enemyGrid = isP1 ? state.grid2 : state.grid1;
  const myShots = isP1 ? state.shots1 : state.shots2;

  let status = '';
  if (state.winner) {
    status = state.winner === (isP1 ? 'player1' : 'player2') ? 'Kazandın!' : 'Kaybettin!';
  } else {
    const myTurn = state.currentTurn === (isP1 ? 'player1' : 'player2');
    status = myTurn ? 'Senin sıran!' : 'Rakibin sırası';
  }
  battleStatus.textContent = status;

  const canShoot = !state.winner && state.currentTurn === (isP1 ? 'player1' : 'player2');

  battleMyBoard.innerHTML = '';
  battleMyBoard.style.gridTemplateColumns = `repeat(${BATTLE_SIZE}, 1fr)`;
  for (let i = 0; i < BATTLE_SIZE * BATTLE_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'battle-cell';
    if (myGrid[i] === 1) cell.classList.add('ship');
    else if (myGrid[i] === 2) cell.classList.add('hit');
    else if (myGrid[i] === 3) cell.classList.add('miss');
    battleMyBoard.appendChild(cell);
  }

  battleEnemyBoard.innerHTML = '';
  battleEnemyBoard.style.gridTemplateColumns = `repeat(${BATTLE_SIZE}, 1fr)`;
  for (let i = 0; i < BATTLE_SIZE * BATTLE_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'battle-cell';
    cell.dataset.index = i;
    if (myShots.includes(i)) {
      cell.classList.add(enemyGrid[i] === 2 ? 'hit' : 'miss');
    } else if (canShoot) {
      cell.classList.add('shootable');
    }
    battleEnemyBoard.appendChild(cell);
  }
}

battlePlacementBoard?.addEventListener('click', (e) => {
  const cell = e.target.closest('.battle-cell.placement-cell:not(.ship)');
  if (!cell || !currentRoomId || cell.classList.contains('disabled')) return;
  if (battlePlacementShips.length >= BATTLE_SHIPS.length) return;
  const idx = parseInt(cell.dataset.index, 10);
  if (isNaN(idx)) return;
  if (tryPlaceShip(idx)) updatePlacementUI();
});

battleReadyBtn?.addEventListener('click', () => {
  if (!currentRoomId || battlePlacementShips.length !== BATTLE_SHIPS.length) return;
  socket.emit('game-ships-place', battlePlacementShips);
});

battleEnemyBoard?.addEventListener('click', (e) => {
  const cell = e.target.closest('.battle-cell.shootable');
  if (!cell || !currentRoomId) return;
  const idx = parseInt(cell.dataset.index, 10);
  if (!isNaN(idx) && idx >= 0 && idx < BATTLE_SIZE * BATTLE_SIZE) socket.emit('game-shot', idx);
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
  const statusEl = gameActiveBattleship?.classList.contains('hidden') ? gameStatus : battleStatus;
  if (statusEl) statusEl.textContent = 'Rakip reddetti.';
});

socket.on('game-reset-accepted', () => {
  const statusEl = gameActiveBattleship?.classList.contains('hidden') ? gameStatus : battleStatus;
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
  return `Katılımcı ${String(userId).slice(-6)}`;
}

function getParticipantInitial(userId) {
  const id = String(userId).slice(-6);
  return (id.charAt(0) || '?').toUpperCase();
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

  const placeholder = document.createElement('div');
  placeholder.className = 'video-placeholder';
  placeholder.innerHTML = `<span class="placeholder-initial">${getParticipantInitial(userId)}</span><span class="placeholder-name">${getParticipantDisplayName(userId)}</span>`;

  const label = document.createElement('div');
  label.className = 'video-label';
  label.textContent = getParticipantDisplayName(userId);

  wrapper.appendChild(placeholder);
  wrapper.appendChild(label);
  remoteVideos.appendChild(wrapper);
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
    video.style.display = 'block';
    video.play().catch(() => {});
    if (placeholder) placeholder.style.display = 'none';
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
      placeholder = document.createElement('div');
      placeholder.className = 'video-placeholder';
      placeholder.innerHTML = `<span class="placeholder-initial">${getParticipantInitial(userId)}</span><span class="placeholder-name">${getParticipantDisplayName(userId)}</span>`;
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
    placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    placeholder.innerHTML = `<span class="placeholder-initial">${getParticipantInitial(userId)}</span><span class="placeholder-name">${getParticipantDisplayName(userId)}</span>`;
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
  for (const userId of users) {
    await handleNewUser(userId);
  }
  updateParticipantCount();
});

// user-joined: Sadece bilgi - offer'ı yeni katılan gönderecek (room-users ile)
socket.on('user-joined', () => {
  updateParticipantCount();
});

socket.on('user-left', (userId) => {
  removeRemoteVideo(userId);
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

  if (chatMessages) chatMessages.innerHTML = '';
  if (chatPanel) chatPanel.classList.add('hidden');
  if (gameResetModal) gameResetModal.classList.add('hidden');
  closeHeaderMenu();
  gamePanel?.classList.add('game-panel-collapsed');
  gamePanelOverlay?.classList.add('hidden');
  pendingGame = null;
  showGameView('catalog');
  renderGameState(null);
  renderBattleshipState(null);

  if (currentRoomId) {
    socket.emit('leave-room');
  }

  currentRoomId = null;
  conference.classList.add('hidden');
  lobby.classList.remove('hidden');
  roomIdInput.value = generateRoomId();
  connectionStatus.textContent = 'Bağlanıyor...';
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
  const muteIconEl = document.getElementById('muteIcon');
  const videoIconEl = document.getElementById('videoIcon');
  const muteIconMenuEl = document.getElementById('muteIconMenu');
  const videoIconMenuEl = document.getElementById('videoIconMenu');
  const muteIcon = !hasAudio ? '🔇' : (isMuted ? '🔇' : '🎤');
  const videoIcon = !hasVideo ? '📷' : (isVideoOff ? '📷' : '📹');
  if (muteIconEl) muteIconEl.textContent = muteIcon;
  if (muteIconMenuEl) muteIconMenuEl.textContent = muteIcon;
  if (videoIconEl) videoIconEl.textContent = videoIcon;
  if (videoIconMenuEl) videoIconMenuEl.textContent = videoIcon;
  if (toggleMuteBtn) toggleMuteBtn.title = !hasAudio ? 'Mikrofonu aç' : (isMuted ? 'Sesi aç' : 'Sesi kapat');
  if (toggleVideoBtn) toggleVideoBtn.title = !hasVideo ? 'Kamerayı aç' : (isVideoOff ? 'Kamerayı aç' : 'Kamerayı kapat');
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

// Ekran paylaşımı
screenShareBtn.addEventListener('click', async () => {
  try {
    if (isScreenSharing) {
      const screenTrack = localStream?.getVideoTracks().find(t => t.label.includes('screen'));
      if (screenTrack) {
        screenTrack.stop();
        try {
          const videoTrack = await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getVideoTracks()[0]);
          localStream.addTrack(videoTrack);
          Object.values(peerConnections).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(videoTrack);
          });
        } catch (_) {}
        updateMediaButtons();
      }
      isScreenSharing = false;
      screenShareBtn.title = 'Ekran paylaş';
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const oldTrack = localStream?.getVideoTracks()[0];
      if (oldTrack) {
        localStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      localStream.addTrack(screenTrack);

      Object.values(peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
        else pc.addTrack(screenTrack, localStream);
      });

      screenTrack.onended = () => screenShareBtn.click();
      isScreenSharing = true;
      screenShareBtn.title = 'Ekran paylaşımını durdur';
    }
  } catch (err) {
    console.error('Ekran paylaşım hatası:', err);
  }
});
