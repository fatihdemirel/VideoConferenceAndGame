const socket = io();
const cameraNameInput = document.getElementById('cameraName');
const cameraPasswordInput = document.getElementById('cameraPassword');
const startButton = document.getElementById('startPublishing');
const stopButton = document.getElementById('stopPublishing');
const cameraStatus = document.getElementById('cameraStatus');
const dialogStatus = document.getElementById('publishDialogStatus');
const cameraList = document.getElementById('cameraList');
const feedCount = document.getElementById('feedCount');
const emptyState = document.getElementById('emptyState');
const publishLauncher = document.getElementById('publishLauncher');
const publisherDashboard = document.getElementById('publisherDashboard');
const publisherViewerCount = document.getElementById('publisherViewerCount');
const publishDialog = document.getElementById('publishDialog');
const publishForm = document.getElementById('publishForm');
const openPublishDialogButton = document.getElementById('openPublishDialog');
const closePublishDialogButton = document.getElementById('closePublishDialog');
const cancelPublishDialogButton = document.getElementById('cancelPublishDialog');
const watchPasswordDialog = document.getElementById('watchPasswordDialog');
const watchPasswordForm = document.getElementById('watchPasswordForm');
const watchPasswordInput = document.getElementById('watchPassword');
const watchPasswordCameraName = document.getElementById('watchPasswordCameraName');
const watchPasswordStatus = document.getElementById('watchPasswordStatus');
const submitWatchPasswordButton = document.getElementById('submitWatchPassword');
const closeWatchPasswordButton = document.getElementById('closeWatchPasswordDialog');
const cancelWatchPasswordButton = document.getElementById('cancelWatchPasswordDialog');

const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
const publisherPeers = new Map();
const viewerPeers = new Map();
const pendingPublisherIce = new Map();
const pendingViewerIce = new Map();
const remoteStreams = new Map();
const watchingCameraIds = new Set();
let activeCameras = [];
let localStream = null;
let isPublishing = false;
let pendingPasswordCameraId = null;

function setStatus(message, isError) {
  cameraStatus.textContent = message;
  cameraStatus.classList.toggle('is-error', Boolean(isError));
  dialogStatus.textContent = message;
  dialogStatus.classList.toggle('is-error', Boolean(isError));
}

function setWatchPasswordStatus(message, isError) {
  watchPasswordStatus.textContent = message;
  watchPasswordStatus.classList.toggle('is-error', Boolean(isError));
}

function closePeer(peerMap, pendingIce, peerId) {
  const peer = peerMap.get(peerId);
  if (peer) peer.close();
  peerMap.delete(peerId);
  pendingIce.delete(peerId);
}

function updatePublishControls() {
  publishLauncher.classList.toggle('hidden', isPublishing);
  publisherDashboard.classList.toggle('hidden', !isPublishing);
}

