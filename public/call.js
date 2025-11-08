// === CONFIG ===
const API_BASE_URL = 'https://bazukastore.com/api';
const SOCKET_URL = 'https://bazukastore.com';
const MAX_RETRIES = 5;
const CALL_TIMEOUT = 45000;
const OFFER_WAIT_TIMEOUT = 8000;
const PING_INTERVAL = 3000;
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

// === ELEMENTS ===
const elements = {
  avatar: document.getElementById('call-avatar'),
  avatarImg: document.getElementById('avatar-img'),
  avatarLetter: document.getElementById('avatar-letter'),
  title: document.getElementById('call-title'),
  status: document.getElementById('call-status'),
  timer: document.getElementById('call-timer'),
  spinner: document.getElementById('loading-spinner'),
  accept: document.getElementById('accept-call'),
  decline: document.getElementById('decline-call'),
  mute: document.getElementById('mute-btn'),
  speaker: document.getElementById('speaker-btn'),
  end: document.getElementById('end-call'),
  retry: document.getElementById('retry-mic'),
  back: document.getElementById('back-to-chat'),
  canvas: document.getElementById('bg-canvas'),
  localSoundWaveCanvas: document.getElementById('local-sound-wave-canvas'),
  remoteSoundWaveCanvas: document.getElementById('remote-sound-wave-canvas'),
  avatarSoundCanvas: document.getElementById('avatar-sound-canvas'),
  remoteAudio: document.getElementById('remote-audio'),
  ringtone: document.getElementById('ringtone'),
  network: document.getElementById('network-indicator'),
  debug: document.getElementById('debug-info'),
  reconnectInfo: document.getElementById('reconnect-info'),
  reconnectAttempt: document.getElementById('reconnect-attempt')
};

// === STATE ===
let callId = null, type = null, chatId = null, callerName = null, recipientName = null;
let callState = 'init';
let localStream = null, peer = null, timerId = null, retryCount = 0;
let isMuted = false, pendingOffer = null;
let socket = null;
let localCtx = null, remoteCtx = null, avatarCtx = null;
let localAnalyser = null, remoteAnalyser = null, avatarAnalyser = null;
let localDataArray = null, remoteDataArray = null, avatarDataArray = null;
let localAnimationId = null, remoteAnimationId = null, avatarAnimationId = null;
let recipientId = null;
let callerAvatar = null, recipientAvatar = null;
let connectionCheckInterval = null;
let endReason = '';
let networkQuality = 'good';
let reconnectAttempts = 0;
let isReconnecting = false;
let lastIceState = 'new';

// Throttle vars for perf
let resizeTimeout;
let lastAnimationFrame = 0;

// === CANVAS CONTEXT ===
let ctx = null;
if (elements.canvas) {
  ctx = elements.canvas.getContext('2d');
}

// === DEBUG (Only show in dev) ===
function log(msg) {
  console.log('[CALL]', msg);
  // Only show debug UI in localhost/dev env
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    elements.debug.textContent = msg;
    elements.debug.style.display = 'block';
    setTimeout(() => elements.debug.style.display = 'none', 3000);
  }
}

// === INIT ===
feather.replace(); // Only call once on load
resizeCanvas();
window.addEventListener('resize', () => {
  // Debounce resize for perf
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(resizeCanvas, 250);
});

function resizeCanvas() {
  if (elements.canvas) {
    elements.canvas.width = innerWidth;
    elements.canvas.height = innerHeight;
    if (ctx) drawStaticBackground();
  }
  if (localCtx) {
    localCtx.canvas.width = elements.localSoundWaveCanvas.offsetWidth;
    localCtx.canvas.height = elements.localSoundWaveCanvas.offsetHeight;
  }
  if (remoteCtx) {
    remoteCtx.canvas.width = elements.remoteSoundWaveCanvas.offsetWidth;
    remoteCtx.canvas.height = elements.remoteSoundWaveCanvas.offsetHeight;
  }
  if (avatarCtx) {
    const s = elements.avatar.offsetWidth * 1.2;
    avatarCtx.canvas.width = s;
    avatarCtx.canvas.height = s;
  }
}

