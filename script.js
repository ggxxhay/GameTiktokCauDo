'use strict';

const questions = [
  { q: 'Đâu là tên một loại bánh truyền thống nổi tiếng của Việt Nam dịp Tết?', A: 'Bánh Tét', B: 'Bánh Mì', C: 'Bánh Xèo', D: 'Bánh Cuốn', ans: 'A' },
  { q: 'Con vật nào sau đây không nằm trong 12 con giáp của Việt Nam?', A: 'Con Mèo', B: 'Con Trâu', C: 'Con Thỏ', D: 'Con Rồng', ans: 'C' },
  { q: "Đỉnh núi nào được mệnh danh là 'Nóc nhà Đông Dương'?", A: 'Bà Đen', B: 'Fansipan', C: 'Langbiang', D: 'Bạch Mã', ans: 'B' },
  { q: "Câu tục ngữ: 'Gần mực thì đen, gần đèn thì...' gì?", A: 'Chói', B: 'Nóng', C: 'Sáng', D: 'Rạng', ans: 'C' },
  { q: 'Loại quả nào thường được dùng để nấu canh chua miền Nam?', A: 'Quả Me', B: 'Quả Sấu', C: 'Quả Chanh', D: 'Quả Khế', ans: 'A' },
  { q: 'Ai là người lãnh đạo cuộc khởi nghĩa Lam Sơn chống quân Minh?', A: 'Quang Trung', B: 'Trần Hưng Đạo', C: 'Lê Lợi', D: 'Lý Thường Kiệt', ans: 'C' },
  { q: 'Đơn vị tiền tệ chính thức của Nhật Bản là gì?', A: 'Won', B: 'Nhân dân tệ', C: 'Baht', D: 'Yên', ans: 'D' },
  { q: 'Hành tinh nào gần Mặt Trời nhất trong Hệ Mặt Trời?', A: 'Sao Kim', B: 'Sao Thủy', C: 'Sao Hỏa', D: 'Trái Đất', ans: 'B' },
  { q: 'Vịnh Hạ Long thuộc tỉnh nào của nước ta?', A: 'Hải Phòng', B: 'Thanh Hóa', C: 'Quảng Ninh', D: 'Nghệ An', ans: 'C' },
  { q: "Từ nào còn thiếu: 'Có công mài sắt, có ngày nên...' ?", A: 'Kim', B: 'Dao', C: 'Kéo', D: 'Kiếm', ans: 'A' }
];

const $ = id => document.getElementById(id);
const answerOptions = ['A', 'B', 'C', 'D'];
const medals = ['🥇', '🥈', '🥉'];
const mockUsers = ['Minh Anh', 'Tuấn Kiệt', 'Hoàng Nam', 'Bảo Ngọc', 'Bạn (Test)'];
const maxChatMessages = 100;
const config = Object.assign({
  answerDurationSeconds: 10,
  roundRestartSeconds: 15,
  speechLanguage: 'vi-VN',
  speechRate: 0.92,
  speechPitch: 1,
  liveWebSocketUrl: 'wss://ws.eulerstream.com?uniqueId={username}&apiKey={apiKey}',
  debugLiveMessages: false
}, window.GAME_CONFIG || {});
const questionDuration = Math.max(1, Number(config.answerDurationSeconds) || 10);
const roundRestartDelay = Math.max(1, Number(config.roundRestartSeconds) || 15);
let mockUserIndex = 0;
let currentIdx = 0;
let timeLeft = questionDuration;
let timerInterval = null;
let nextQuestionTimeout = null;
let nextQuestionAt = 0;
let autoRestartInterval = null;
let autoRestartTimeout = null;
let autoRestartAt = 0;
let isAcceptingAnswers = false;
let gameState = 'idle';
let pausedFrom = null;
let questionPhase = 'idle';
let currentVotes = Object.create(null);
let participants = new Map();
let ws = null;
let voiceEnabled = true;
let musicEnabled = false;
let audioContext = null;
let musicTimer = null;
let musicNoteIndex = 0;
let speechToken = 0;

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function playNote(frequency, duration = 0.32, volume = 0.035, wave = 'sine') {
  const context = ensureAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.03);
}

