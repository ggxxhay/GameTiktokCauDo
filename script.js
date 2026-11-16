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
let mockUserIndex = 0;
let currentIdx = 0;
let timeLeft = 20;
let timerInterval = null;
let nextQuestionTimeout = null;
let nextQuestionAt = 0;
let isAcceptingAnswers = false;
let gameState = 'idle';
let pausedFrom = null;
let currentVotes = Object.create(null);
let participants = new Map();
let ws = null;

function setGameState(state) {
  gameState = state;
  $('pauseButton').disabled = !['running', 'paused'].includes(state);
  $('nextButton').disabled = gameState !== 'running';
  $('endButton').disabled = !['running', 'paused'].includes(state);
  $('pauseButton').textContent = state === 'paused' ? 'Tiếp tục' : 'Tạm dừng';
  $('ticker').dataset.state = state;
}

function startGame() {
  clearInterval(timerInterval);
  clearTimeout(nextQuestionTimeout);
  currentIdx = 0;
  timeLeft = 20;
  currentVotes = Object.create(null);
  participants = new Map();
  mockUserIndex = 0;
  pausedFrom = null;
  $('chatHistory').replaceChildren();
  $('startScreen').style.display = 'none';
  $('ticker').textContent = '👉 Gõ A, B, C hoặc D ở ô dưới để test thử!';
  renderParticipants();
  renderLeaderboard();
  setGameState('running');
  loadQuestion();
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
  isAcceptingAnswers = true;
  timeLeft = 20;
  $('timer').textContent = timeLeft;
  $('ticker').textContent = '👉 Gõ A, B, C hoặc D ở dưới để trả lời!';
  clearInterval(timerInterval);
  clearTimeout(nextQuestionTimeout);
  timerInterval = setInterval(() => {
    if (gameState !== 'running') return;
    timeLeft -= 1;
    $('timer').textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      revealAnswer();
    }
  }, 1000);
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

function handleIncomingComment(userId, nickname, text) {
  if (typeof text !== 'string' || !text.trim()) return;
  const name = String(nickname || 'Viewer');
  const clean = text.trim().toUpperCase();
  const choice = answerOptions.includes(clean) ? clean : (answerOptions.includes(clean[0]) ? clean[0] : null);
  appendChatMessage(name, text.trim(), choice);
  if (!choice || gameState !== 'running' || !isAcceptingAnswers) return;

  const id = String(userId || name);
  if (!participants.has(id)) participants.set(id, { name, score: 0 });
  else participants.get(id).name = name;
  currentVotes[id] = { name, choice };
  $('ticker').textContent = `💬 ${name} chọn: ${choice}`;
  updateVoteBars();
  renderParticipants();
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

function revealAnswer() {
  if (gameState !== 'running') return;
  isAcceptingAnswers = false;
  const correct = questions[currentIdx].ans;
  answerOptions.forEach(option => $(`opt-${option}`).classList.add(option === correct ? 'correct' : 'wrong'));
  let winners = 0;
  Object.entries(currentVotes).forEach(([id, vote]) => {
    if (vote.choice !== correct) return;
    winners += 1;
    const participant = participants.get(id);
    if (participant) participant.score += 10;
  });
  $('ticker').textContent = `🎉 Đáp án đúng: ${correct} (${winners} bạn đúng +10đ)`;
  renderLeaderboard();
  renderParticipants();
  nextQuestionAt = Date.now() + 4000;
  nextQuestionTimeout = setTimeout(advanceQuestion, 4000);
}

function advanceQuestion() {
  nextQuestionTimeout = null;
  if (gameState !== 'running') return;
  currentIdx += 1;
  loadQuestion();
}

function nextQuestionNow() {
  if (gameState !== 'running') return;
  if (isAcceptingAnswers) revealAnswer();
  else {
    clearTimeout(nextQuestionTimeout);
    nextQuestionTimeout = null;
  }
  currentIdx += 1;
  loadQuestion();
}

function togglePause() {
  if (gameState === 'running') {
    pausedFrom = isAcceptingAnswers ? 'question' : 'reveal';
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (nextQuestionTimeout) {
      clearTimeout(nextQuestionTimeout);
      nextQuestionTimeout = null;
    }
    isAcceptingAnswers = false;
    setGameState('paused');
    $('ticker').textContent = '⏸️ Trò chơi đang tạm dừng';
    return;
  }
  if (gameState !== 'paused') return;
  setGameState('running');
  if (pausedFrom === 'question') {
    isAcceptingAnswers = true;
    timerInterval = setInterval(() => {
      if (gameState !== 'running') return;
      timeLeft -= 1;
      $('timer').textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        revealAnswer();
      }
    }, 1000);
    $('ticker').textContent = '👉 Gõ A, B, C hoặc D ở dưới để trả lời!';
  } else {
    const remaining = Math.max(0, nextQuestionAt - Date.now());
    nextQuestionTimeout = setTimeout(advanceQuestion, remaining);
  }
  pausedFrom = null;
}

