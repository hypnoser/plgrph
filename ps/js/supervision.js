// supervision.js — SUPERVISION_API
// Вкладка «Супервізія»: другий поліграфолог (супервізор) перевіряє
// вже заповнені ESS-M тести, вводячи власні бали поруч із балами
// поліграфолога (нередаговані, підтягуються з ESS_API.collectState()).
// Дані зберігаються per-test у this.state (масив, індекс = індекс тесту в ESS).

window.SUPERVISION_API = (function () {
  'use strict';
  var S = window.STRINGS;

  var root, selectEl, summaryEl, conclusionEl, tableWrapEl;
  var state = []; // state[testIndex] = { scores: { 'chart_col_rowId': 'value' } }
  var currentTestIndex = -1;

  var triggerUnsaved = function () { if (window.APP_API) window.APP_API.markUnsaved(); };

  // ── Валідація вводу (той самий формат, що й у основній ESS-таблиці) ──
  function sanitizeInputValue(val, isEda) {
    val = val.trim().toLowerCase();
    if (val.startsWith('+')) val = val.slice(1);
    if (val === 'a' || val === 'а' || val === 'f' || val === 'ф') return 'А';
    if (val === '00') return '∅';
    if (val === '' || val === '-' || val === '∅' || val === 'а') return val === 'а' ? 'А' : val;
    var num = Number(val);
    if (isNaN(num)) return '';
    if (isEda && num !== -2 && num !== 0 && num !== 2) return '';
    if (!isEda && Math.abs(num) > 1) return '';
    return val;
  }

  // ── Список тестів у dropdown (лише ті, що поліграфолог реально заповнив) ──
  function isTestFilled(test) {
    if (!test || !test.values) return false;
    return Object.keys(test.values).some(function (k) { return test.values[k] !== ''; });
  }

  function getEssTests() {
    return window.ESS_API ? window.ESS_API.collectState() : [];
  }

  function renderTestOptions() {
    var tests = getEssTests();
    selectEl.innerHTML = '';
    var filledIndexes = [];
    tests.forEach(function (t, i) {
      if (!isTestFilled(t)) return;
      filledIndexes.push(i);
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = S.test_num + (i + 1) + ': ' + (t.title || t.format || '');
      selectEl.appendChild(opt);
    });

    if (filledIndexes.length === 0) {
      tableWrapEl.innerHTML = '<div class="sv-empty">' + S.sv_no_tests + '</div>';
      summaryEl.innerHTML = '';
      if (conclusionEl) conclusionEl.innerHTML = '';
      currentTestIndex = -1;
      return;
    }

    if (currentTestIndex === -1 || filledIndexes.indexOf(currentTestIndex) === -1) {
      currentTestIndex = filledIndexes[0];
    }
    selectEl.value = currentTestIndex;
    renderTable();
  }

  // ── Обчислення дельти для однієї клітинки (спільна логіка для рендеру й метрик) ──
  function computeCellDelta(svVal, polyVal) {
    if (svVal === undefined || svVal === '' || polyVal === undefined || polyVal === '') return null;
    if (svVal === polyVal) return { match: true, abs: 0, artifactConflict: false };
    var svNum = (svVal === 'А' || svVal === 'A') ? null : (svVal === '∅' ? 0 : parseFloat(svVal));
    var polyNum = (polyVal === 'А' || polyVal === 'A') ? null : (polyVal === '∅' ? 0 : parseFloat(polyVal));
    if (svNum !== null && polyNum !== null && !isNaN(svNum) && !isNaN(polyNum)) {
      return { match: false, abs: Math.abs(svNum - polyNum), signed: svNum - polyNum, artifactConflict: false };
    }
    return { match: false, abs: null, artifactConflict: true };
  }

  // ── Метрики (сервісний блок) + розбивка розбіжностей по каналах для висновку ──
  function computeMetrics(test, scores) {
    var values = test.values || {};
    var totalCells = 0, filledCells = 0, matches = 0, deltaSum = 0;
    var byChannel = {}; // rowId -> { count, deltaSum, label }
    var channelLabels = {
      'pneumo-v': S.ess_row_pneumo_v, 'pneumo-n': S.ess_row_pneumo_n,
      'eda': S.ess_row_eda, 'cardio': S.ess_row_cardio, 'ppg': S.ess_row_ppg
    };

    Object.keys(values).forEach(function (key) {
      var polyVal = values[key];
      if (polyVal === undefined || polyVal === '') return;
      totalCells++;
      var svVal = scores[key];
      if (svVal === undefined || svVal === '') return;
      filledCells++;

      var d = computeCellDelta(svVal, polyVal);
      if (!d) return;
      if (d.match) { matches++; return; }

      var rowId = key.split('_')[2];
      if (!byChannel[rowId]) byChannel[rowId] = { count: 0, deltaSum: 0, label: channelLabels[rowId] || rowId };
      byChannel[rowId].count++;
      if (d.abs !== null) { deltaSum += d.abs; byChannel[rowId].deltaSum += d.abs; }
      else { byChannel[rowId].deltaSum += 2; deltaSum += 2; } // артефакт-конфлікт важить як суттєва розбіжність
    });

    return { totalCells: totalCells, filledCells: filledCells, matches: matches, deltaSum: deltaSum, byChannel: byChannel };
  }

  function pctColor(pct) {
    if (pct >= 90) return '#2e7d32';
    if (pct >= 75) return '#7cb342';
    if (pct >= 50) return '#f57c00';
    return '#d32f2f';
  }

  function renderSummary(test, scores) {
    var m = computeMetrics(test, scores);
    var pct = m.filledCells > 0 ? Math.round((m.matches / m.filledCells) * 100) : null;
    var pctColorVal = pct === null ? '#999' : pctColor(pct);
    summaryEl.innerHTML =
      '<div class="sv-metric"><div class="sv-metric-label">' + S.sv_metric_filled + '</div><div class="sv-metric-value">' + m.filledCells + ' / ' + m.totalCells + '</div></div>' +
      '<div class="sv-metric"><div class="sv-metric-label">' + S.sv_metric_match + '</div><div class="sv-metric-value" style="color:' + pctColorVal + '">' + (pct === null ? '—' : pct + '%') + '</div></div>' +
      '<div class="sv-metric"><div class="sv-metric-label">' + S.sv_metric_delta + '</div><div class="sv-metric-value">' + (m.filledCells > 0 ? m.deltaSum : '—') + '</div></div>';

    renderConclusion(m, pct);
  }

  // ── Текстовий висновок: найпроблемніший канал(и) + загальна оцінка ──
  function renderConclusion(m, pct) {
    if (!conclusionEl) return;
    if (m.filledCells === 0) { conclusionEl.innerHTML = ''; return; }

    var channels = Object.keys(m.byChannel).map(function (id) { return m.byChannel[id]; });
    channels.sort(function (a, b) { return b.deltaSum - a.deltaSum; });

    var lines = [];
    if (pct === 100) {
      lines.push('<span class="sv-concl-ok">' + S.sv_concl_perfect + '</span>');
    } else if (channels.length === 0) {
      lines.push('<span class="sv-concl-ok">' + S.sv_concl_ok + '</span>');
    } else {
      var worst = channels[0];
      var cls = worst.deltaSum >= 3 ? 'sv-concl-bad' : 'sv-concl-warn';
      lines.push('<span class="' + cls + '">' + S.sv_concl_worst_prefix + ' «' + worst.label + '» (' + S.sv_concl_worst_suffix.replace('{n}', worst.count) + ', \u03a3=' + worst.deltaSum + ').</span>');

      if (channels.length > 1) {
        var others = channels.slice(1).map(function (c) { return c.label; }).join(', ');
        lines.push('<span class="sv-concl-note">' + S.sv_concl_also + ' ' + others + '.</span>');
      }
    }

    conclusionEl.innerHTML = '<div class="sv-conclusion">' + lines.join(' ') + '</div>';
  }

  // ── Point-update однієї клітинки (без перебудови всієї таблиці) ──
  function updateCellVisual(inp, key, test, scores) {
    var td = inp.closest ? inp.closest('.sv-cell') : inp.parentElement;
    if (!td) return;
    var deltaSpan = td.querySelector('.sv-delta');
    if (!deltaSpan) return;

    var polyVal = (test.values || {})[key];
    var svVal = scores[key];
    var d = computeCellDelta(svVal, polyVal);

    deltaSpan.className = 'sv-delta';
    if (!d) { deltaSpan.textContent = ''; return; }
    if (d.artifactConflict) { deltaSpan.textContent = '\u2260'; deltaSpan.classList.add('sv-delta-high'); return; }
    if (d.match) { deltaSpan.textContent = '='; deltaSpan.classList.add('sv-delta-match'); return; }
    var dCls = d.abs >= 2 ? 'sv-delta-high' : 'sv-delta-low';
    deltaSpan.classList.add(dCls);
    deltaSpan.textContent = d.signed === 0 ? '=' : (d.signed > 0 ? '+' + d.signed : String(d.signed));
  }

  // ── Рендер таблиці для поточного тесту (будується один раз при виборі тесту) ──
  function renderTable() {
    if (currentTestIndex === -1) return;
    var tests = getEssTests();
    var test = tests[currentTestIndex];
    if (!test) return;

    if (!state[currentTestIndex]) state[currentTestIndex] = { scores: {} };
    var scores = state[currentTestIndex].scores;

    if (!window.ESS_API || !window.ESS_API.getSupervisionTableHtml) {
      tableWrapEl.innerHTML = '';
      return;
    }
    tableWrapEl.innerHTML = window.ESS_API.getSupervisionTableHtml(test, scores);
    renderSummary(test, scores);

    tableWrapEl.querySelectorAll('.sv-score-input').forEach(function (inp) {
      inp.addEventListener('input', function (e) {
        var key = inp.getAttribute('data-key');
        var isEda = key.split('_')[2] === 'eda';
        var caretPos = e.target.selectionStart;
        var clean = sanitizeInputValue(e.target.value, isEda);
        e.target.value = clean;
        try { e.target.setSelectionRange(caretPos, caretPos); } catch (err) {}
        scores[key] = clean;
        triggerUnsaved();
        // Point-update: оновлюємо лише цю клітинку і сервісний блок, без перебудови таблиці
        updateCellVisual(inp, key, test, scores);
        renderSummary(test, scores);
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          var key = inp.getAttribute('data-key');
          var isEda = key.split('_')[2] === 'eda';
          inp.value = isEda ? '-2' : '-1';
          inp.dispatchEvent(new Event('input'));
        }
      });
    });
  }

  // ── CSS ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('sv-styles')) return;
    var style = document.createElement('style');
    style.id = 'sv-styles';
    style.textContent = [
      '.sv-container{max-width:880px;margin:0 auto;width:100%;padding-bottom:30px;}',
      '.sv-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;}',
      '.sv-toolbar label{font-size:13px;font-weight:600;color:#555;}',
      '.sv-toolbar select{min-width:220px;}',
      '.sv-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;}',
      '.sv-metric{background:rgba(128,128,128,.06);border:1px solid #ddd;border-radius:6px;padding:10px 12px;}',
      '.sv-metric-label{font-size:11px;color:#777;margin-bottom:2px;}',
      '.sv-metric-value{font-size:19px;font-weight:800;color:#222;}',
      '.sv-conclusion{background:#fff;border:1px solid #ddd;border-left:3px solid #999;border-radius:4px;padding:9px 12px;margin-bottom:16px;font-size:12.5px;line-height:1.5;color:#333;}',
      '.sv-concl-ok{color:#2e7d32;font-weight:600;}',
      '.sv-concl-warn{color:#c26a00;font-weight:600;}',
      '.sv-concl-bad{color:#d32f2f;font-weight:600;}',
      '.sv-concl-note{color:#777;}',
      '.sv-empty{text-align:center;padding:30px;color:#999;font-size:13px;background:#fff;border:1px solid #ddd;border-radius:6px;}',
      '.sv-table-responsive{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:6px;background:#fff;border:1px solid #ccc;}',
      '.sv-table{width:100%;min-width:700px;border-collapse:collapse;table-layout:fixed;}',
      '.sv-table th,.sv-table td{border:1px solid #ccc;padding:2px;text-align:center;vertical-align:middle;}',
      '.sv-th-label{width:13%;background:rgba(128,128,128,.15);font-weight:800;font-size:11px;padding:5px 6px;}',
      '.sv-th-question{width:21.75%;background:rgba(128,128,128,.15);font-weight:800;font-size:10.5px;padding:5px 3px;}',
      '.sv-col-disabled{background:repeating-linear-gradient(45deg,#e0e0e0,#e0e0e0 4px,#ededed 4px,#ededed 8px)!important;}',
      '.sv-chart-row td{text-align:left;font-weight:600;font-size:11px;background:rgba(58,124,253,.06);color:#3a7cfd;padding:4px 8px;}',
      '.sv-row-label{text-align:left;padding-left:8px;font-weight:normal;font-size:10.5px;white-space:nowrap;background:rgba(128,128,128,.04);}',
      '.sv-cell{display:flex;align-items:center;justify-content:center;gap:2px;padding:2px 1px;}',
      '.sv-score-input{width:22px;height:24px;text-align:center;padding:0;font-size:12px;font-weight:700;border:1px solid #bbb;border-radius:3px;outline:none;font-family:inherit;flex-shrink:0;}',
      '.sv-score-input:focus{border-color:#3a7cfd;background:rgba(58,124,253,.06);}',
      '.sv-poly-val{font-size:10.5px;color:#999;width:14px;text-align:center;flex-shrink:0;}',
      '.sv-delta{font-size:9px;font-weight:700;width:16px;text-align:center;flex-shrink:0;}',
      '.sv-delta-match{color:#888;}',
      '.sv-delta-low{color:#d8832b;}',
      '.sv-delta-high{color:#ff0000;}',
      '@media (max-width:650px){.sv-summary{grid-template-columns:1fr;}}',
      '@media print{.sv-toolbar{display:none!important;}}'
    ].join('');
    document.head.appendChild(style);
  }

  // ── Побудова UI ─────────────────────────────────────────────
  function buildUI(rootEl) {
    var container = document.createElement('div');
    container.className = 'sv-container';

    var toolbar = document.createElement('div');
    toolbar.className = 'sv-toolbar';
    var label = document.createElement('label');
    label.textContent = S.sv_select_test_label;
    selectEl = document.createElement('select');
    selectEl.addEventListener('change', function () {
      currentTestIndex = parseInt(selectEl.value, 10);
      renderTable();
    });
    toolbar.appendChild(label);
    toolbar.appendChild(selectEl);

    summaryEl = document.createElement('div');
    summaryEl.className = 'sv-summary';

    conclusionEl = document.createElement('div');

    tableWrapEl = document.createElement('div');

    container.appendChild(toolbar);
    container.appendChild(summaryEl);
    container.appendChild(conclusionEl);
    container.appendChild(tableWrapEl);
    rootEl.appendChild(container);
  }

  // ── Публічний API ──────────────────────────────────────────
  return {
    init: function () {
      root = document.getElementById('supervision-app');
      if (!root) return;
      injectStyles();
      buildUI(root);
    },

    // Викликається при перемиканні на цю вкладку, щоб побачити свіжі дані ESS
    refresh: function () {
      if (!selectEl) return;
      renderTestOptions();
    },

    collectState: function () {
      return state;
    },

    restoreState: function (data) {
      state = Array.isArray(data) ? data : [];
      currentTestIndex = -1;
      if (selectEl) renderTestOptions();
    }
  };
})();