function startMusic() {
  ensureAudioContext();
  if (!audioContext) {
    $('ticker').textContent = 'Trình duyệt này không hỗ trợ nhạc nền Web Audio.';
    return;
  }
  if (musicTimer) return;
  musicEnabled = true;
  $('musicButton').textContent = '🎵 Nhạc nền: bật';
  $('musicButton').setAttribute('aria-pressed', 'true');
  const melody = [392, 523.25, 587.33, 659.25, 523.25, 440, 523.25, 659.25];
  musicTimer = setInterval(() => {
    if (!musicEnabled || gameState === 'paused') return;
    const note = melody[musicNoteIndex % melody.length];
    playNote(note, 0.28, 0.018, 'triangle');
    if (musicNoteIndex % 4 === 0) playNote(note / 2, 0.5, 0.012, 'sine');
    musicNoteIndex += 1;
  }, 420);
}

function stopMusic() {
  musicEnabled = false;
  clearInterval(musicTimer);
  musicTimer = null;
  $('musicButton').textContent = '🔇 Nhạc nền: tắt';
  $('musicButton').setAttribute('aria-pressed', 'false');
}

function toggleMusic() {
  ensureAudioContext();
  if (musicEnabled) stopMusic();
  else startMusic();
}

function cancelSpeech() {
  speechToken += 1;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function speak(text, onEnd = () => {}) {
  cancelSpeech();
  const token = speechToken;
  if (!voiceEnabled || !('speechSynthesis' in window)) {
    window.setTimeout(() => { if (token === speechToken) onEnd(); }, 0);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = config.speechLanguage;
  utterance.rate = Number(config.speechRate) || 0.92;
  utterance.pitch = Number(config.speechPitch) || 1;
  const languagePrefix = String(config.speechLanguage || 'vi').toLowerCase().split('-')[0];
  const voice = window.speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith(languagePrefix));
  if (voice) utterance.voice = voice;
  utterance.onend = () => { if (token === speechToken) onEnd(); };
  utterance.onerror = event => {
    if (token !== speechToken) return;
    console.warn('Lỗi đọc giọng nói:', event.error);
    onEnd();
  };
  window.speechSynthesis.speak(utterance);
}

function speakQuestion(item, onEnd) {
  speak(`Câu ${currentIdx + 1}. ${item.q} Đáp án A: ${item.A}. Đáp án B: ${item.B}. Đáp án C: ${item.C}. Đáp án D: ${item.D}.`, onEnd);
}

function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  $('voiceButton').textContent = voiceEnabled ? '🗣️ Giọng đọc: bật' : '🔇 Giọng đọc: tắt';
  $('voiceButton').setAttribute('aria-pressed', String(voiceEnabled));
  if (!voiceEnabled) {
    cancelSpeech();
    if (gameState === 'running' && questionPhase === 'reading') startAnswerTimer();
    else if (gameState === 'running' && questionPhase === 'results') scheduleAdvance(0);
  } else if (gameState === 'running' && questionPhase === 'reading') {
    speakQuestion(questions[currentIdx], startAnswerTimer);
  }
}

function setGameState(state) {
  gameState = state;
  $('pauseButton').disabled = !['running', 'paused'].includes(state);
  $('nextButton').disabled = state !== 'running';
  $('endButton').disabled = !['running', 'paused'].includes(state);
  $('pauseButton').textContent = state === 'paused' ? 'Tiếp tục' : 'Tạm dừng';
  $('ticker').dataset.state = state;
}

function clearRoundTimers() {
  clearInterval(timerInterval);
  clearTimeout(nextQuestionTimeout);
  timerInterval = null;
  nextQuestionTimeout = null;
}

function clearRestartTimers() {
  clearInterval(autoRestartInterval);
  clearTimeout(autoRestartTimeout);
  autoRestartInterval = null;
  autoRestartTimeout = null;
}