function finishGame(message = '⏹️ Trò chơi đã kết thúc') {
  clearInterval(timerInterval);
  clearTimeout(nextQuestionTimeout);
  timerInterval = null;
  nextQuestionTimeout = null;
  isAcceptingAnswers = false;
  pausedFrom = null;
  setGameState('ended');
  $('ticker').textContent = message;
  $('timer').textContent = '—';
  renderLeaderboard();
  renderParticipants();
}

function renderLeaderboard() {
  const top = [...participants.values()].sort((a, b) => b.score - a.score).slice(0, 3);
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
  handleIncomingComment(`mock-${name}-${mockUserIndex}`, name, text);
  input.value = '';
  input.focus();
}

function openModal() { $('configModal').style.display = 'flex'; $('ttUser').focus(); }
function closeModal() { $('configModal').style.display = 'none'; }

function connectTikTok() {
  const user = $('ttUser').value.trim();
  const apiKey = $('ttApiKey').value.trim();
  if (!user || !apiKey) {
    alert('Vui lòng nhập đầy đủ Username và API Key!');
    return;
  }
  if (ws) ws.close();
  closeModal();
  $('statusText').textContent = 'Đang kết nối...';
  try {
    const url = `wss://ws.eulerstream.com?uniqueId=${encodeURIComponent(user)}&apiKey=${encodeURIComponent(apiKey)}`;
    ws = new WebSocket(url);
  } catch (error) {
    $('statusText').textContent = 'Không thể kết nối';
    return;
  }
  ws.onopen = () => {
    $('statusDot').classList.add('connected');
    $('statusText').textContent = `Live: @${user}`;
    $('simBar').hidden = true;
  };
  ws.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      const text = data.comment || data.text || data.message;
      const viewer = data.user || {};
      if (typeof text === 'string') {
        const id = viewer.id || data.userId || viewer.uniqueId || 'viewer';
        const name = viewer.nickname || viewer.uniqueId || data.nickname || 'Viewer';
        handleIncomingComment(id, name, text);
      }
    } catch (error) {
      console.warn('Không đọc được tin nhắn TikTok Live:', error);
    }
  };
  ws.onerror = () => { $('statusText').textContent = 'Lỗi kết nối Live'; };
  ws.onclose = () => {
    $('statusDot').classList.remove('connected');
    $('statusText').textContent = 'Đã ngắt kết nối';
    $('simBar').hidden = false;
  };
}

$('startButton').addEventListener('click', startGame);
$('pauseButton').addEventListener('click', togglePause);
$('nextButton').addEventListener('click', nextQuestionNow);
$('endButton').addEventListener('click', () => finishGame());
$('configButton').addEventListener('click', openModal);
$('closeModalButton').addEventListener('click', closeModal);
$('connectButton').addEventListener('click', connectTikTok);
$('sendButton').addEventListener('click', simulateChat);
$('simInput').addEventListener('keydown', event => { if (event.key === 'Enter') simulateChat(); });
$('configModal').addEventListener('click', event => { if (event.target === $('configModal')) closeModal(); });
renderLeaderboard();
renderParticipants();