function renderCameraList() {
  cameraList.replaceChildren();
  feedCount.textContent = String(activeCameras.length);
  emptyState.classList.toggle('hidden', activeCameras.length > 0);
  const ownCamera = activeCameras.find((camera) => camera.id === socket.id);
  const viewerCount = ownCamera?.viewerCount || 0;
  publisherViewerCount.textContent = `${viewerCount} kişi izliyor`;

  activeCameras.forEach((camera) => {
    const isOwnCamera = camera.id === socket.id;
    const isWatching = watchingCameraIds.has(camera.id);
    const card = document.createElement('article');
    card.className = 'camera-card';

    const frame = document.createElement('div');
    frame.className = 'video-frame';
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    const stream = isOwnCamera ? localStream : remoteStreams.get(camera.id);
    if (stream) {
      video.srcObject = stream;
      video.classList.remove('hidden');
    } else {
      video.classList.add('hidden');
    }

    const placeholder = document.createElement('span');
    placeholder.className = 'video-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = '◎';
    placeholder.classList.toggle('hidden', Boolean(stream));

    const label = document.createElement('span');
    label.className = 'video-label';
    label.textContent = isOwnCamera ? 'SENİN YAYININ' : 'CANLI YAYIN';
    frame.append(video, placeholder, label);

    const body = document.createElement('div');
    body.className = 'camera-card-body';
    const title = document.createElement('h3');
    title.className = 'camera-card-title';
    title.textContent = camera.name;
    const meta = document.createElement('p');
    meta.className = 'camera-card-meta';
    meta.textContent = isOwnCamera
      ? `${camera.viewerCount} kişi izliyor · ${camera.requiresPassword ? 'Şifreli yayın' : 'Herkese açık yayın'}`
      : `${camera.viewerCount} kişi izliyor${camera.requiresPassword ? ' · Şifreli' : ''}`;
    body.append(title, meta);

    if (!isOwnCamera) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `button ${isWatching ? 'button-primary' : 'button-watch'}`;
      button.textContent = isWatching ? 'İzlemeyi bırak' :
        camera.requiresPassword ? 'Şifre ile izle' : 'Canlı izle';
      button.addEventListener('click', () => {
        if (isWatching) stopWatching(camera.id);
        else if (camera.requiresPassword) openWatchPasswordDialog(camera.id, camera.name);
        else watchCamera(camera.id);
      });
      body.append(button);
    }

    card.append(frame, body);
    cameraList.append(card);
  });
}

function closeAllPeers() {
  publisherPeers.forEach((peer) => peer.close());
  viewerPeers.forEach((peer) => peer.close());
  publisherPeers.clear();
  viewerPeers.clear();
  pendingPublisherIce.clear();
  pendingViewerIce.clear();
  remoteStreams.clear();
  watchingCameraIds.clear();
}

function stopPublishing(notifyServer) {
  const wasPublishing = isPublishing;
  isPublishing = false;
  if (notifyServer && wasPublishing && socket.connected) {
    socket.emit('camera-publish-stop');
  }
  publisherPeers.forEach((peer) => peer.close());
  publisherPeers.clear();
  pendingPublisherIce.clear();
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  updatePublishControls();
  renderCameraList();
}

function stopWatching(cameraId) {
  if (!watchingCameraIds.delete(cameraId)) return;
  if (socket.connected) socket.emit('camera-unwatch', cameraId);
  closePeer(viewerPeers, pendingViewerIce, cameraId);
  remoteStreams.delete(cameraId);
  renderCameraList();
}

function openWatchPasswordDialog(cameraId, cameraName, message = '') {
  if (!window.isSecureContext) {
    setStatus('Şifreli kameraları izlemek için HTTPS bağlantısı gerekir.', true);
    return;
  }
  if (watchPasswordDialog.open && pendingPasswordCameraId !== cameraId &&
      submitWatchPasswordButton.disabled) {
    setStatus('Önce devam eden şifre kontrolünü tamamla.', true);
    return;
  }
  const isAlreadyOpen = watchPasswordDialog.open;
  pendingPasswordCameraId = cameraId;
  watchPasswordCameraName.textContent = cameraName;
  watchPasswordInput.value = '';
  setWatchPasswordStatus(message, Boolean(message));
  submitWatchPasswordButton.disabled = false;
  closeWatchPasswordButton.disabled = false;
  cancelWatchPasswordButton.disabled = false;
  if (!isAlreadyOpen) watchPasswordDialog.showModal();
  watchPasswordInput.focus();
}

function watchCamera(cameraId, password = '') {
  if (password && !window.isSecureContext) {
    const message = 'Şifreli kameraları izlemek için HTTPS bağlantısı gerekir.';
    setStatus(message, true);
    setWatchPasswordStatus(message, true);
    submitWatchPasswordButton.disabled = false;
    closeWatchPasswordButton.disabled = false;
    cancelWatchPasswordButton.disabled = false;
    return;
  }
  if (!socket.connected) {
    const message = 'Sunucu bağlantısı kuruluyor. Biraz sonra tekrar dene.';
    setStatus(message, true);
    setWatchPasswordStatus(message, true);
    submitWatchPasswordButton.disabled = false;
    closeWatchPasswordButton.disabled = false;
    cancelWatchPasswordButton.disabled = false;
    return;
  }
  watchingCameraIds.add(cameraId);
  socket.volatile.emit('camera-watch', { publisherId: cameraId, password });
  renderCameraList();
}

