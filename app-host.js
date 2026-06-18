const Host = (() => {
  let questions      = [];
  let players        = {};
  let current        = 0;
  let timerInterval  = null;
  let timeLeft       = 0;
  let answersIn      = 0;
  let peer           = null;
  let roomCode       = '';
  let questionActive = false;
  let currentQuizId  = null;
  let lobbyUITimer   = null;

  const ICONS       = ['▲','●','■','★'];
  const AVATARS     = ['🦊','🐯','🦁','🐸','🐧','🦄','🐲','🤖','👾','🎃'];
  const EMOJIS      = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const STORAGE_KEY = 'quizblast_library';

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function goHome() {
    destroyPeer();
    try {
      const s = Auth.getSession();
      if (s) document.getElementById('home-username').textContent = '👤 ' + s.username;
    } catch(e) {}
    showScreen('screen-home');
  }

  // ── LIBRARY ──
  function getLibrary() {
    try {
      const lib = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      // Sanitize types in case old data was saved with strings
      return lib.map(quiz => ({
        ...quiz,
        questions: (quiz.questions || []).map(q => ({
          ...q,
          correct: Number(q.correct),
          time:    Number(q.time)
        }))
      }));
    } catch { return []; }
  }
  function saveLibrary(lib) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
  }

  function goToLibrary() {
    if (!Auth.isLoggedIn()) { showScreen('screen-login'); return; }
    renderLibrary();
    showScreen('screen-library');
  }

  function renderLibrary() {
    const lib = getLibrary();
    const el  = document.getElementById('library-list');
    if (lib.length === 0) {
      el.innerHTML = '<div class="library-empty"><div style="font-size:3rem">📭</div><p>Nenhum quiz salvo ainda.</p></div>';
      return;
    }
    el.innerHTML = lib.map(quiz => `
      <div class="library-card card">
        <div class="library-card-info">
          <div class="library-card-name">${quiz.name}</div>
          <div class="library-card-meta">📝 ${quiz.questions.length} pergunta${quiz.questions.length !== 1 ? 's' : ''} &nbsp;·&nbsp; 🕒 ${formatDate(quiz.updatedAt)}</div>
        </div>
        <div class="library-card-actions">
          <button class="btn-lib btn-lib-edit"   onclick="Host.loadQuiz('${quiz.id}')">✏️ Editar</button>
          <button class="btn-lib btn-lib-play"   onclick="Host.loadAndPlay('${quiz.id}')">🚀 Jogar</button>
          <button class="btn-lib btn-lib-delete" onclick="Host.deleteQuiz('${quiz.id}')">🗑️</button>
        </div>
      </div>`).join('');
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  // ── QUIZ CRUD ──
  function newQuiz() {
    if (!Auth.isLoggedIn()) { showScreen('screen-login'); return; }
    questions = []; currentQuizId = null;
    document.getElementById('quiz-name-input').value = '';
    clearForm(); renderQuestionsList();
    document.getElementById('btn-to-lobby').disabled = true;
    showScreen('screen-setup');
  }

  function loadQuiz(id) {
    const quiz = getLibrary().find(q => q.id === id);
    if (!quiz) return;
    // Deep copy and sanitize types
    questions = JSON.parse(JSON.stringify(quiz.questions)).map(q => ({
      ...q,
      correct: Number(q.correct),
      time:    Number(q.time)
    }));
    currentQuizId = id;
    document.getElementById('quiz-name-input').value = quiz.name;
    clearForm(); renderQuestionsList();
    document.getElementById('btn-to-lobby').disabled = questions.length === 0;
    showScreen('screen-setup');
  }

  function loadAndPlay(id) {
    const quiz = getLibrary().find(q => q.id === id);
    if (!quiz) return;
    // Deep copy and sanitize types
    questions = JSON.parse(JSON.stringify(quiz.questions)).map(q => ({
      ...q,
      correct: Number(q.correct),
      time:    Number(q.time)
    }));
    currentQuizId = id;
    goToLobby();
  }

  function saveQuiz() {
    const name = document.getElementById('quiz-name-input').value.trim();
    if (!name) { alert('Dê um nome para o quiz!'); document.getElementById('quiz-name-input').focus(); return; }
    if (questions.length === 0) { alert('Adicione pelo menos uma pergunta!'); return; }
    const lib = getLibrary();
    const now = new Date().toISOString();
    if (currentQuizId) {
      const idx = lib.findIndex(q => q.id === currentQuizId);
      if (idx >= 0) { lib[idx] = { ...lib[idx], name, questions, updatedAt: now }; }
      else { currentQuizId = null; }
    }
    if (!currentQuizId) {
      currentQuizId = 'quiz_' + Date.now();
      lib.push({ id: currentQuizId, name, questions, createdAt: now, updatedAt: now });
    }
    saveLibrary(lib);
    showToast('✅ Quiz salvo!');
  }

  function deleteQuiz(id) {
    if (!confirm('Deletar este quiz?')) return;
    saveLibrary(getLibrary().filter(q => q.id !== id));
    renderLibrary();
  }

  function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast'; }, 2500);
  }

  // ── SETUP FORM ──
  function clearForm() {
    ['q-text','opt-a','opt-b','opt-c','opt-d'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('q-correct').value = '0';
    document.getElementById('q-time').value    = '20';
    document.getElementById('form-title').textContent = '➕ Nova Pergunta';
    // Clear image
    document.getElementById('q-image').value = '';
    document.getElementById('q-image-preview').src = '';
    document.getElementById('q-image-preview').classList.add('hidden');
    document.getElementById('image-upload-placeholder').classList.remove('hidden');
    document.getElementById('btn-remove-image').classList.add('hidden');
    // Clear explanation
    document.getElementById('q-explanation').value = '';
    clearForm._imageData    = null;
    clearForm._editingIndex = -1;
    // Reset button label and form highlight
    const addBtn = document.querySelector('.form-actions .btn-add');
    if (addBtn) addBtn.textContent = '✅ Adicionar';
    const form = document.querySelector('.question-form');
    if (form) form.classList.remove('editing');
  }

  function previewImage(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = e => {
      clearForm._imageData = e.target.result;
      const preview = document.getElementById('q-image-preview');
      preview.src = e.target.result;
      preview.classList.remove('hidden');
      document.getElementById('image-upload-placeholder').classList.add('hidden');
      document.getElementById('btn-remove-image').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  function removeImage() {
    clearForm._imageData = null;
    document.getElementById('q-image').value = '';
    document.getElementById('q-image-preview').src = '';
    document.getElementById('q-image-preview').classList.add('hidden');
    document.getElementById('image-upload-placeholder').classList.remove('hidden');
    document.getElementById('btn-remove-image').classList.add('hidden');
  }

  function addQuestion() {
    const text = document.getElementById('q-text').value.trim();
    const opts = ['opt-a','opt-b','opt-c','opt-d'].map(id => document.getElementById(id).value.trim());
    if (!text || opts.some(o => !o)) { alert('Preencha a pergunta e todas as opções!'); return; }
    const explanation = document.getElementById('q-explanation').value.trim();
    const image   = clearForm._imageData !== undefined ? clearForm._imageData : null;
    const correct = Number(document.getElementById('q-correct').value);
    const time    = Number(document.getElementById('q-time').value);
    const q = { text, options: opts, correct, time, image, explanation };
    if (clearForm._editingIndex >= 0) {
      questions[clearForm._editingIndex] = q;
    } else {
      questions.push(q);
    }
    clearForm(); renderQuestionsList();
    document.getElementById('btn-to-lobby').disabled = questions.length === 0;
  }

  function editQuestion(i) {
    const q = questions[i];
    document.getElementById('q-text').value            = q.text;
    document.getElementById('opt-a').value             = q.options[0];
    document.getElementById('opt-b').value             = q.options[1];
    document.getElementById('opt-c').value             = q.options[2];
    document.getElementById('opt-d').value             = q.options[3];
    document.getElementById('q-correct').value         = String(q.correct);
    document.getElementById('q-time').value            = String(q.time);
    document.getElementById('q-explanation').value     = q.explanation || '';
    document.getElementById('form-title').textContent  = '✏️ Editando Pergunta ' + (i + 1);
    // Restore image preview
    clearForm._imageData = q.image || null;
    const preview = document.getElementById('q-image-preview');
    const placeholder = document.getElementById('image-upload-placeholder');
    const removeBtn = document.getElementById('btn-remove-image');
    if (q.image) {
      preview.src = q.image;
      preview.classList.remove('hidden');
      placeholder.classList.add('hidden');
      removeBtn.classList.remove('hidden');
    } else {
      preview.src = '';
      preview.classList.add('hidden');
      placeholder.classList.remove('hidden');
      removeBtn.classList.add('hidden');
    }
    clearForm._editingIndex = i;
    // Update button label to "Salvar alterações"
    document.querySelector('.form-actions .btn-add').textContent = '💾 Salvar Alterações';
    // Highlight form as editing mode
    document.querySelector('.question-form').classList.add('editing');
    // Scroll form into view
    document.querySelector('.question-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function deleteQuestion(i) {
    questions.splice(i, 1); renderQuestionsList();
    document.getElementById('btn-to-lobby').disabled = questions.length === 0;
  }

  function renderQuestionsList() {
    document.getElementById('questions-list').innerHTML = questions.map((q, i) => `
      <div class="q-item">
        <span class="q-item-text">${i+1}. ${q.text}</span>
        <span class="q-item-meta">⏱ ${q.time}s | ✅ ${q.options[q.correct]}</span>
        <div class="q-item-actions">
          <button class="q-item-edit" onclick="Host.editQuestion(${i})">✏️</button>
          <button class="q-item-del"  onclick="Host.deleteQuestion(${i})">✕</button>
        </div>
      </div>`).join('');
  }

  // ── LOBBY ──
  function goToLobby() {
    if (!Auth.isLoggedIn()) { showScreen('screen-login'); return; }
    if (questions.length === 0) { alert('Carregue ou crie um quiz primeiro!'); return; }
    players = {}; current = 0;
    showScreen('screen-lobby');
    document.getElementById('qrcode').innerHTML = '';
    document.getElementById('room-code-display').textContent = '...';
    document.getElementById('peer-status').textContent = '⏳ Conectando...';
    document.getElementById('peer-status').className   = 'peer-status connecting';
    document.getElementById('btn-start-quiz').disabled = true;
    initPeer();
  }

  function initPeer() {
    destroyPeer();
    roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    peer = new Peer(roomCode, {
      host: '0.peerjs.com', port: 443, path: '/', secure: true,
      pingInterval: 3000,
      config: { iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]}
    });
    peer.on('open', id => {
      roomCode = id;
      document.getElementById('room-code-display').textContent = roomCode;
      document.getElementById('peer-status').textContent = '✅ Sala aberta!';
      document.getElementById('peer-status').className   = 'peer-status connected';
      generateQR(buildPlayerURL(roomCode));
    });
    peer.on('connection', conn => {
      conn.on('open', () => {
        conn.on('data',  data => handlePlayerMessage(conn, data));
        conn.on('close', ()   => removePlayer(conn.peer));
        conn.on('error', ()   => removePlayer(conn.peer));
      });
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') {
        roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        peer.destroy(); initPeer();
      } else if (err.type === 'network' || err.type === 'server-error') {
        setTimeout(() => { if (peer && peer.disconnected) peer.reconnect(); }, 2000);
      } else {
        document.getElementById('peer-status').textContent = '❌ Erro de conexão';
        document.getElementById('peer-status').className   = 'peer-status error';
      }
    });
    peer.on('disconnected', () => {
      document.getElementById('peer-status').textContent = '⚠️ Reconectando...';
      document.getElementById('peer-status').className   = 'peer-status connecting';
      setTimeout(() => { if (peer && peer.disconnected) peer.reconnect(); }, 1500);
    });
  }

  function buildPlayerURL(code) {
    return window.location.href.replace('host.html', 'player.html') + '?room=' + code;
  }

  function generateQR(url) {
    document.getElementById('qrcode').innerHTML = '';
    new QRCode(document.getElementById('qrcode'), {
      text: url, width: 200, height: 200,
      colorDark: '#ffffff', colorLight: '#16213e',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  function destroyPeer() {
    if (peer) { peer.destroy(); peer = null; }
  }

  // ── PLAYERS ──
  function handlePlayerMessage(conn, data) {
    if (data.type === 'join') {
      if (questionActive || current > 0) {
        try { conn.send({ type: 'rejected', reason: 'Quiz já iniciado.' }); } catch(e) {}
        return;
      }
      const avatar = AVATARS[Object.keys(players).length % AVATARS.length];
      players[conn.peer] = { name: data.name, score: 0, avatar, conn, answered: false, lastPoints: 0 };
      try { conn.send({ type: 'joined', avatar, playerCount: Object.keys(players).length }); } catch(e) {}
      scheduleLobbyUI();
    }
    if (data.type === 'answer' && questionActive) {
      processAnswer(conn.peer, data.index);
    }
  }

  function removePlayer(peerId) {
    delete players[peerId];
    scheduleLobbyUI();
  }

  function scheduleLobbyUI() {
    clearTimeout(lobbyUITimer);
    lobbyUITimer = setTimeout(updateLobbyUI, 150);
  }

  function updateLobbyUI() {
    const list = Object.values(players);
    document.getElementById('player-count').textContent = list.length;
    document.getElementById('btn-start-quiz').disabled  = list.length === 0;
    document.getElementById('lobby-players').innerHTML  = list.map(p =>
      '<span class="player-tag">' + p.avatar + ' ' + p.name + '</span>').join('');
  }

  function broadcast(msg) {
    const conns = Object.values(players).map(p => p.conn).filter(Boolean);
    let i = 0;
    function next() {
      const end = Math.min(i + 5, conns.length);
      while (i < end) { try { conns[i].send(msg); } catch(e) {} i++; }
      if (i < conns.length) setTimeout(next, 0);
    }
    next();
  }

  // ── QUIZ FLOW ──
  function startQuiz() {
    current = 0;
    Object.values(players).forEach(p => { p.score = 0; p.answered = false; p.lastPoints = 0; });
    broadcast({ type: 'quiz_start', total: questions.length });
    showQuestion();
  }

  function showQuestion() {
    showScreen('screen-quiz');
    questionActive = false;
    answersIn = 0;
    const q      = questions[current];
    const pCount = Object.keys(players).length;
    document.getElementById('q-counter').textContent        = 'Pergunta ' + (current+1) + '/' + questions.length;
    document.getElementById('question-text').textContent    = q.text;
    document.getElementById('answers-received').textContent = '0/' + pCount + ' responderam';
    document.getElementById('answer-feedback').className    = 'answer-feedback hidden';
    document.getElementById('question-explanation').className = 'question-explanation hidden';
    document.getElementById('btn-reveal-scoreboard').classList.add('hidden');
    // Show/hide image
    const imgWrap = document.getElementById('question-image-wrap');
    const imgEl   = document.getElementById('question-image');
    if (q.image) {
      imgEl.src = q.image;
      imgWrap.classList.remove('hidden');
    } else {
      imgEl.src = '';
      imgWrap.classList.add('hidden');
    }
    document.getElementById('answers-grid').innerHTML = q.options.map((opt, i) =>
      '<div class="answer-display ans-' + i + '"><span class="icon">' + ICONS[i] + '</span> ' + opt + '</div>').join('');
    Object.values(players).forEach(p => { p.answered = false; p.lastPoints = 0; });
    broadcast({ type: 'question', index: current, text: q.text, options: q.options, time: q.time, total: questions.length, image: q.image || null });
    setTimeout(() => { questionActive = true; startTimer(q.time); }, 500);
  }

  function processAnswer(peerId, answerIndex) {
    const p = players[peerId];
    if (!p || p.answered) return;
    p.answered = true;
    const q       = questions[current];
    const isRight = answerIndex === q.correct;
    const points  = isRight ? calcPoints(q.time, timeLeft) : 0;
    p.score      += points;
    p.lastPoints  = points;
    p.answerIndex = answerIndex; // store for reveal later
    answersIn++;
    document.getElementById('answers-received').textContent =
      answersIn + '/' + Object.keys(players).length + ' responderam';
    // Just acknowledge receipt — do NOT reveal correct/wrong yet
    try {
      p.conn.send({ type: 'answer_received' });
    } catch(e) {}
    // All answered — stop timer and reveal answers, but wait for host to advance
    if (answersIn >= Object.keys(players).length) {
      clearInterval(timerInterval);
      questionActive = false;
      setTimeout(revealAnswers, 400);
    }
  }

  function calcPoints(totalTime, remaining) {
    return 1000 + Math.round((remaining / totalTime) * 500);
  }

  // Called when timer runs out OR all players answered
  // Reveals correct answer + explanation — host must click to continue
  function revealAnswers() {
    const q = questions[current];
    const correct = q.correct;
    // Highlight correct/wrong on host screen
    document.querySelectorAll('.answer-display').forEach((el, i) => {
      el.classList.add(i === correct ? 'correct' : 'dimmed');
    });
    // Show explanation on host screen
    const expEl = document.getElementById('question-explanation');
    if (q.explanation) {
      expEl.textContent = '💡 ' + q.explanation;
      expEl.classList.remove('hidden');
    }
    // Show "Ver Placar" button on host
    document.getElementById('btn-reveal-scoreboard').classList.remove('hidden');
    // Send personalised reveal to each player (their result + explanation)
    Object.values(players).forEach(p => {
      const isRight = p.answerIndex === correct;
      const points  = p.lastPoints;
      const myRank  = Object.values(players).filter(x => x.score > p.score).length + 1;
      try {
        p.conn.send({
          type: 'reveal',
          correctIndex: correct,
          explanation:  q.explanation || '',
          correct:      isRight,
          points,
          totalScore:   p.score,
          position:     myRank,
          didAnswer:    p.answered
        });
      } catch(e) {}
    });
  }

  function hostShowScoreboard() {
    document.getElementById('btn-reveal-scoreboard').classList.add('hidden');
    showScoreboard();
  }

  function startTimer(seconds) {
    clearInterval(timerInterval);
    timeLeft = seconds;
    const ring = document.getElementById('timer-ring');
    const text = document.getElementById('timer-text');
    ring.style.stroke = '#00d4ff';
    function tick() {
      const ratio = timeLeft / seconds;
      ring.style.strokeDashoffset = 283 * (1 - ratio);
      if (ratio < .33) ring.style.stroke = '#ff4757';
      else if (ratio < .6) ring.style.stroke = '#f5c518';
      text.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        questionActive = false;
        // Notify unanswered players time is up
        broadcast({ type: 'time_up', correctIndex: questions[current].correct });
        setTimeout(revealAnswers, 800);
        return;
      }
      timeLeft--;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function getSorted() {
    return Object.entries(players)
      .map(([peerId, p]) => ({ peerId, name: p.name, score: p.score, avatar: p.avatar }))
      .sort((a, b) => b.score - a.score);
  }

  function showScoreboard() {
    showScreen('screen-scoreboard');
    const sorted = getSorted();
    document.getElementById('scoreboard-list').innerHTML = sorted.map((p, i) =>
      '<div class="score-row"><span class="score-rank">' + (EMOJIS[i]||i+1) + '</span>' +
      '<span class="score-name">' + p.avatar + ' ' + p.name + '</span>' +
      '<span class="score-pts">' + p.score + ' pts</span></div>').join('');
    broadcast({ type: 'scoreboard', players: sorted.map(p => ({ name: p.name, score: p.score, avatar: p.avatar })) });
    const btn = document.getElementById('btn-next');
    if (current >= questions.length - 1) {
      btn.textContent = '🏆 Ver Resultado Final!';
      btn.onclick = showPodium;
    } else {
      btn.textContent = 'Próxima Pergunta ➡️';
      btn.onclick = nextQuestion;
    }
  }

  function nextQuestion() { current++; showQuestion(); }

  function showPodium() {
    showScreen('screen-podium');
    const sorted  = getSorted();
    const payload = sorted.map(p => ({ name: p.name, score: p.score, avatar: p.avatar }));
    broadcast({ type: 'podium', players: payload });
    const order  = [sorted[1], sorted[0], sorted[2]].filter(Boolean);
    const cls    = ['place-2','place-1','place-3'];
    const medals = ['🥈','🥇','🥉'];
    document.getElementById('podium').innerHTML = order.map((p, i) =>
      '<div class="podium-place ' + cls[i] + '">' +
      '<div class="podium-avatar">' + p.avatar + '</div>' +
      '<div class="podium-name">'   + p.name   + '</div>' +
      '<div class="podium-pts">'    + p.score  + ' pts</div>' +
      '<div class="podium-block">'  + medals[i]+ '</div></div>').join('');
    document.getElementById('full-ranking').innerHTML =
      '<h3>Classificação Completa</h3>' +
      sorted.map((p, i) =>
        '<div class="rank-row"><span class="rank-pos">' + (i+1) + 'º</span>' +
        '<span class="rank-name">' + p.avatar + ' ' + p.name + '</span>' +
        '<span class="rank-pts">'  + p.score  + ' pts</span></div>').join('');
    launchConfetti();
  }

  function playAgain() {
    current = 0;
    Object.values(players).forEach(p => { p.score = 0; p.answered = false; p.lastPoints = 0; });
    broadcast({ type: 'quiz_start', total: questions.length });
    showQuestion();
  }

  function launchConfetti() {
    const colors = ['#f5c518','#e91e8c','#00d4ff','#26de81','#ff6b35','#6c3fc5'];
    for (let i = 0; i < 80; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.cssText = 'left:' + (Math.random()*100) + 'vw;background:' + colors[Math.floor(Math.random()*colors.length)] + ';' +
          'width:' + (Math.random()*10+6) + 'px;height:' + (Math.random()*10+6) + 'px;' +
          'border-radius:' + (Math.random()>.5?'50%':'2px') + ';' +
          'animation-duration:' + (Math.random()*2+2) + 's;animation-delay:' + (Math.random()*.5) + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
      }, i * 30);
    }
  }

  // ── SEED DEMO ──
  (function() {
    const lib = getLibrary();
    if (lib.length === 0) {
      const now = new Date().toISOString();
      lib.push({ id: 'quiz_demo', name: '🎓 Quiz Demo', createdAt: now, updatedAt: now, questions: [
        { text:'Qual é a capital do Brasil?', options:['São Paulo','Rio de Janeiro','Brasília','Salvador'], correct:2, time:20, image:null, explanation:'Brasília foi inaugurada em 1960 e é a capital federal do Brasil desde então.' },
        { text:'Quanto é 7 × 8?', options:['54','56','48','64'], correct:1, time:15, image:null, explanation:'7 × 8 = 56. Uma dica: 7 × 7 = 49, então 49 + 7 = 56.' },
        { text:'Qual linguagem roda no navegador?', options:['Python','Java','JavaScript','C++'], correct:2, time:20, image:null, explanation:'JavaScript é a única linguagem executada nativamente nos navegadores web.' },
        { text:'Quem pintou a Mona Lisa?', options:['Michelangelo','Rafael','Leonardo da Vinci','Picasso'], correct:2, time:30, image:null, explanation:'Leonardo da Vinci pintou a Mona Lisa entre 1503 e 1519, durante o Renascimento italiano.' },
        { text:'Qual planeta é o maior do sistema solar?', options:['Saturno','Netuno','Terra','Júpiter'], correct:3, time:20, image:null, explanation:'Júpiter é o maior planeta do sistema solar, com massa 2,5 vezes maior que todos os outros planetas juntos.' }
      ]});
      saveLibrary(lib);
    }
  })();

  return {
    goHome, goToLibrary, newQuiz, loadQuiz, loadAndPlay, saveQuiz, deleteQuiz,
    goToLobby, addQuestion, editQuestion, deleteQuestion, clearForm, startQuiz, nextQuestion, playAgain,
    previewImage, removeImage, hostShowScoreboard
  };
})();
