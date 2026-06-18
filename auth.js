const Auth = (() => {
  const CRED_KEY    = 'quizblast_credentials';
  const SESSION_KEY = 'quizblast_session';

  // ── SHA-256 via Web Crypto ──
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ── CREDENCIAIS ──
  function getCredentials() {
    try { return JSON.parse(localStorage.getItem(CRED_KEY)); } catch { return null; }
  }

  async function ensureDefaultCredentials() {
    if (!getCredentials()) {
      const hash = await sha256('admin123');
      localStorage.setItem(CRED_KEY, JSON.stringify({ username: 'admin', hash }));
    }
  }

  // ── SESSÃO ──
  function isLoggedIn() {
    return !!sessionStorage.getItem(SESSION_KEY);
  }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  function createSession(username) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username, at: Date.now() }));
  }

  function destroySession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ── TELA (local, sem depender do Host) ──
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // ── LOGIN ──
  async function login() {
    const user  = document.getElementById('login-user').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');

    if (!user || !pass) {
      errEl.textContent = '❌ Preencha usuário e senha.';
      errEl.classList.remove('hidden');
      return;
    }

    const creds = getCredentials();
    const hash  = await sha256(pass);

    if (!creds || creds.username !== user || creds.hash !== hash) {
      errEl.textContent = '❌ Usuário ou senha incorretos.';
      errEl.classList.remove('hidden');
      const card = document.querySelector('.login-card');
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 500);
      document.getElementById('login-pass').value = '';
      return;
    }

    errEl.classList.add('hidden');
    createSession(user);
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    _goHome();
  }

  function logout() {
    if (!confirm('Deseja sair da sessão?')) return;
    destroySession();
    showScreen('screen-login');
  }

  // Navega para home atualizando o nome do usuário
  function _goHome() {
    const session = getSession();
    if (session) {
      document.getElementById('home-username').textContent = `👤 ${session.username}`;
    }
    showScreen('screen-home');
  }

  function backToHome() { _goHome(); }

  // ── TROCAR SENHA ──
  function goToChangePass() {
    if (!isLoggedIn()) { showScreen('screen-login'); return; }
    ['cp-current','cp-new','cp-confirm'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('change-error').classList.add('hidden');
    document.getElementById('change-success').classList.add('hidden');
    showScreen('screen-change-pass');
  }

  async function changePassword() {
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirm = document.getElementById('cp-confirm').value;
    const errEl   = document.getElementById('change-error');
    const okEl    = document.getElementById('change-success');

    errEl.classList.add('hidden');
    okEl.classList.add('hidden');

    const creds    = getCredentials();
    const hashCurr = await sha256(current);

    if (creds.hash !== hashCurr) {
      errEl.textContent = '❌ Senha atual incorreta.';
      errEl.classList.remove('hidden'); return;
    }
    if (newPass.length < 6) {
      errEl.textContent = '❌ A nova senha precisa ter pelo menos 6 caracteres.';
      errEl.classList.remove('hidden'); return;
    }
    if (newPass !== confirm) {
      errEl.textContent = '❌ As senhas não coincidem.';
      errEl.classList.remove('hidden'); return;
    }

    const newHash = await sha256(newPass);
    localStorage.setItem(CRED_KEY, JSON.stringify({ username: creds.username, hash: newHash }));
    okEl.textContent = '✅ Senha alterada com sucesso!';
    okEl.classList.remove('hidden');
    ['cp-current','cp-new','cp-confirm'].forEach(id => document.getElementById(id).value = '');
    setTimeout(_goHome, 1500);
  }

  // ── TOGGLE SENHA ──
  function togglePass() {
    const input = document.getElementById('login-pass');
    const btn   = document.getElementById('btn-eye');
    if (input.type === 'password') { input.type = 'text';     btn.textContent = '🙈'; }
    else                           { input.type = 'password'; btn.textContent = '👁️'; }
  }

  // ── INIT: roda após o DOM estar pronto ──
  // Usa setTimeout(0) para garantir que todos os scripts já carregaram
  ensureDefaultCredentials().then(() => {
    setTimeout(() => {
      if (isLoggedIn()) _goHome();
      // senão: tela de login já está ativa por padrão no HTML
    }, 0);
  });

  return { login, logout, backToHome, goToChangePass, changePassword, togglePass, isLoggedIn, getSession };
})();