async function addRemoteIce(peer, pendingMap, peerId, candidate) {
  try {
    if (peer.remoteDescription) {
      await peer.addIceCandidate(candidate);
      return;
    }
    const candidates = pendingMap.get(peerId) || [];
    candidates.push(candidate);
    pendingMap.set(peerId, candidates);
  } catch (error) {
    console.error('Kamera ICE adayı eklenemedi:', error);
  }
}

async function flushRemoteIce(peer, pendingMap, peerId) {
  const candidates = pendingMap.get(peerId) || [];
  pendingMap.delete(peerId);
  for (const candidate of candidates) {
    try {
      await peer.addIceCandidate(candidate);
    } catch (error) {
      console.error('Bekleyen kamera ICE adayı eklenemedi:', error);
    }
  }
}

async function createPublisherPeer(viewerId) {
  if (!localStream || publisherPeers.has(viewerId)) return;
  const peer = new RTCPeerConnection({ iceServers });
  publisherPeers.set(viewerId, peer);
  localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
  peer.onicecandidate = ({ candidate }) => {
    if (candidate) socket.volatile.emit('camera-signal-ice', { to: viewerId, candidate });
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
      const failed = peer.connectionState === 'failed';
      closePeer(publisherPeers, pendingPublisherIce, viewerId);
      if (failed) {
        setStatus('Bir izleyiciyle bağlantı kurulamadı.', true);
      }
    }
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.volatile.emit('camera-signal-offer', { to: viewerId, offer: peer.localDescription });
}

async function startPublishing() {
  const name = cameraNameInput.value.trim();
  if (!name) {
    setStatus('Lütfen kameraya bir ad ver.', true);
    cameraNameInput.focus();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Kamera erişimi için HTTPS bağlantısı veya localhost gereklidir.', true);
    return;
  }
  if (!socket.connected) {
    setStatus('Sunucu bağlantısı kuruluyor. Biraz sonra tekrar dene.', true);
    return;
  }

  startButton.disabled = true;
  setStatus('Kamera izni bekleniyor…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (!publishDialog.open) {
      stream.getTracks().forEach((track) => track.stop());
      setStatus('Kamera paylaşımı iptal edildi.');
      return;
    }
    if (!socket.connected) {
      stream.getTracks().forEach((track) => track.stop());
      setStatus('Sunucu bağlantısı kesildi. Yeniden bağlandıktan sonra kamerayı tekrar başlat.', true);
      return;
    }
    localStream = stream;
    isPublishing = true;
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (localStream === stream) stopPublishing(true);
      }, { once: true });
    });
    updatePublishControls();
    socket.volatile.emit('camera-publish-start', {
      name,
      password: cameraPasswordInput.value
    });
    cameraPasswordInput.value = '';
    publishDialog.close();
    setStatus('Kameran herkese açık yayınlanıyor.');
    renderCameraList();
  } catch (error) {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    isPublishing = false;
    updatePublishControls();
    const messages = {
      NotAllowedError: 'Kamera izni verilmedi. Tarayıcı ayarlarından izin verip tekrar dene.',
      NotFoundError: 'Bu cihazda kullanılabilir kamera bulunamadı.',
      NotReadableError: 'Kamera başka bir uygulama tarafından kullanılıyor.'
    };
    setStatus(messages[error.name] || `Kamera başlatılamadı: ${error.message || 'Bilinmeyen hata'}`, true);
  } finally {
    startButton.disabled = false;
  }
}