function resetRound({ resetPlayers = false } = {}) {
  clearRoundTimers();
  clearRestartTimers();
  cancelSpeech();
  currentIdx = 0;
  timeLeft = questionDuration;
  currentVotes = Object.create(null);
  mockUserIndex = 0;
  pausedFrom = null;
  questionPhase = 'idle';
  isAcceptingAnswers = false;
  if (resetPlayers) participants = new Map();
  $('chatHistory').replaceChildren();
  const empty = document.createElement('li');
  empty.className = 'empty-state';
  empty.textContent = 'Tin nhắn sẽ hiển thị ở đây';
  $('chatHistory').append(empty);
  $('roundEndPanel').hidden = true;
  $('startScreen').style.display = 'none';
  renderParticipants();
  renderLeaderboard();
  setGameState('running');
  loadQuestion();
}

function startGame() {
  ensureAudioContext();
  resetRound({ resetPlayers: true });
  $('ticker').textContent = '👉 Gõ A, B, C hoặc D ở dưới để test thử!';
}

function startNewRound() {
  resetRound();
  $('ticker').textContent = '🔄 Vòng mới bắt đầu! Gõ A, B, C hoặc D để trả lời.';
}

function startAnswerTimer() {
  if (gameState !== 'running' || questionPhase !== 'reading') return;
  if (timerInterval) return;
  questionPhase = 'answering';
  isAcceptingAnswers = true;
  timeLeft = questionDuration;
  $('timer').textContent = timeLeft;
  $('ticker').textContent = `🔊 Đã đọc xong — còn ${questionDuration} giây để bình luận A, B, C hoặc D!`;
  timerInterval = setInterval(() => {
    if (gameState !== 'running' || questionPhase !== 'answering') return;
    timeLeft -= 1;
    $('timer').textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      revealAnswer();
    }
  }, 1000);
}

function loadQuestion() {
  if (currentIdx >= questions.length) {
    finishGame('🎉 Đã hoàn thành tất cả câu hỏi!');
    return;
  }
  const item = questions[currentIdx];
  $('qNumber').textContent = `CÂU ${currentIdx + 1} / ${questions.length}`;
  $('questionText').textContent = item.q;
  const grid = $('optionsGrid');
  grid.replaceChildren();
  answerOptions.forEach(option => {
    const row = document.createElement('div');
    row.className = 'option-btn';
    row.id = `opt-${option}`;
    const bar = document.createElement('div');
    bar.className = 'vote-bar';
    bar.id = `bar-${option}`;
    const content = document.createElement('div');
    content.className = 'option-content';
    const prefix = document.createElement('span');
    prefix.className = 'prefix';
    prefix.textContent = `${option}:`;
    const answer = document.createElement('span');
    answer.textContent = item[option];
    content.append(prefix, answer);
    const percent = document.createElement('div');
    percent.className = 'vote-percent';
    percent.id = `pct-${option}`;
    percent.textContent = '0%';
    row.append(bar, content, percent);
    grid.append(row);
  });
  currentVotes = Object.create(null);
  questionPhase = 'reading';
  isAcceptingAnswers = true; // Cho phép bình luận ngay khi câu hỏi xuất hiện.
  timeLeft = questionDuration;
  $('timer').textContent = timeLeft;
  $('ticker').textContent = `🔊 Đang đọc câu hỏi; bình luận được nhận ngay, timer ${questionDuration} giây bắt đầu sau khi đọc xong.`;
  clearRoundTimers();
  if (voiceEnabled && 'speechSynthesis' in window) {
    speakQuestion(item, startAnswerTimer);
  } else {
    startAnswerTimer();
  }
}

function appendChatMessage(nickname, text, choice = null) {
  const history = $('chatHistory');
  const empty = history.querySelector('.empty-state');
  if (empty) empty.remove();
  const message = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'chat-name';
  name.textContent = nickname || 'Viewer';
  message.append(name, document.createTextNode(`: ${text}`));
  if (choice) {
    const selected = document.createElement('span');
    selected.className = 'chat-choice';
    selected.textContent = ` (chọn ${choice})`;
    message.append(selected);
  }
  history.append(message);
  while (history.children.length > maxChatMessages) history.firstElementChild.remove();
  history.scrollTop = history.scrollHeight;
}

