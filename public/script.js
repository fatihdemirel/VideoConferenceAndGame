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

// State
let localStream = null;
let peerConnections = {};
let iceCandidateQueue = {}; // userId -> [candidates] (remote description gelmeden önce buffer)
let currentRoomId = null;
let isMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
const audioAnalysers = {}; // participantId -> { context, analyser, source, animationId }

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
});

function getConferenceUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  return url.toString();
}

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
    const stream = event.streams?.[0] || event.stream;
    if (stream) {
      addRemoteVideo(userId, stream);
      if (stream.getAudioTracks().length) setupAudioLevelDetection(userId, stream);
      if (track.kind === 'video') {
        track.onmute = () => showRemotePlaceholder(userId);
        track.onunmute = () => {
          const w = document.getElementById(`remote-${userId}`);
          const s = w?.querySelector('video')?.srcObject;
          if (s) addRemoteVideo(userId, s);
        };
        track.onended = () => showRemotePlaceholder(userId);
        if (track.muted) showRemotePlaceholder(userId);
      }
      stream.onremovetrack = (e) => {
        if (e.track.kind === 'video') showRemotePlaceholder(userId);
      };
    }
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
    // Sadece kurulmuş bağlantıda yeniden müzakere (track eklendiğinde)
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
      wrapper.insertBefore(video, wrapper.querySelector('.video-label'));
    }
    video.srcObject = stream;
    video.style.display = 'block';
    video.play().catch(() => {});
    if (placeholder) placeholder.style.display = 'none';
    let remoteAudio = wrapper.querySelector('.remote-audio');
    if (remoteAudio) remoteAudio.remove();
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
    if (v) v.style.display = 'none';

    if (stream?.getAudioTracks().length) {
      let remoteAudio = wrapper.querySelector('.remote-audio');
      if (!remoteAudio) {
        remoteAudio = document.createElement('audio');
        remoteAudio.className = 'remote-audio';
        remoteAudio.autoplay = true;
        remoteAudio.setAttribute('playsinline', '');
        wrapper.appendChild(remoteAudio);
      }
      remoteAudio.srcObject = stream;
      remoteAudio.play().catch(() => {});
    }
  }

  if (stream?.getAudioTracks().length) setupAudioLevelDetection(userId, stream);
}

// Uzak katılımcıda kamera kapatıldığında placeholder göster
function showRemotePlaceholder(userId) {
  const wrapper = document.getElementById(`remote-${userId}`);
  if (!wrapper) return;
  let placeholder = wrapper.querySelector('.video-placeholder');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    placeholder.innerHTML = `<span class="placeholder-initial">${getParticipantInitial(userId)}</span><span class="placeholder-name">${getParticipantDisplayName(userId)}</span>`;
    wrapper.insertBefore(placeholder, wrapper.querySelector('.video-label'));
  }
  placeholder.style.display = 'flex';
  const v = wrapper.querySelector('video');
  if (v) v.style.display = 'none';
}

// Uzak videoyu kaldır
function removeRemoteVideo(userId) {
  stopAudioLevelDetection(userId);
  const wrapper = document.getElementById(`remote-${userId}`);
  if (wrapper) wrapper.remove();
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

// Medya butonlarını güncelle
function updateLocalVideoPlaceholder() {
  const hasVideo = localStream?.getVideoTracks().some(t => t.enabled) ?? false;
  const placeholder = document.getElementById('localPlaceholder');
  if (placeholder) {
    placeholder.style.display = hasVideo ? 'none' : 'flex';
  }
  if (localVideo) {
    localVideo.style.display = hasVideo ? 'block' : 'none';
  }
}

function updateMediaButtons() {
  const hasAudio = localStream?.getAudioTracks().length > 0;
  const hasVideo = localStream?.getVideoTracks().length > 0;
  document.getElementById('muteIcon').textContent = !hasAudio ? '🔇' : (isMuted ? '🔇' : '🎤');
  document.getElementById('videoIcon').textContent = !hasVideo ? '📷' : (isVideoOff ? '📷' : '📹');
  toggleMuteBtn.title = !hasAudio ? 'Mikrofonu aç' : (isMuted ? 'Sesi aç' : 'Sesi kapat');
  toggleVideoBtn.title = !hasVideo ? 'Kamerayı aç' : (isVideoOff ? 'Kamerayı aç' : 'Kamerayı kapat');
  updateLocalVideoPlaceholder();
}

// Eklenen track'leri tüm peer connections'a yayımla (renegotiation tetiklenir)
function addTrackToPeerConnections(track, stream) {
  Object.entries(peerConnections).forEach(([userId, pc]) => {
    const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
    if (sender) sender.replaceTrack(track);
    else pc.addTrack(track, stream);
  });
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
  promise.then(stream => {
    const track = type === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
    localStream.addTrack(track);
    addTrackToPeerConnections(track, localStream);
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
    addTrackToPeerConnections(track, localStream);
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
    promise.then(stream => {
      const track = stream.getAudioTracks()[0];
      localStream.addTrack(track);
      addTrackToPeerConnections(track, localStream);
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
  document.getElementById('muteIcon').textContent = isMuted ? '🔇' : '🎤';
  toggleMuteBtn.title = isMuted ? 'Sesi aç' : 'Sesi kapat';
});

// Kamera aç/kapa - mobilde getUserMedia tıklamada HEMEN çağrılmalı (await öncesi)
toggleVideoBtn.addEventListener('click', () => {
  const hasVideo = localStream?.getVideoTracks().length > 0;
  if (!hasVideo) {
    const promise = navigator.mediaDevices.getUserMedia({ video: true });
    promise.then(stream => {
      const track = stream.getVideoTracks()[0];
      localStream.addTrack(track);
      addTrackToPeerConnections(track, localStream);
      updateMediaButtons();
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
  document.getElementById('videoIcon').textContent = isVideoOff ? '📷' : '📹';
  toggleVideoBtn.title = isVideoOff ? 'Kamerayı aç' : 'Kamerayı kapat';
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