function drawStaticBackground() {
  if (!ctx) return;
  const g = ctx.createRadialGradient(innerWidth/2, innerHeight/2, 0, innerWidth/2, innerHeight/2, Math.max(innerWidth, innerHeight));
  g.addColorStop(0, 'rgba(124, 58, 237, 0.8)');
  g.addColorStop(0.5, 'rgba(245, 158, 11, 0.6)');
  g.addColorStop(1, 'rgba(239, 68, 68, 0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
}

// === SOCKET WITH SMART RECONNECT ===
function initSocket() {
  socket = io(SOCKET_URL, {
    auth: { token: `Bearer ${localStorage.getItem('token') || ''}` },
    transports: ['websocket'],
    reconnection: false, // We'll handle manually
    timeout: 20000,
    forceNew: true
  });

  socket.on('connect', () => {
    log('Socket connected');
    networkQuality = 'good';
    elements.network.textContent = 'Connected';
    elements.network.className = 'network-indicator connected';
    elements.network.style.display = 'flex';
    hideReconnectUI();
    reconnectAttempts = 0;
    isReconnecting = false;
    updateNetworkStatus();
    if (type === 'outgoing' && callState === 'init') startCall();
    if (pendingOffer && callState === 'accepting') answerCall();
  });

  socket.on('disconnect', (reason) => {
    log('Socket disconnected: ' + reason);
    networkQuality = 'poor';
    elements.network.textContent = 'Reconnecting...';
    elements.network.className = 'network-indicator disconnected';
    if (callState === 'active' || callState === 'connecting') {
      startReconnect();
    }
  });

  socket.on('connect_error', (err) => {
    log('Connect error: ' + err.message);
    if (callState === 'active' || callState === 'connecting') {
      startReconnect();
    }
  });

  socket.on('reconnect', () => {
    log('Socket reconnected');
    networkQuality = 'good';
    updateNetworkStatus();
    hideReconnectUI();
  });

  socket.on('reconnect_failed', () => {
    log('Reconnect failed permanently');
    endCall('Connection lost');
  });

  // Call events
  socket.on('incoming-call', (data) => {
    if (data.callId === callId && type === 'incoming') {
      callState = 'ringing';
      elements.spinner.style.display = 'none';
      updateUI();
      playRingtone();
    }
  });

  socket.on('call-offer', async ({ callId: id, offer }) => {
    if (id !== callId || !['ringing', 'accepting'].includes(callState)) return;
    pendingOffer = offer;
    if (callState === 'accepting') await answerCall();
  });

  socket.on('call-accepted', async ({ callId: id, answer }) => {
    if (id !== callId || callState !== 'connecting') return;
    try {
      log('Remote SDP received');
      await peer.setRemoteDescription(answer);
      log('Remote SDP set');
      callState = 'active';
      document.body.classList.add('call-active');
      stopRingtone();
      startTimer();
      startAnimations();
      updateUI();
      log('CALL ACTIVE');
    } catch (e) {
      log('Answer failed: ' + e.message);
      endCall('Setup failed');
    }
  });

  socket.on('ice-candidate', async ({ callId: id, candidate }) => {
    if (id !== callId || !peer) return;
    try {
      if (peer.remoteDescription) {
        await peer.addIceCandidate(candidate);
      }
    } catch (e) {
      log('ICE error (ignored): ' + e.message);
    }
  });

  socket.on('call-declined', () => endCall('Declined'));
  socket.on('call-ended', () => endCall('Ended by peer'));

  // Ping for network quality
  connectionCheckInterval = setInterval(() => {
    if (socket && socket.connected && (callState === 'active')) {
      const start = Date.now();
      socket.emit('ping', { callId }, (r) => {
        const latency = Date.now() - start;
        if (r?.status === 'pong') {
          if (latency < 150) networkQuality = 'good';
          else if (latency < 400) networkQuality = 'fair';
          else networkQuality = 'poor';
        } else {
          networkQuality = 'poor';
        }
        updateNetworkStatus();
      });
    }
  }, PING_INTERVAL);
}

function startReconnect() {
  if (isReconnecting || reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) return;
  isReconnecting = true;
  reconnectAttempts++;
  elements.reconnectInfo.style.display = 'block';
  elements.reconnectAttempt.textContent = reconnectAttempts;

  log(`Reconnect attempt ${reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS}`);

  setTimeout(() => {
    if (reconnectAttempts < RECONNECT_MAX_ATTEMPTS) {
      socket.connect();
    } else {
      hideReconnectUI();
      endCall('Offline – no connection');
    }
  }, RECONNECT_DELAY);
}

function hideReconnectUI() {
  elements.reconnectInfo.style.display = 'none';
}

function updateNetworkStatus() {
  if (callState !== 'active') return;
  const statusEl = elements.status;
  if (networkQuality === 'good') {
    statusEl.className = 'call-status connected';
    statusEl.textContent = 'Excellent connection';
  } else if (networkQuality === 'fair') {
    statusEl.className = 'call-status network-weak';
    statusEl.textContent = 'Fair connection';
  } else {
    statusEl.className = 'call-status network-weak';
    statusEl.textContent = 'Poor connection – reconnecting...';
  }
}

// === WEBRTC WITH ICE RESTART ON FAILURE ===
function createPeer() {
  peer = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  });

  // Reverted to original ontrack logic
  peer.ontrack = (e) => {
    log(`REMOTE TRACK ADDED: ${e.track.kind}`);
    const stream = e.streams[0];
    elements.remoteAudio.srcObject = stream;
    elements.remoteAudio.muted = false;
    elements.remoteAudio.volume = 1.0;
    elements.remoteAudio.play().catch(err => log('Play blocked: ' + err.message));
    initRemoteVisualizer();
    initAvatarVisualizer();
  };

  peer.onconnectionstatechange = () => {
    const state = peer.connectionState;
    log('ICE: ' + state);
    if (state === 'failed') {
      if (callState === 'active' && reconnectAttempts < RECONNECT_MAX_ATTEMPTS) {
        log('ICE failed – attempting restart');
        restartIce();
      } else {
        endCall('Connection failed');
      }
    } else if (state === 'connected') {
      networkQuality = 'good';
      updateNetworkStatus();
    }
  };

  peer.oniceconnectionstatechange = () => {
    const iceState = peer.iceConnectionState;
    if (iceState === 'failed' && lastIceState !== 'failed') {
      restartIce();
    }
    lastIceState = iceState;
  };

  peer.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('ice-candidate', { callId, candidate: e.candidate.toJSON() });
    }
  };

  return peer;
}