function normalizeName(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function getParticipantKey(userId, name) {
  const normalizedName = normalizeName(name);
  return normalizedName ? `name:${normalizedName}` : `id:${String(userId || 'viewer')}`;
}

function extractChoice(text) {
  const normalized = String(text).trim().toLocaleUpperCase('vi');
  const match = normalized.match(/^(?:ĐÁP ÁN|CHỌN|TÔI CHỌN|ANSWER)?\s*([ABCD])(?:\s|[.!,:;]|$)/u)
    || normalized.match(/\b([ABCD])\s*$/u);
  return match ? match[1] : null;
}

function handleIncomingComment(userId, nickname, text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const name = String(nickname || 'Viewer').trim() || 'Viewer';
  const choice = extractChoice(text);
  appendChatMessage(name, text.trim(), choice);
  if (!choice || gameState !== 'running' || !isAcceptingAnswers) return false;
  const id = getParticipantKey(userId, name);
  if (!participants.has(id)) participants.set(id, { name, score: 0 });
  else participants.get(id).name = name;
  currentVotes[id] = { name, choice };
  $('ticker').textContent = `💬 Đã nhận ${choice} từ ${name}`;
  updateVoteBars();
  renderParticipants();
  return true;
}

function updateVoteBars() {
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  let total = 0;
  Object.values(currentVotes).forEach(vote => { counts[vote.choice] += 1; total += 1; });
  answerOptions.forEach(option => {
    const percent = total ? Math.round((counts[option] / total) * 100) : 0;
    $(`bar-${option}`).style.width = `${percent}%`;
    $(`pct-${option}`).textContent = `${percent}%`;
  });
}

function scheduleAdvance(delay) {
  clearTimeout(nextQuestionTimeout);
  nextQuestionAt = Date.now() + delay;
  nextQuestionTimeout = setTimeout(advanceQuestion, delay);
}

function revealAnswer() {
  if (gameState !== 'running' || !['reading', 'answering'].includes(questionPhase)) return;
  clearInterval(timerInterval);
  timerInterval = null;
  isAcceptingAnswers = false;
  questionPhase = 'results';
  const item = questions[currentIdx];
  const correct = item.ans;
  answerOptions.forEach(option => $(`opt-${option}`).classList.add(option === correct ? 'correct' : 'wrong'));
  let winners = 0;
  Object.entries(currentVotes).forEach(([id, vote]) => {
    if (vote.choice !== correct) return;
    winners += 1;
    const participant = participants.get(id);
    if (participant) participant.score += 10;
  });
  const result = `Hết giờ. Đáp án đúng là ${correct}: ${item[correct]}. Có ${winners} người trả lời đúng và được cộng 10 điểm.`;
  $('ticker').textContent = `🎉 Đáp án đúng: ${correct} (${winners} bạn đúng +10đ)`;
  playNote(659.25, 0.5, 0.045, 'triangle');
  window.setTimeout(() => playNote(783.99, 0.6, 0.035, 'triangle'), 180);
  renderLeaderboard();
  renderParticipants();
  speak(result, () => {
    if (gameState === 'running' && questionPhase === 'results') scheduleAdvance(0);
  });
}

function advanceQuestion() {
  nextQuestionTimeout = null;
  if (gameState !== 'running' || questionPhase !== 'results') return;
  currentIdx += 1;
  loadQuestion();
}

function nextQuestionNow() {
  if (gameState !== 'running') return;
  clearRoundTimers();
  cancelSpeech();
  if (['reading', 'answering'].includes(questionPhase)) revealAnswer();
  clearTimeout(nextQuestionTimeout);
  nextQuestionTimeout = null;
  currentIdx += 1;
  loadQuestion();
}

function togglePause() {
  if (gameState === 'running') {
    pausedFrom = questionPhase;
    clearInterval(timerInterval);
    timerInterval = null;
    if (nextQuestionTimeout) {
      clearTimeout(nextQuestionTimeout);
      nextQuestionTimeout = null;
    }
    isAcceptingAnswers = false;
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    setGameState('paused');
    $('ticker').textContent = '⏸️ Trò chơi đang tạm dừng';
    return;
  }
  if (gameState !== 'paused') return;
  setGameState('running');
  if (pausedFrom === 'answering') {
    isAcceptingAnswers = true;
    timerInterval = setInterval(() => {
      if (gameState !== 'running' || questionPhase !== 'answering') return;
      timeLeft -= 1;
      $('timer').textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        revealAnswer();
      }
    }, 1000);
  } else if (pausedFrom === 'reading') {
    isAcceptingAnswers = true;
    if (!voiceEnabled || !('speechSynthesis' in window)) startAnswerTimer();
    else {
      window.speechSynthesis.resume();
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) startAnswerTimer();
    }
  } else if (pausedFrom === 'results') {
    const remaining = Math.max(0, nextQuestionAt - Date.now());
    nextQuestionTimeout = setTimeout(advanceQuestion, remaining);
  }
  pausedFrom = null;
}

