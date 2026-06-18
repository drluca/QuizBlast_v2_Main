const Player = (() => {
  let peer         = null;
  let conn         = null;
  let myName       = '';
  let myAvatar     = '';
  let myScore      = 0;
  let timerBar     = null;
  let answered     = false;
  let roomCode     = '';
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 5;

  const ICONS = ['▲', '●', '■', '★'];

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function setStatus(msg, type = '') {
    let el = document.getElementById('conn-status');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'conn-status ' + type;
    el.style.display = msg ? 'block' : 'none';
  }

  // ── AUTO-FILL FROM URL ──
  window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const room   = params.get('room');
    if (room) {
      document.getElementById('room-code-input').value = room.toUpperCase();
      // Auto-foca no nome se o código já veio pela URL
      document.getElementById('player-name-input').focus();
    }
  });

  // ── JOIN ──
  function join() {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    const name = document.getElementById('player-name-input').value.trim();
    if (!code) { alert('Digite o código da sala!'); return; }
    if (!name) { alert('Digite seu nome!'); return; }

    myName   = name;
    myScore  = 0;
    roomCode = code;
    reconnectAttempts = 0;

    setStatus('⏳ Conectando...', 'connecting');
    _connect();
  }

  function _connect() {
    if (peer && !peer.destroyed) { peer.destroy(); }

    peer = new Peer(undefined, {
      host: '0.peerjs.com', port: 443, path: '/', secure: true,
      pingInterval: 3000,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('open', () => {
      reconnectAttempts = 0;
      conn = peer.connect(roomCode, { reliable: true, serialization: 'json' });

      conn.on('open', () => {
        setStatus('✅ Conectado', 'connected');
        conn.send({ type: 'join', name: myName });
      });

      conn.on('data', data => handleMessage(data));

      conn.on('close', () => {
        setStatus('⚠️ Conexão perdida', 'error');
        _tryReconnect();
      });

      conn.on('error', () => {
        setStatus('⚠️ Erro na conexão', 'error');
        _tryReconnect();
      });
    });

    peer.on('error', err => {
      if (err.type === 'peer-unavailable') {
        setStatus('', '');
        alert('Sala não encontrada! Verifique o código.');
      } else if (err.type === 'network' || err.type === 'server-error') {
        _tryReconnect();
      } else {
        setStatus('❌ ' + (err.message || err.type), 'error');
      }
    });

    peer.on('disconnected', () => {
      setStatus('⚠️ Reconectando...', 'connecting');
      setTimeout(() => { if (peer && peer.disconnected) peer.reconnect(); }, 1500);
    });
  }

  function _tryReconnect() {
    clearTimeout(reconnectTimer);
    if (reconnectAttempts >= MAX_RECONNECT) {
      setStatus('❌ Sem conexão. Recarregue a página.', 'error');
      return;
    }
    reconnectAttempts++;
    const delay = Math.min(1000 * reconnectAttempts, 5000);
    setStatus(`⏳ Reconectando (${reconnectAttempts}/${MAX_RECONNECT})...`, 'connecting');
    reconnectTimer = setTimeout(_connect, delay);
  }

  // ── MESSAGE HANDLER ──
  function handleMessage(data) {
    switch (data.type) {

      case 'joined':
        myAvatar = data.avatar;
        setStatus('', '');
        document.getElementById('waiting-name').textContent = `${myAvatar} ${myName}`;
        showScreen('screen-waiting');
        break;

      case 'rejected':
        alert(data.reason || 'Não foi possível entrar na sala.');
        showScreen('screen-join');
        break;

      case 'quiz_start':
        myScore = 0;
        showScreen('screen-waiting');
        document.querySelector('.waiting-text').textContent = 'O quiz vai começar!';
        break;

      case 'question':
        showQuestion(data);
        break;

      case 'time_up':
        // Timer ran out — player didn't answer in time
        clearTimerBar();
        answered = true;
        // Gray out all buttons, highlight correct
        document.querySelectorAll('.player-answer-btn').forEach((btn, i) => {
          btn.disabled = true;
          btn.classList.add(i === data.correctIndex ? 'correct' : 'wrong');
        });
        // Show explanation if any
        if (data.explanation) {
          const expEl = document.getElementById('player-question-explanation');
          expEl.textContent = '💡 ' + data.explanation;
          expEl.classList.remove('hidden');
        }
        // Show timed-out feedback overlay but stay on answer screen waiting for host
        _showAnswerOverlay('timeout', 0);
        document.getElementById('player-waiting-host').classList.remove('hidden');
        break;

      case 'answer_result':
        // Host confirmed our answer — show result inline, stay on screen-answer
        clearTimerBar();
        myScore = data.totalScore;
        // Highlight correct/wrong buttons
        document.querySelectorAll('.player-answer-btn').forEach((btn, i) => {
          btn.disabled = true;
          btn.classList.add(i === data.correctIndex ? 'correct' : 'wrong');
        });
        // Show explanation if any
        if (data.explanation) {
          const expEl = document.getElementById('player-question-explanation');
          expEl.textContent = '💡 ' + data.explanation;
          expEl.classList.remove('hidden');
        }
        // Show result overlay
        _showAnswerOverlay(data.correct ? 'correct' : 'wrong', data.points, data.position);
        document.getElementById('player-waiting-host').classList.remove('hidden');
        break;

      case 'reveal':
        // Host revealed answer (after all answered or timer ended)
        // Highlight correct/wrong on whatever state the buttons are in
        document.querySelectorAll('.player-answer-btn').forEach((btn, i) => {
          btn.disabled = true;
          if (!btn.classList.contains('correct') && !btn.classList.contains('wrong')) {
            btn.classList.add(i === data.correctIndex ? 'correct' : 'wrong');
          }
        });
        if (data.explanation) {
          const expEl = document.getElementById('player-question-explanation');
          expEl.textContent = '💡 ' + data.explanation;
          expEl.classList.remove('hidden');
        }
        break;

      case 'scoreboard':
        // Host advanced to scoreboard — move player to waiting screen
        showScoreboardPlayer(data.players);
        break;

      case 'podium':
        showPodiumPlayer(data.players);
        break;
    }
  }

  // Show a small overlay on top of the answer screen (correct / wrong / timeout)
  function _showAnswerOverlay(type, points, position) {
    let overlay = document.getElementById('player-answer-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'player-answer-overlay';
      overlay.className = 'player-answer-overlay';
      document.querySelector('.answer-container').appendChild(overlay);
    }
    if (type === 'correct') {
      overlay.innerHTML = `<span class="overlay-icon">✅</span><span class="overlay-label">Correto! <strong>+${points} pts</strong></span>`;
      overlay.className = 'player-answer-overlay overlay-correct';
    } else if (type === 'wrong') {
      overlay.innerHTML = `<span class="overlay-icon">❌</span><span class="overlay-label">Errado! +0 pts</span>`;
      overlay.className = 'player-answer-overlay overlay-wrong';
    } else {
      overlay.innerHTML = `<span class="overlay-icon">⏰</span><span class="overlay-label">Tempo esgotado!</span>`;
      overlay.className = 'player-answer-overlay overlay-timeout';
    }
    overlay.classList.remove('hidden');
  }

  // ── QUESTION ──
  function showQuestion(data) {
    answered = false;
    showScreen('screen-answer');
    // Remove any leftover overlay from previous question
    const oldOverlay = document.getElementById('player-answer-overlay');
    if (oldOverlay) oldOverlay.remove();
    // Hide waiting indicator
    document.getElementById('player-waiting-host').classList.add('hidden');
    document.getElementById('player-question-text').textContent = data.text;
    // Show/hide image
    const imgWrap = document.getElementById('player-question-image-wrap');
    const imgEl   = document.getElementById('player-question-image');
    if (data.image) {
      imgEl.src = data.image;
      imgWrap.classList.remove('hidden');
    } else {
      imgEl.src = '';
      imgWrap.classList.add('hidden');
    }
    document.getElementById('player-question-explanation').className = 'question-explanation hidden';
    document.getElementById('player-answers-grid').innerHTML = data.options.map((opt, i) => `
      <button class="answer-btn ans-${i} player-answer-btn" onclick="Player.answer(${i})">
        <span class="icon">${ICONS[i]}</span> ${opt}
      </button>`).join('');
    startTimerBar(data.time);
  }

  function answer(index) {
    if (answered) return;
    answered = true;
    clearTimerBar();
    document.querySelectorAll('.player-answer-btn').forEach((btn, i) => {
      btn.disabled = true;
      if (i !== index) btn.classList.add('wrong');
    });
    document.querySelectorAll('.player-answer-btn')[index].classList.add('selected-answer');
    // Show waiting indicator immediately
    document.getElementById('player-waiting-host').classList.remove('hidden');
    try { conn.send({ type: 'answer', index }); } catch(e) {}
  }

  // ── TIMER BAR ──
  function startTimerBar(seconds) {
    clearTimerBar();
    const fill = document.getElementById('timer-bar-fill');
    fill.style.transition = 'none';
    fill.style.width = '100%';
    fill.style.background = 'linear-gradient(90deg, #00d4ff, #6c3fc5)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.transition = `width ${seconds}s linear`;
      fill.style.width = '0%';
    }));
    let t = seconds;
    timerBar = setInterval(() => {
      t--;
      if (t <= seconds * 0.33) fill.style.background = 'linear-gradient(90deg, #ff4757, #c0392b)';
      else if (t <= seconds * 0.6) fill.style.background = 'linear-gradient(90deg, #f5c518, #e67e22)';
      if (t <= 0) clearTimerBar();
    }, 1000);
  }

  function clearTimerBar() {
    clearInterval(timerBar);
    timerBar = null;
  }

  // ── SCOREBOARD ──
  function showScoreboardPlayer(players) {
    showScreen('screen-waiting');
    document.querySelector('.waiting-text').textContent = 'Aguardando próxima pergunta...';
    const myPos = players.findIndex(p => p.name === myName) + 1;
    document.getElementById('waiting-name').textContent =
      `${myAvatar} ${myName} — ${myScore} pts · ${myPos}º lugar`;
  }

  // ── PODIUM ──
  function showPodiumPlayer(players) {
    showScreen('screen-podium-player');
    const order  = [players[1], players[0], players[2]].filter(Boolean);
    const cls    = ['place-2','place-1','place-3'];
    const medals = ['🥈','🥇','🥉'];

    document.getElementById('podium-player').innerHTML = order.map((p, i) => `
      <div class="podium-place ${cls[i]}">
        <div class="podium-avatar">${p.avatar}</div>
        <div class="podium-name">${p.name}</div>
        <div class="podium-pts">${p.score} pts</div>
        <div class="podium-block">${medals[i]}</div>
      </div>`).join('');

    const myPos = players.findIndex(p => p.name === myName) + 1;
    const me    = players.find(p => p.name === myName);
    document.getElementById('my-result').innerHTML = me ? `
      <div class="my-result-card card">
        <div style="font-size:2rem">${me.avatar}</div>
        <div style="font-weight:900;font-size:1.2rem">${me.name}</div>
        <div style="color:var(--yellow);font-size:1.4rem;font-weight:900">${me.score} pts</div>
        <div style="color:#aaa">${myPos}º lugar de ${players.length}</div>
      </div>` : '';
  }

  function goHome() {
    clearTimeout(reconnectTimer);
    if (peer) { peer.destroy(); peer = null; }
    showScreen('screen-join');
  }

  return { join, answer, goHome };
})();