async function restartIce() {
  if (!peer || callState !== 'active') return;
  try {
    const offer = await peer.createOffer({ iceRestart: true });
    await peer.setLocalDescription(offer);
    socket.emit('ice-restart', { callId, offer });
    log('ICE restart initiated');
  } catch (e) {
    log('ICE restart failed: ' + e.message);
  }
}

// === SOUND WAVES (Your original placeholders - throttled for perf) ===
function initAvatarVisualizer() { /* ... same as before ... */ }
function startAvatarSoundDance() {
  if (avatarAnimationId) cancelAnimationFrame(avatarAnimationId);
  let lastFrame = 0;
  function animate(time) {
    if (time - lastFrame > 16) { // Throttle to ~60fps
      // ... (your original drawAvatarWave(vol) call here)
      lastFrame = time;
    }
    avatarAnimationId = requestAnimationFrame(animate);
  }
  animate(0);
}
function drawAvatarWave(vol) { /* ... same ... */ }
function initLocalVisualizer() { /* ... same ... */ }
function startLocalSoundWaveAnimation() {
  if (localAnimationId) cancelAnimationFrame(localAnimationId);
  let lastFrame = 0;
  function animate(time) {
    if (time - lastFrame > 16) { // Throttle
      // ... (your original local wave draw)
      lastFrame = time;
    }
    localAnimationId = requestAnimationFrame(animate);
  }
  animate(0);
}
function initRemoteVisualizer() { /* ... same ... */ }
function startRemoteSoundWaveAnimation() {
  if (remoteAnimationId) cancelAnimationFrame(remoteAnimationId);
  let lastFrame = 0;
  function animate(time) {
    if (time - lastFrame > 16) { // Throttle
      // ... (your original remote wave draw)
      lastFrame = time;
    }
    remoteAnimationId = requestAnimationFrame(animate);
  }
  animate(0);
}

// === MEDIA ===
async function getMic() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 1
      }
    });
    retryCount = 0;
    log('Mic granted');
    return localStream;
  } catch (err) {
    log('Mic denied: ' + err.message);
    handleMicError(err);
    return null;
  }
}

function handleMicError(err) {
  if (retryCount++ < MAX_RETRIES) setTimeout(() => requestMic(type === 'outgoing'), 3000);
  else endCall('Mic access failed');
}