function finishGame(message = '⏹️ Trò chơi đã kết thúc') {
  if (gameState === 'ended') return;
  clearRoundTimers();
  clearRestartTimers();
  cancelSpeech();
  isAcceptingAnswers = false;
  pausedFrom = null;
  questionPhase = 'ended';
  setGameState('ended');
  $('ticker').textContent = message;
  $('timer').textContent = '—';
  $('roundEndMessage').textContent = `Vòng mới sẽ tự bắt đầu sau ${roundRestartDelay} giây.`;
  $('roundEndPanel').hidden = false;
  renderLeaderboard();
  renderParticipants();
  autoRestartAt = Date.now() + roundRestartDelay * 1000;
  autoRestartInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((autoRestartAt - Date.now()) / 1000));
    $('roundEndMessage').textContent = `Vòng mới sẽ tự bắt đầu sau ${remaining} giây.`;
  }, 250);
  autoRestartTimeout = setTimeout(startNewRound, roundRestartDelay * 1000);
}

function clearRestartTimers() {
  clearInterval(autoRestartInterval);
  clearTimeout(autoRestartTimeout);
  autoRestartInterval = null;
  autoRestartTimeout = null;
}

function renderLeaderboard() {
  const top = [...participants.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 3);
  const list = $('topList');
  list.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const item = document.createElement('div');
    item.className = 'top-item';
    item.append(document.createTextNode(`${medals[index]} ${top[index]?.name || 'Trống'}`));
    const score = document.createElement('span');
    score.textContent = `${top[index]?.score || 0}đ`;
    item.append(score);
    list.append(item);
  }
}

function renderParticipants() {
  const sorted = [...participants.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  $('participantCount').textContent = String(sorted.length);
  const list = $('participantsList');
  list.replaceChildren();
  if (!sorted.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Chưa có người chơi';
    list.append(empty);
    return;
  }
  sorted.forEach((participant, index) => {
    const item = document.createElement('div');
    item.className = 'participant-item';
    item.append(document.createTextNode(`${index + 1}. ${participant.name} — `));
    const score = document.createElement('strong');
    score.textContent = `${participant.score}đ`;
    item.append(score);
    list.append(item);
  });
}

function simulateChat() {
  const input = $('simInput');
  const text = input.value.trim();
  if (!text) return;
  const name = mockUsers[mockUserIndex % mockUsers.length];
  mockUserIndex += 1;
  handleIncomingComment(`mock:${normalizeName(name)}`, name, text);
  input.value = '';
  input.focus();
}

function openModal() { $('configModal').style.display = 'flex'; $('ttUser').focus(); }
function closeModal() { $('configModal').style.display = 'none'; }

function firstNonEmptyString(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || null;
}

function findLiveComment(payload) {
  const queue = [payload];
  const seen = new Set();
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    const user = node.userDetails || node.userInfo || node.user || node.author || node.viewer || {};
    const text = firstNonEmptyString(
      node.comment, node.text, node.content, node.commentText, node.messageText,
      typeof node.message === 'string' ? node.message : null,
      node.comment && typeof node.comment === 'object' ? node.comment.text : null,
      node.message && typeof node.message === 'object' ? node.message.comment : null,
      node.data && typeof node.data === 'object' ? node.data.comment : null
    );
    if (text) {
      const nickname = firstNonEmptyString(
        user.nickname, user.nickName, user.displayName, user.uniqueId, user.username,
        node.nickname, node.nickName, node.uniqueId, node.username, node.displayName
      ) || 'Viewer';
      const userId = firstNonEmptyString(
        user.userId, user.id, user.uniqueId, user.secUid,
        node.userId, node.uid, node.id, node.secUid
      ) || nickname;
      return { userId, nickname, text };
    }
    for (const key of ['data', 'payload', 'event', 'message', 'result', 'body', 'webcastMessage']) {
      const child = node[key];
      if (child && typeof child === 'object') queue.push(child);
    }
    if (Array.isArray(node)) queue.push(...node);
  }
  return null;
}