openPublishDialogButton.addEventListener('click', () => {
  setStatus('', false);
  publishDialog.showModal();
  cameraNameInput.focus();
});
closePublishDialogButton.addEventListener('click', () => publishDialog.close());
cancelPublishDialogButton.addEventListener('click', () => publishDialog.close());
publishDialog.addEventListener('close', () => {
  cameraPasswordInput.value = '';
});
publishForm.addEventListener('submit', (event) => {
  event.preventDefault();
  startPublishing();
});
const closeWatchPasswordDialog = () => watchPasswordDialog.close();
closeWatchPasswordButton.addEventListener('click', closeWatchPasswordDialog);
cancelWatchPasswordButton.addEventListener('click', closeWatchPasswordDialog);
watchPasswordDialog.addEventListener('close', () => {
  pendingPasswordCameraId = null;
  watchPasswordInput.value = '';
  setWatchPasswordStatus('', false);
  submitWatchPasswordButton.disabled = false;
  closeWatchPasswordButton.disabled = false;
  cancelWatchPasswordButton.disabled = false;
});
watchPasswordDialog.addEventListener('cancel', (event) => {
  if (submitWatchPasswordButton.disabled) event.preventDefault();
});
watchPasswordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingPasswordCameraId) return;
  submitWatchPasswordButton.disabled = true;
  closeWatchPasswordButton.disabled = true;
  cancelWatchPasswordButton.disabled = true;
  setWatchPasswordStatus('Şifre kontrol ediliyor…', false);
  watchCamera(pendingPasswordCameraId, watchPasswordInput.value);
});
stopButton.addEventListener('click', () => {
  stopPublishing(true);
  setStatus('Kamera yayını durduruldu.');
});

socket.on('connect', () => {
  socket.emit('camera-list-request');
  setStatus('Sunucuya bağlandı. Paylaşılan kameralar güncel.');
});

socket.on('disconnect', () => {
  stopPublishing(false);
  closeAllPeers();
  activeCameras = [];
  renderCameraList();
  if (watchPasswordDialog.open) watchPasswordDialog.close();
  setStatus('Bağlantı kesildi. Sunucuya yeniden bağlanılıyor…', true);
});

socket.on('camera-list', (cameras) => {
  activeCameras = Array.isArray(cameras) ? cameras : [];
  const activeIds = new Set(activeCameras.map((camera) => camera.id));
  if (pendingPasswordCameraId && !activeIds.has(pendingPasswordCameraId) &&
      watchPasswordDialog.open && !submitWatchPasswordButton.disabled) {
    watchPasswordDialog.close();
    setStatus('Bu kamera yayını artık kullanılabilir değil.', true);
  }
  [...watchingCameraIds].forEach((cameraId) => {
    if (!activeIds.has(cameraId)) stopWatching(cameraId);
  });
  renderCameraList();
});

socket.on('camera-publish-started', () => {
  setStatus('Kameran herkese açık yayınlanıyor.');
});

socket.on('camera-publish-error', (message) => {
  stopPublishing(false);
  setStatus(message || 'Kamera yayını başlatılamadı.', true);
});

socket.on('camera-watch-started', ({ publisherId } = {}) => {
  if (publisherId) {
    if (pendingPasswordCameraId === publisherId && watchPasswordDialog.open) {
      watchPasswordDialog.close();
    }
    setStatus('Kameraya bağlanılıyor…');
    renderCameraList();
  }
});

socket.on('camera-watch-password-required', ({ publisherId, message } = {}) => {
  if (!publisherId) return;
  watchingCameraIds.delete(publisherId);
  renderCameraList();
  const camera = activeCameras.find((item) => item.id === publisherId);
  if (!camera) {
    setStatus(message || 'Kamera bulunamadı.', true);
    return;
  }
  if (watchPasswordDialog.open && pendingPasswordCameraId === publisherId) {
    setWatchPasswordStatus(message || 'Bu kamerayı izlemek için şifre gir.', true);
    watchPasswordInput.value = '';
    submitWatchPasswordButton.disabled = false;
    closeWatchPasswordButton.disabled = false;
    cancelWatchPasswordButton.disabled = false;
    watchPasswordInput.focus();
  } else {
    openWatchPasswordDialog(
      publisherId,
      camera.name,
      message || 'Bu kamerayı izlemek için şifre gir.'
    );
  }
});

