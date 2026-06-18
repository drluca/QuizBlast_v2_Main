const App = (() => {
  // ── STATE ──
  let questions = [];
  let players   = [];
  let current   = 0;
  let timerInterval = null;
  let timeLeft  = 0;
  let answered  = false;
  let editingIndex = -1;

  const ICONS = ['▲', '●', '■', '★'];
  const EMOJIS = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const AVATARS = ['🦊','🐯','🦁','🐸','🐧','🦄','🐲','🤖','👾','🎃'];

  // ── NAVIGATION ──
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function goHome()    { showScreen('screen-home'); }
  function goToSetup() { renderQuestionsList(); showScreen('screen-setup'); }
  function goToPlay()  {
    players = [];
    renderPlayersList();
    document.getElementById('btn-play-start').disabled = true;
    showScreen('screen-players');
  }

  // ── SETUP: QUESTIONS ──
  function clearForm() {
    document.getElementById('q-text').value   = '';
    document.getElementById('opt-a').value    = '';
    document.getElementById('opt-b').value    = '';
    document.getElementById('opt-c').value    = '';
    document.getElementById('opt-d').value    = '';
    document.getElementById('q-correct').value = '0';
    document.getElementById('q-time').value   = '20';
    document.getElementById('form-title').textContent = '➕ Nova Pergunta';
    editingIndex = -1;
    // Clear image
    document.getElementById('q-image').value = '';
    document.getElementById('q-image-preview').src = '';
    document.getElementById('q-image-preview').classList.add('hidden');
    document.getElementById('image-upload-placeholder').classList.remove('hidden');
    document.getElementById('btn-remove-image').classList.add('hidden');
    // Clear explanation
    document.getElementById('q-explanation').value = '';
    clearForm._imageData = null;
  }

  function previewImage(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
      clearForm._imageData = e.target.result;
      const preview = document.getElementById('q-image-preview');
      preview.src = e.target.result;
      preview.classList.remove('hidden');
      document.getElementById('image-upload-placeholder').classList.add('hidden');
      document.getElementById('btn-remove-image').classList.remove('hidden');
    };
    reader.readAsDataURL(input.files[0]);
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
    const text    = document.getElementById('q-text').value.trim();
    const optA    = document.getElementById('opt-a').value.trim();
    const optB    = document.getElementById('opt-b').value.trim();
    const optC    = document.getElementById('opt-c').value.trim();
    const optD    = document.getElementById('opt-d').value.trim();
    const correct = parseInt(document.getElementById('q-correct').value);
    const time    = parseInt(document.getElementById('q-time').value);

    if (!text || !optA || !optB || !optC || !optD) {
      alert('Preencha a pergunta e todas as opções!');
      return;
    }

    const explanation = document.getElementById('q-explanation').value.trim();
    const image = clearForm._imageData || null;
    const q = { text, options: [optA, optB, optC, optD], correct, time, image, explanation };

    if (editingIndex >= 0) {
      questions[editingIndex] = q;
    } else {
      questions.push(q);
    }

    clearForm();
    renderQuestionsList();
    document.getElementById('btn-start-game').disabled = questions.length === 0;
  }

  function deleteQuestion(i) {
    questions.splice(i, 1);
    renderQuestionsList();
    document.getElementById('btn-start-game').disabled = questions.length === 0;
  }

  function renderQuestionsList() {
    const el = document.getElementById('questions-list');
    if (questions.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = questions.map((q, i) => `
      <div class="q-item">
        <span class="q-item-text">${i + 1}. ${q.text}</span>
        <span class="q-item-meta">⏱ ${q.time}s | ✅ ${q.options[q.correct]}</span>
        <button class="q-item-del" onclick="App.deleteQuestion(${i})">✕</button>
      </div>
    `).join('');
  }

  // ── PLAYERS ──
  function addPlayer() {
    const input = document.getElementById('player-name');
    const name  = input.value.trim();
    if (!name) return;
    if (players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      alert('Jogador já adicionado!');
      return;
    }
    players.push({ name, score: 0, avatar: AVATARS[players.length % AVATARS.length] });
    input.value = '';
    renderPlayersList();
    document.getElementById('btn-play-start').disabled = players.length < 1;
  }

  function removePlayer(i) {
    players.splice(i, 1);
    renderPlayersList();
    document.getElementById('btn-play-start').disabled = players.length < 1;
  }

  function renderPlayersList() {
    const el = document.getElementById('players-list');
    el.innerHTML = players.map((p, i) => `
      <span class="player-tag">
        ${p.avatar} ${p.name}
        <button onclick="App.removePlayer(${i})">✕</button>
      </span>
    `).join('');
  }

  // ── GAME FLOW ──
  function startGame() {
    if (questions.length === 0) return;
    // Save quiz to use in play mode
    sessionStorage.setItem('quizblast_questions', JSON.stringify(questions));
    goToPlay();
  }

  function loadSavedQuiz() {
    const saved = sessionStorage.getItem('quizblast_questions');
    if (saved) questions = JSON.parse(saved);
    if (questions.length === 0) { alert('Nenhum quiz criado! Crie um quiz primeiro.'); return; }
    players.forEach(p => p.score = 0);
    current = 0;
    showQuestion();
  }

  function showQuestion() {
    showScreen('screen-quiz');
    answered = false;

    const q   = questions[current];
    const total = questions.length;

    document.getElementById('q-counter').textContent = `Pergunta ${current + 1}/${total}`;
    document.getElementById('question-text').textContent = q.text;
    document.getElementById('answer-feedback').className = 'answer-feedback hidden';
    document.getElementById('question-explanation').className = 'question-explanation hidden';

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

    // Render answers
    const grid = document.getElementById('answers-grid');
    grid.innerHTML = q.options.map((opt, i) => `
      <button class="answer-btn ans-${i}" onclick="App.selectAnswer(${i})">
        <span class="icon">${ICONS[i]}</span> ${opt}
      </button>
    `).join('');

    startTimer(q.time);
    updateScoreDisplay();
  }

  function updateScoreDisplay() {
    // Show total score of all players combined (or first player if single)
    const total = players.reduce((s, p) => s + p.score, 0);
    document.getElementById('q-score-display').textContent =
      players.length === 1
        ? `⭐ ${players[0].score} pts`
        : `⭐ ${total} pts total`;
  }

  // ── TIMER ──
  function startTimer(seconds) {
    clearInterval(timerInterval);
    timeLeft = seconds;
    const ring = document.getElementById('timer-ring');
    const text = document.getElementById('timer-text');
    const circumference = 283;

    ring.style.stroke = '#00d4ff';
    text.style.color  = '#fff';

    function tick() {
      const ratio = timeLeft / seconds;
      ring.style.strokeDashoffset = circumference * (1 - ratio);

      if (ratio < .33) {
        ring.style.stroke = '#ff4757';
        text.style.color  = '#ff4757';
        text.style.animation = 'pulse .5s infinite';
      } else if (ratio < .6) {
        ring.style.stroke = '#f5c518';
        text.style.color  = '#f5c518';
        text.style.animation = '';
      }

      text.textContent = timeLeft;

      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        if (!answered) timeOut();
        return;
      }
      timeLeft--;
    }

    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function timeOut() {
    answered = true;
    disableAnswers();
    highlightCorrect();
    showFeedback('⏰ Tempo esgotado!', 'timeout-fb');
    const q = questions[current];
    if (q.explanation) {
      showExplanation(q.explanation);
      setTimeout(showScoreboard, 3500);
    } else {
      setTimeout(showScoreboard, 2000);
    }
  }

  // ── ANSWER ──
  function selectAnswer(index) {
    if (answered) return;
    answered = true;
    clearInterval(timerInterval);

    const q       = questions[current];
    const correct = q.correct;
    const isRight = index === correct;
    const points  = isRight ? calcPoints(q.time, timeLeft) : 0;

    // Award points to all players (multiplayer: each player answers on their turn — simplified: all get same)
    players.forEach(p => p.score += points);

    disableAnswers();
    highlightCorrect(index);

    if (isRight) {
      showFeedback(`✅ Correto! +${points} pts`, 'correct-fb');
    } else {
      showFeedback(`❌ Errado! Resposta: ${q.options[correct]}`, 'wrong-fb');
    }

    if (q.explanation) {
      showExplanation(q.explanation);
      setTimeout(showScoreboard, 3500);
    } else {
      setTimeout(showScoreboard, 2000);
    }
  }

  function calcPoints(totalTime, remaining) {
    const base = 1000;
    const bonus = Math.round((remaining / totalTime) * 500);
    return base + bonus;
  }

  function disableAnswers() {
    document.querySelectorAll('.answer-btn').forEach(b => b.disabled = true);
  }

  function highlightCorrect(selected) {
    const correct = questions[current].correct;
    document.querySelectorAll('.answer-btn').forEach((b, i) => {
      if (i === correct) b.classList.add('correct');
      else if (i === selected && i !== correct) b.classList.add('wrong');
    });
  }

  function showFeedback(msg, cls) {
    const el = document.getElementById('answer-feedback');
    el.textContent = msg;
    el.className   = `answer-feedback ${cls}`;
  }

  function showExplanation(text) {
    const el = document.getElementById('question-explanation');
    el.textContent = '💡 ' + text;
    el.classList.remove('hidden');
  }

  // ── SCOREBOARD ──
  function showScoreboard() {
    showScreen('screen-scoreboard');
    const sorted = [...players].sort((a, b) => b.score - a.score);
    document.getElementById('scoreboard-list').innerHTML = sorted.map((p, i) => `
      <div class="score-row">
        <span class="score-rank">${EMOJIS[i] || i + 1}</span>
        <span class="score-name">${p.avatar} ${p.name}</span>
        <span class="score-pts">${p.score} pts</span>
      </div>
    `).join('');

    const btn = document.querySelector('#screen-scoreboard .btn-primary');
    if (current >= questions.length - 1) {
      btn.textContent = '🏆 Ver Resultado Final!';
      btn.onclick = showPodium;
    } else {
      btn.textContent = 'Próxima Pergunta ➡️';
      btn.onclick = nextQuestion;
    }
  }

  function nextQuestion() {
    current++;
    if (current >= questions.length) { showPodium(); return; }
    showQuestion();
  }

  // ── PODIUM ──
  function showPodium() {
    showScreen('screen-podium');
    const sorted = [...players].sort((a, b) => b.score - a.score);

    // Build podium (1st, 2nd, 3rd)
    const podiumOrder = [sorted[1], sorted[0], sorted[2]].filter(Boolean);
    const placeClass  = ['place-2', 'place-1', 'place-3'];
    const medals      = ['🥈', '🥇', '🥉'];

    document.getElementById('podium').innerHTML = podiumOrder.map((p, i) => `
      <div class="podium-place ${placeClass[i]}">
        <div class="podium-avatar">${p.avatar}</div>
        <div class="podium-name">${p.name}</div>
        <div class="podium-pts">${p.score} pts</div>
        <div class="podium-block">${medals[i]}</div>
      </div>
    `).join('');

    // Full ranking
    const rest = sorted.slice(3);
    document.getElementById('full-ranking').innerHTML = rest.length ? `
      <h3>Classificação Completa</h3>
      ${sorted.map((p, i) => `
        <div class="rank-row">
          <span class="rank-pos">${i + 1}º</span>
          <span class="rank-name">${p.avatar} ${p.name}</span>
          <span class="rank-pts">${p.score} pts</span>
        </div>
      `).join('')}
    ` : '';

    launchConfetti();
  }

  // ── CONFETTI ──
  function launchConfetti() {
    const colors = ['#f5c518','#e91e8c','#00d4ff','#26de81','#ff6b35','#6c3fc5'];
    for (let i = 0; i < 80; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.left     = Math.random() * 100 + 'vw';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.width    = (Math.random() * 10 + 6) + 'px';
        el.style.height   = (Math.random() * 10 + 6) + 'px';
        el.style.borderRadius = Math.random() > .5 ? '50%' : '2px';
        el.style.animationDuration = (Math.random() * 2 + 2) + 's';
        el.style.animationDelay   = Math.random() * .5 + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
      }, i * 30);
    }
  }

  // ── RESTART ──
  function playAgain() {
    players.forEach(p => p.score = 0);
    current = 0;
    showQuestion();
  }

  // ── DEMO QUESTIONS (pre-loaded) ──
  function loadDemo() {
    questions = [
      {
        text: 'Qual é a capital do Brasil?',
        options: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador'],
        correct: 2, time: 20, image: null,
        explanation: 'Brasília foi inaugurada em 1960 e é a capital federal do Brasil desde então.'
      },
      {
        text: 'Quanto é 7 × 8?',
        options: ['54', '56', '48', '64'],
        correct: 1, time: 15, image: null,
        explanation: '7 × 8 = 56. Uma dica: 7 × 7 = 49, então 49 + 7 = 56.'
      },
      {
        text: 'Qual linguagem roda no navegador?',
        options: ['Python', 'Java', 'JavaScript', 'C++'],
        correct: 2, time: 20, image: null,
        explanation: 'JavaScript é a única linguagem executada nativamente nos navegadores web.'
      },
      {
        text: 'Quem pintou a Mona Lisa?',
        options: ['Michelangelo', 'Rafael', 'Leonardo da Vinci', 'Picasso'],
        correct: 2, time: 30, image: null,
        explanation: 'Leonardo da Vinci pintou a Mona Lisa entre 1503 e 1519, durante o Renascimento italiano.'
      },
      {
        text: 'Qual planeta é o maior do sistema solar?',
        options: ['Saturno', 'Netuno', 'Terra', 'Júpiter'],
        correct: 3, time: 20, image: null,
        explanation: 'Júpiter é o maior planeta do sistema solar, com massa 2,5 vezes maior que todos os outros planetas juntos.'
      }
    ];
    sessionStorage.setItem('quizblast_questions', JSON.stringify(questions));
    renderQuestionsList();
    document.getElementById('btn-start-game').disabled = false;
  }

  // Auto-load demo on first visit
  const saved = sessionStorage.getItem('quizblast_questions');
  if (saved) {
    questions = JSON.parse(saved);
  } else {
    loadDemo();
  }

  return {
    goHome, goToSetup, goToPlay,
    addQuestion, deleteQuestion, clearForm, previewImage, removeImage,
    addPlayer, removePlayer,
    startGame, loadSavedQuiz,
    selectAnswer, nextQuestion,
    playAgain
  };
})();