function handleLiveFrame(raw) {
  let payload;
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    console.warn('Không parse được frame TikTok Live:', error);
    return;
  }
  if (config.debugLiveMessages) console.debug('TikTok Live frame:', payload);
  const events = Array.isArray(payload) ? payload : [payload];
  events.forEach(event => {
    const comment = findLiveComment(event);
    if (comment) handleIncomingComment(comment.userId, comment.nickname, comment.text);
  });
}

function connectTikTok() {
  const user = $('ttUser').value.trim().replace(/^@/, '');
  const apiKey = $('ttApiKey').value.trim();
  if (!user || !apiKey) { alert('Vui lòng nhập đầy đủ Username và API Key!'); return; }
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  closeModal();
  $('statusText').textContent = 'Đang kết nối...';
  $('ticker').textContent = '🔌 Đang kết nối TikTok Live...';
  $('statusDot').classList.remove('connected');
  try {
    const url = String(config.liveWebSocketUrl)
      .replace('{username}', encodeURIComponent(user))
      .replace('{apiKey}', encodeURIComponent(apiKey));
    ws = new WebSocket(url);
  } catch (error) {
    $('statusText').textContent = 'Không thể kết nối';
    $('ticker').textContent = `❌ Không thể tạo kết nối: ${error.message}`;
    return;
  }
  ws.onopen = () => {
    $('statusDot').classList.add('connected');
    $('statusText').textContent = `Live: @${user}`;
    $('ticker').textContent = '✅ Đã kết nối Live; đang chờ bình luận.';
    $('simBar').hidden = true;
  };
  ws.onmessage = event => handleLiveFrame(event.data);
  ws.onerror = () => {
    $('statusText').textContent = 'Lỗi kết nối Live';
    $('ticker').textContent = '❌ Lỗi WebSocket Live; kiểm tra endpoint/API key và Console.';
  };
  ws.onclose = event => {
    $('statusDot').classList.remove('connected');
    $('statusText').textContent = `Đã ngắt kết nối${event.code ? ` (${event.code})` : ''}`;
    $('ticker').textContent = event.reason || 'Kết nối Live đã đóng.';
    $('simBar').hidden = false;
  };
}

$('startButton').addEventListener('click', startGame);
$('newRoundButton').addEventListener('click', startNewRound);
$('pauseButton').addEventListener('click', togglePause);
$('nextButton').addEventListener('click', nextQuestionNow);
$('endButton').addEventListener('click', () => finishGame());
$('musicButton').addEventListener('click', toggleMusic);
$('voiceButton').addEventListener('click', toggleVoice);
$('configButton').addEventListener('click', openModal);
$('closeModalButton').addEventListener('click', closeModal);
$('connectButton').addEventListener('click', connectTikTok);
$('sendButton').addEventListener('click', simulateChat);
$('simInput').addEventListener('keydown', event => { if (event.key === 'Enter') simulateChat(); });
$('configModal').addEventListener('click', event => { if (event.target === $('configModal')) closeModal(); });
renderLeaderboard();
renderParticipants();