// === CALL FLOW ===
async function requestMic(isOutgoing) {
  elements.retry.style.display = 'flex';
  elements.status.textContent = 'Requesting microphone...';
  const stream = await getMic();
  if (!stream) return;
  elements.retry.style.display = 'none';
  elements.status.textContent = 'Preparing call...';

  peer = createPeer();
  stream.getTracks().forEach(track => {
    peer.addTrack(track, stream);
    log(`Added local track: ${track.kind}`);
  });
  initLocalVisualizer();

  if (isOutgoing) {
    callState = 'connecting';
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    if (socket?.connected) {
      socket.emit('call-user', { recipientUserId: recipientId, offer, callId });
      log('Offer sent');
    }
    updateUI();
  }
}

async function startCall() {
  if (!recipientId || !socket?.connected) {
    setTimeout(startCall, 2000);
    return;
  }
  await requestMic(true);
}

async function answerCall() {
  if (!pendingOffer || !peer) return;
  try {
    await peer.setRemoteDescription(pendingOffer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    if (socket?.connected) {
      socket.emit('accept-call', { callId, answer });
      log('Answer sent');
    }
    callState = 'active';
    document.body.classList.add('call-active');
    startTimer();
    startAnimations();
    updateUI();
    pendingOffer = null;
  } catch (err) {
    log('Answer failed: ' + err.message);
    endCall('Answer failed');
  }
}

// Reverted to original ringtone functions
function playRingtone() {
  elements.ringtone.volume = 0.5;
  elements.ringtone.play().catch(() => {});
}
function stopRingtone() {
  elements.ringtone.pause();
  elements.ringtone.currentTime = 0;
}

// === UI ===
function updateUI() {
  const name = type === 'outgoing' ? recipientName : callerName;
  const avatarUrl = type === 'outgoing' ? recipientAvatar : callerAvatar;
  if (avatarUrl) {
    elements.avatarImg.src = avatarUrl;
    elements.avatarImg.style.display = 'block';
    elements.avatarLetter.style.display = 'none';
  } else {
    elements.avatarLetter.textContent = name?.[0]?.toUpperCase() || 'U';
  }

  elements.avatar.classList.toggle('ringing', callState === 'ringing');
  elements.avatar.classList.toggle('connecting', callState === 'connecting');
  elements.back.style.display = ['connecting', 'ringing', 'active'].includes(callState) ? 'flex' : 'none';
  elements.accept.style.display = callState === 'ringing' ? 'flex' : 'none';
  elements.decline.style.display = callState === 'ringing' ? 'flex' : 'none';
  elements.mute.style.display = callState === 'active' ? 'flex' : 'none';
  elements.speaker.style.display = callState === 'active' ? 'flex' : 'none';
  elements.end.style.display = ['connecting', 'active'].includes(callState) ? 'flex' : 'none';
  elements.retry.style.display = retryCount > 0 && callState !== 'active' ? 'flex' : 'none';
  elements.mute.classList.toggle('muted', isMuted);
  elements.status.classList.remove('connected', 'network-weak');

  let titleText, statusText;
  switch (callState) {
    case 'init':
      titleText = 'Starting call...';
      statusText = 'Initializing...';
      elements.spinner.style.display = 'block';
      break;
    case 'connecting':
      titleText = `Calling ${recipientName || 'contact'}...`;
      statusText = 'Ringing...';
      elements.spinner.style.display = 'block';
      break;
    case 'accepting':
      titleText = 'Connecting...';
      statusText = 'Setting up audio...';
      elements.spinner.style.display = 'block';
      break;
    case 'ringing':
      titleText = `${callerName || 'Someone'} is calling`;
      statusText = 'Tap to accept';
      elements.spinner.style.display = 'none';
      break;
    case 'active':
      titleText = name || 'Contact';
      elements.spinner.style.display = 'none';
      updateNetworkStatus();
      return;
    case 'ended':
      titleText = 'Call Ended';
      statusText = 'Returning to chat...';
      elements.spinner.style.display = 'none';
      break;
  }
  elements.title.textContent = titleText;
  elements.status.textContent = statusText;
  // Feather replace only if needed (perf fix: not on every update)
  if (callState === 'active' || callState === 'ringing') feather.replace();
}

function startTimer() {
  let sec = 0;
  elements.timer.style.display = 'block';
  timerId = setInterval(() => {
    sec++;
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    elements.timer.textContent = `${m}:${s}`;
  }, 1000);
}

function startAnimations() {
  if (callState === 'active') {
    startLocalSoundWaveAnimation();
    startRemoteSoundWaveAnimation();
    startAvatarSoundDance();
  }
}

function endCall(reason = 'Ended') {
  endReason = reason;
  callState = 'ended';
  clearInterval(timerId);
  clearInterval(connectionCheckInterval);
  stopRingtone();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (peer) peer.close();
  // Cancel all animation frames for cleanup
  if (localAnimationId) cancelAnimationFrame(localAnimationId);
  if (remoteAnimationId) cancelAnimationFrame(remoteAnimationId);
  if (avatarAnimationId) cancelAnimationFrame(avatarAnimationId);
  document.body.classList.remove('call-active');
  hideReconnectUI();
  if (callId && socket?.connected) socket.emit('end-call', { callId, reason });
  updateUI();
  setTimeout(() => {
    location.href = chatId ? `/chat.html?chatId=${chatId}` : '/chat-list.html';
  }, 2000);
}

// === EVENTS ===
elements.accept.onclick = async () => {
  if (callState !== 'ringing') return;
  callState = 'accepting';
  stopRingtone();
  updateUI();
  await requestMic(false);
  const wait = new Promise(r => {
    const check = () => pendingOffer ? r() : setTimeout(check, 200);
    check();
  });
  try {
    await Promise.race([wait, new Promise((_, rej) => setTimeout(() => rej(), OFFER_WAIT_TIMEOUT))]);
    await answerCall();
  } catch {
    endCall('Signal timeout');
  }
};

// Immediate stop on decline (kept this fix)
elements.decline.onclick = () => {
  stopRingtone(); // Immediate stop - no more 2s scream
  socket.emit('decline-call', { callId });
  endCall('Declined');
};

// Reverted to original mute (no extra logs/checks)
elements.mute.onclick = () => {
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  elements.mute.innerHTML = isMuted ? '<i data-feather="mic-off"></i>' : '<i data-feather="mic"></i>';
  feather.replace();
};

elements.end.onclick = () => endCall('Ended by user');
elements.back.onclick = () => confirm('End call?') && endCall('Back to chat');
elements.retry.onclick = () => {
  retryCount = 0;
  requestMic(type === 'outgoing');
};

// === STARTUP ===
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  callId = params.get('callId');
  type = params.get('type');
  chatId = params.get('chatId');
  callerName = decodeURIComponent(params.get('callerName') || '').trim();
  callerAvatar = params.get('callerAvatar') || null;
  if (!callId || !type || !chatId) return setTimeout(() => location.href = '/chat-list.html', 2000);
  const token = localStorage.getItem('token');
  if (!token) return setTimeout(() => location.href = '/login.html', 2000);
  elements.network.style.display = 'flex';
  try {
    const [callRes, profileRes] = await Promise.all([
      fetch(`${API_BASE_URL}/calls/${callId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (!callRes.ok || !profileRes.ok) throw new Error('Validation failed');
    if (type === 'outgoing') {
      const chatRes = await fetch(`${API_BASE_URL}/chats/${chatId}`, { headers: { Authorization: `Bearer ${token}` } });
      const chat = await chatRes.json();
      recipientId = chat.recipient?._id;
      recipientName = chat.recipient?.name?.trim();
      recipientAvatar = chat.recipient?.avatar || null;
    }
    callState = type === 'incoming' ? 'ringing' : 'init';
    if (callState === 'ringing') {
      elements.spinner.style.display = 'none';
      playRingtone();
    }
    updateUI();
    initSocket();
  } catch {
    setTimeout(() => location.href = '/chat-list.html', 3000);
  }
});

window.addEventListener('beforeunload', () => {
  if (['connecting', 'ringing', 'active'].includes(callState) && socket?.connected) socket.emit('end-call', { callId });
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (peer) peer.close();
  // Cleanup animations
  if (localAnimationId) cancelAnimationFrame(localAnimationId);
  if (remoteAnimationId) cancelAnimationFrame(remoteAnimationId);
  if (avatarAnimationId) cancelAnimationFrame(avatarAnimationId);
});

// === INITIAL DRAW ===
if (ctx) drawStaticBackground();