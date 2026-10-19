/* ============================================================
   Calculatrice (PWA) — logique calculatrice + lanceur secret
   Tout est local : aucun appel réseau, aucune analytique.
   ============================================================ */

(() => {
  'use strict';

  // ---- Configuration des codes secrets -----------------------------------
  const STORAGE_KEY = 'calc_codes_v3';
  // Codes par défaut : expressions "fausses" qui déclenchent une ouverture.
  // expr = suite d'opérandes + opérateur tapée (ex. "2+2"), url = cible à ouvrir.
  const DEFAULT_CODES = [
    { expr: '2+2', url: 'https://memecoinsphere.github.io/' },
    { expr: '9+9', url: '' },
    { expr: '3+3', url: '' }
  ];

  function loadCodes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_CODES);
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return structuredClone(DEFAULT_CODES);
      return arr.filter(c => c && typeof c.expr === 'string');
    } catch (e) {
      return structuredClone(DEFAULT_CODES);
    }
  }
  function saveCodes(codes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  }
  let codes = loadCodes();

  // Normalise une expression pour la comparaison :
  // symboles d'affichage -> ASCII, virgule -> point, suppression des espaces.
  function normalizeExpr(s) {
    return String(s)
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/[−–—]/g, '-')
      .replace(/,/g, '.')
      .replace(/\s+/g, '')
      .trim();
  }

  // ---- État de la calculatrice -------------------------------------------
  let cur = '0';        // nombre courant affiché (point interne comme séparateur)
  let prev = null;      // opérande précédent (number)
  let op = null;        // opérateur courant (symbole d'affichage)
  let overwrite = true; // le prochain chiffre remplace l'écran
  let exprRaw = '';     // expression brute tapée, pour détecter les codes

  const screenEl = document.getElementById('screen');
  const historyEl = document.getElementById('history');

  // Affiche un nombre interne ("1234.5") au format FR ("1234,5")
  function fmt(numStr) {
    if (numStr === 'Error') return 'Erreur';
    return String(numStr).replace('.', ',');
  }

  function render() {
    screenEl.textContent = fmt(cur);
    historyEl.textContent = (prev !== null && op) ? (fmt(String(prev)) + ' ' + op) : '';
  }

  // ---- Saisie -------------------------------------------------------------
  function inputDigit(d) {
    if (overwrite) { cur = d; overwrite = false; }
    else { cur = (cur === '0') ? d : cur + d; }
    exprRaw += d;
    render();
  }

  function inputDecimal() {
    if (overwrite) { cur = '0.'; overwrite = false; exprRaw += '0.'; }
    else if (!cur.includes('.')) { cur += '.'; exprRaw += '.'; }
    render();
  }

  // Calcul réel entre deux opérandes
  function compute(a, b, operator) {
    switch (operator) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default:  return b;
    }
  }

  // Arrondi propre pour éviter 0.1+0.2 = 0.30000000000000004
  function clean(n) {
    if (!isFinite(n)) return 'Error';
    return String(Math.round((n + Number.EPSILON) * 1e10) / 1e10);
  }

  function chooseOp(symbol) {
    const val = parseFloat(cur);
    if (op !== null && !overwrite) {
      // chaînage : on calcule l'étape précédente
      const r = compute(prev, val, op);
      prev = (r === 'Error' || !isFinite(r)) ? 0 : r;
      cur = clean(r);
    } else {
      prev = val;
    }
    op = symbol;
    overwrite = true;
    exprRaw += normalizeExpr(symbol); // ajoute l'opérateur à l'expression brute
    render();
  }

  function equals() {
    // 1) Détection d'un code secret AVANT tout calcul.
    //    On compare l'expression brute tapée (opérandes + opérateur) aux triggers.
    const typed = normalizeExpr(exprRaw);
    if (op !== null) {
      const hit = codes.find(c => c.expr && normalizeExpr(c.expr) === typed);
      if (hit) {
        launch(hit);
        return; // on n'affiche jamais le vrai résultat pour un code
      }
    }
    // 2) Sinon, calcul normal.
    if (op !== null) {
      const val = parseFloat(cur);
      const r = compute(prev, val, op);
      historyEl.textContent = fmt(String(prev)) + ' ' + op + ' ' + fmt(String(val)) + ' =';
      cur = clean(r);
      prev = null;
      op = null;
      overwrite = true;
      exprRaw = '';
      screenEl.textContent = fmt(cur);
    }
  }

  function clearAll() {
    cur = '0'; prev = null; op = null; overwrite = true; exprRaw = '';
    render();
  }

  function negate() {
    if (cur === '0' || cur === 'Error') return;
    cur = cur.startsWith('-') ? cur.slice(1) : '-' + cur;
    render();
  }

  function percent() {
    const v = parseFloat(cur);
    cur = clean(v / 100);
    render();
  }

  // ---- Lancement de la cible cachée --------------------------------------
  function launch(code) {
    if (code.url && code.url.trim() !== '') {
      window.location.href = code.url.trim();
    } else {
      // Pas de cible configurée : on ouvre discrètement les réglages.
      openSettings();
    }
  }

  // ---- Branchement des touches -------------------------------------------
  document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.num !== undefined) return inputDigit(btn.dataset.num);
      if (btn.dataset.op !== undefined) return chooseOp(btn.dataset.op);
      switch (btn.dataset.action) {
        case 'decimal': return inputDecimal();
        case 'equals':  return equals();
        case 'clear':   return clearAll();
        case 'negate':  return negate();
        case 'percent': return percent();
      }
    });
  });

  // ---- Gestes cachés pour ouvrir les réglages ----------------------------
  // (a) Appui long 2s sur AC
  const acKey = document.getElementById('acKey');
  let acTimer = null;
  const startLong = () => { acTimer = setTimeout(openSettings, 2000); };
  const cancelLong = () => { if (acTimer) { clearTimeout(acTimer); acTimer = null; } };
  acKey.addEventListener('touchstart', startLong, { passive: true });
  acKey.addEventListener('mousedown', startLong);
  ['touchend', 'touchmove', 'touchcancel', 'mouseup', 'mouseleave'].forEach(ev =>
    acKey.addEventListener(ev, cancelLong));

  // (b) Double-tap sur l'écran d'affichage
  const displayEl = document.getElementById('display');
  let lastTap = 0;
  displayEl.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap < 350) { openSettings(); lastTap = 0; }
    else { lastTap = now; }
  });

  // ---- Écran réglages -----------------------------------------------------
  const settingsEl = document.getElementById('settings');
  const calcEl = document.getElementById('calc');
  const codeListEl = document.getElementById('codeList');

  function renderCodeList() {
    codeListEl.innerHTML = '';
    codes.forEach((c, i) => {
      const item = document.createElement('div');
      item.className = 'code-item';
      item.innerHTML = `
        <div class="row">
          <div>
            <label>Expression</label>
            <input type="text" data-i="${i}" data-k="expr" value="${escapeHtml(c.expr)}" placeholder="2+2" />
          </div>
        </div>
        <div>
          <label>URL cible</label>
          <input type="url" data-i="${i}" data-k="url" value="${escapeHtml(c.url || '')}" placeholder="https://..." />
        </div>
        <button class="remove" data-rm="${i}">Supprimer</button>`;
      codeListEl.appendChild(item);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
  }

  // Sauvegarde à la volée quand un champ change
  codeListEl.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.i === undefined) return;
    const i = +t.dataset.i, k = t.dataset.k;
    codes[i][k] = t.value;
    saveCodes(codes);
  });
  codeListEl.addEventListener('click', e => {
    if (e.target.dataset.rm !== undefined) {
      codes.splice(+e.target.dataset.rm, 1);
      saveCodes(codes);
      renderCodeList();
    }
  });

  document.getElementById('addCode').addEventListener('click', () => {
    codes.push({ expr: '', url: '' });
    saveCodes(codes);
    renderCodeList();
  });
  document.getElementById('resetCodes').addEventListener('click', () => {
    codes = structuredClone(DEFAULT_CODES);
    saveCodes(codes);
    renderCodeList();
  });
  document.getElementById('closeSettings').addEventListener('click', closeSettings);

  function openSettings() {
    renderCodeList();
    settingsEl.classList.remove('hidden');
    calcEl.classList.add('hidden');
  }
  function closeSettings() {
    settingsEl.classList.add('hidden');
    calcEl.classList.remove('hidden');
    clearAll();
  }

  // ---- Init ---------------------------------------------------------------
  render();

  // Enregistrement du service worker (cache hors-ligne, portée ./)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    });
  }
})();