socket.on('camera-watch-error', ({ publisherId, message } = {}) => {
  if (publisherId) {
    watchingCameraIds.delete(publisherId);
    closePeer(viewerPeers, pendingViewerIce, publisherId);
    remoteStreams.delete(publisherId);
    if (watchPasswordDialog.open && pendingPasswordCameraId === publisherId) {
      watchPasswordDialog.close();
    }
    renderCameraList();
  }
  setStatus(message || 'Kameraya bağlanılamadı.', true);
});

socket.on('camera-watch-request', async ({ viewerId } = {}) => {
  if (!viewerId || !localStream) return;
  try {
    await createPublisherPeer(viewerId);
  } catch (error) {
    closePeer(publisherPeers, pendingPublisherIce, viewerId);
    setStatus(`İzleyici bağlantısı kurulamadı: ${error.message}`, true);
  }
});

socket.on('camera-signal-offer', async ({ from, offer } = {}) => {
  if (!from || !offer || !watchingCameraIds.has(from)) return;
  const previousPeer = viewerPeers.get(from);
  if (previousPeer) previousPeer.close();
  viewerPeers.delete(from);
  const peer = new RTCPeerConnection({ iceServers });
  viewerPeers.set(from, peer);
  peer.onicecandidate = ({ candidate }) => {
    if (candidate) socket.volatile.emit('camera-signal-ice', { to: from, candidate });
  };
  peer.ontrack = ({ streams, track }) => {
    let stream = streams[0];
    if (!stream) {
      stream = remoteStreams.get(from) || new MediaStream();
      stream.addTrack(track);
    }
    remoteStreams.set(from, stream);
    renderCameraList();
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
      const failed = peer.connectionState === 'failed';
      closePeer(viewerPeers, pendingViewerIce, from);
      remoteStreams.delete(from);
      renderCameraList();
      if (failed) {
        setStatus('Kamera bağlantısı başarısız oldu. Tekrar deneyebilirsin.', true);
      }
    }
  };

  try {
    await peer.setRemoteDescription(offer);
    await flushRemoteIce(peer, pendingViewerIce, from);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.volatile.emit('camera-signal-answer', { to: from, answer: peer.localDescription });
    setStatus('Canlı kamera izleniyor.');
  } catch (error) {
    closePeer(viewerPeers, pendingViewerIce, from);
    setStatus(`Kamera bağlantısı kurulamadı: ${error.message}`, true);
  }
});

socket.on('camera-signal-answer', async ({ from, answer } = {}) => {
  const peer = publisherPeers.get(from);
  if (!peer || !answer) return;
  try {
    await peer.setRemoteDescription(answer);
    await flushRemoteIce(peer, pendingPublisherIce, from);
  } catch (error) {
    closePeer(publisherPeers, pendingPublisherIce, from);
    setStatus(`İzleyici bağlantısı kurulamadı: ${error.message}`, true);
  }
});

socket.on('camera-signal-ice', ({ from, candidate } = {}) => {
  if (!from || !candidate) return;
  const publisherPeer = publisherPeers.get(from);
  if (publisherPeer) {
    addRemoteIce(publisherPeer, pendingPublisherIce, from, candidate);
    return;
  }
  const viewerPeer = viewerPeers.get(from);
  if (viewerPeer) {
    addRemoteIce(viewerPeer, pendingViewerIce, from, candidate);
    return;
  }
  const candidates = pendingViewerIce.get(from) || [];
  candidates.push(candidate);
  pendingViewerIce.set(from, candidates);
});

socket.on('camera-watcher-ended', ({ viewerId } = {}) => {
  if (viewerId) closePeer(publisherPeers, pendingPublisherIce, viewerId);
});

socket.on('camera-publisher-ended', ({ publisherId } = {}) => {
  if (!publisherId) return;
  watchingCameraIds.delete(publisherId);
  closePeer(viewerPeers, pendingViewerIce, publisherId);
  remoteStreams.delete(publisherId);
  renderCameraList();
});

window.addEventListener('pagehide', () => stopPublishing(true));
