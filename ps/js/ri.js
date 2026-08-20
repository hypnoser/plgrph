// ri.js — RI_API
// Вкладка «R&I»: методика Relevant/Irrelevant з ранговим підрахунком FROSS
// (Field Rank Order Scoring System, «Велика трійка» / «High Three»).
// Джерело: Krapohl D., Shaw P. Fundamentals of Polygraph Practice. 2015. P. 122;
// Шаповалов В.О. та ін. Технологія застосування методик RI, POT та СІТ. 2020. С. 34-40.
//
// ВАЖЛИВО: FROSS — допоміжний, вторинний метод аналізу. Він НЕ визначає SR/NSR/NO —
// це рішення приймається поліграфологом глобально. FROSS лише допомагає визначити,
// яке(і) релевантне(і) питання найзначущіші для подальшого уточнюючого дослідження.
//
// Архітектура: масив незалежних тестів (за зразком ESS_API) — кожен тест має власну
// назву, кількість пред'явлень (3-5), таблицю рангів і графік значущості питань.

window.RI_API = (function () {
  'use strict';
  var S = window.STRINGS;

  var QUESTIONS = 5; // фіксовано за методикою FROSS
  var MIN_PRES = 3, MAX_PRES = 5;
  var CHANNELS = [
    { id: 'p', label: 'P' },
    { id: 'e', label: 'E' },
    { id: 'c', label: 'C' }
  ];
  var BAR_COLORS = ['#e24b4a', '#eda100', '#f0c419']; // топ-1, топ-2, топ-3 за унікальним значенням
  var BAR_COLOR_DEFAULT = '#b4b2a9';

  var appRoot, testsContainer, addBtnBottom;
  var testCounter = 0;

  var triggerUnsaved = function () { if (window.APP_API) window.APP_API.markUnsaved(); };
  var performSave = function () { if (window.APP_API) window.APP_API.performSave(); };

  function sanitizeRank(val) {
    val = val.trim();
    if (val === '' || val === '0' || val === '1' || val === '2' || val === '3') return val;
    return '';
  }

  function key(presIdx, chId, qIdx) { return presIdx + '_' + chId + '_' + qIdx; }

  // ── Підрахунок SUBTOTALS/Grand Total для одного тесту (працює з живим DOM) ──
  function computeSubtotals(wrapper, presIdx) {
    var totals = [0, 0, 0, 0, 0];
    CHANNELS.forEach(function (ch) {
      for (var q = 0; q < QUESTIONS; q++) {
        var inp = wrapper.querySelector('.ri-rank-input[data-key="' + key(presIdx, ch.id, q) + '"]');
        var v = inp ? inp.value : '';
        if (v) totals[q] += parseInt(v, 10);
      }
    });
    return totals;
  }

  function computeGrandTotals(wrapper, numPresentations) {
    var grand = [0, 0, 0, 0, 0];
    for (var p = 0; p < numPresentations; p++) {
      computeSubtotals(wrapper, p).forEach(function (v, i) { grand[i] += v; });
    }
    return grand;
  }

  function colorForPosition(pos) {
    if (pos >= 0 && pos < 3) return BAR_COLORS[pos];
    return BAR_COLOR_DEFAULT;
  }

  // ── Рендер графіка значущості (сортований спадання зліва направо) ──
  function renderChart(wrapper, grand) {
    var chartEl = wrapper.querySelector('.ri-chart');
    if (!chartEl) return;
    var maxV = Math.max.apply(null, grand);
    var hasAny = grand.some(function (v) { return v > 0; });

    var indexed = grand.map(function (v, i) { return { q: i + 1, val: v }; });
    indexed.sort(function (a, b) { return b.val - a.val; });

    if (!hasAny) {
      chartEl.innerHTML = '<div class="ri-chart-empty">' + S.ri_chart_empty + '</div>';
      return;
    }

    // Рівно перші 3 позиції відсортованого масиву фарбуються (з дублікатами балів),
    // решта — сірим. Нулі завжди сірі, навіть якщо потрапляють у перші три позиції.
    var html = '';
    indexed.forEach(function (item, pos) {
      var h = maxV > 0 ? Math.round((item.val / maxV) * 90) + 10 : 10;
      var color = item.val === 0 ? BAR_COLOR_DEFAULT : colorForPosition(pos);
      html += '<div class="ri-bar-col">' +
        '<span class="ri-bar-val">' + item.val + '</span>' +
        '<div class="ri-bar" style="height:' + h + 'px;background:' + color + '"></div>' +
        '<span class="ri-bar-label">R' + item.q + '</span>' +
      '</div>';
    });
    chartEl.innerHTML = html;
  }

  // ── Текстовий висновок ──────────────────────────────────────
  function renderConclusion(wrapper, grand) {
    var el = wrapper.querySelector('.ri-conclusion');
    if (!el) return;
    var maxVal = Math.max.apply(null, grand);
    var hasAny = grand.some(function (v) { return v > 0; });
    if (!hasAny) { el.innerHTML = ''; return; }

    var winners = [];
    grand.forEach(function (v, i) { if (v === maxVal) winners.push('R' + (i + 1)); });

    var text;
    if (winners.length === 1) {
      text = '<strong>' + S.ri_concl_single_prefix + ' ' + winners[0] + '</strong> (' + S.ri_concl_rank_label + ' ' + maxVal + '). ' + S.ri_concl_recommendation;
    } else {
      text = '<strong>' + S.ri_concl_multi_prefix + ' ' + winners.join(', ') + '</strong> (' + S.ri_concl_rank_label + ' ' + maxVal + '). ' + S.ri_concl_recommendation_multi;
    }
    el.innerHTML = text;
  }

  // ── Рендер таблиці рангів для одного тесту ─────────────────
  function renderTable(wrapper, numPresentations, savedScores) {
    var tableWrap = wrapper.querySelector('.ri-table-wrap');
    var scores = wrapper._riScores || savedScores || {};
    wrapper._riScores = scores;

    var html = '<div class="ri-table-responsive"><table class="ri-table"><thead><tr>' +
      '<th scope="col" class="ri-th-label">FROSS</th>';
    for (var q = 1; q <= QUESTIONS; q++) html += '<th scope="col">R' + q + '</th>';
    html += '</tr></thead><tbody>';

    for (var p = 0; p < numPresentations; p++) {
      html += '<tr class="ri-pres-row"><td colspan="' + (QUESTIONS + 1) + '">' + S.ri_presentation + ' №' + (p + 1) + '</td></tr>';
      CHANNELS.forEach(function (ch) {
        html += '<tr><th scope="row" class="ri-row-label">' + ch.label + '</th>';
        for (var q = 0; q < QUESTIONS; q++) {
          var k = key(p, ch.id, q);
          var v = scores[k] || '';
          html += '<td><input type="text" class="ri-rank-input" data-key="' + k + '" value="' + v + '" inputmode="numeric" maxlength="1" autocomplete="off"></td>';
        }
        html += '</tr>';
      });
      html += '<tr class="ri-sub-row" data-pres="' + p + '"><th scope="row" class="ri-row-label">SUBTOTALS</th>';
      for (var sc = 0; sc < QUESTIONS; sc++) html += '<td></td>';
      html += '</tr>';
    }

    html += '<tr class="ri-grand-row"><th scope="row" class="ri-row-label">' + S.ri_grand_total + '</th>';
    for (var g = 0; g < QUESTIONS; g++) html += '<td></td>';
    html += '</tr>';

    html += '</tbody></table></div>';
    tableWrap.innerHTML = html;

    // Заповнюємо SUBTOTALS/Grand Total і навішуємо обробники
    updateAll(wrapper, numPresentations);

    tableWrap.querySelectorAll('.ri-rank-input').forEach(function (inp) {
      inp.addEventListener('input', function (e) {
        var caretPos = e.target.selectionStart;
        var clean = sanitizeRank(e.target.value);
        e.target.value = clean;
        try { e.target.setSelectionRange(caretPos, caretPos); } catch (err) {}
        scores[inp.getAttribute('data-key')] = clean;
        triggerUnsaved();
        updateAll(wrapper, numPresentations);
      });
      inp.addEventListener('blur', performSave);
    });
  }

  // ── Point-update: перераховує SUBTOTALS/Grand Total/графік/висновок без перебудови DOM ──
  function updateAll(wrapper, numPresentations) {
    for (var p = 0; p < numPresentations; p++) {
      var sub = computeSubtotals(wrapper, p);
      var row = wrapper.querySelector('.ri-sub-row[data-pres="' + p + '"]');
      if (row) {
        var cells = row.querySelectorAll('td');
        sub.forEach(function (v, i) { if (cells[i]) cells[i].textContent = v || ''; });
      }
    }
    var grand = computeGrandTotals(wrapper, numPresentations);
    var maxVal = Math.max.apply(null, grand);
    var hasAny = grand.some(function (v) { return v > 0; });
    var grandRow = wrapper.querySelector('.ri-grand-row');
    if (grandRow) {
      var gCells = grandRow.querySelectorAll('td');
      grand.forEach(function (v, i) {
        if (!gCells[i]) return;
        gCells[i].textContent = v;
        gCells[i].className = (hasAny && v === maxVal && maxVal > 0) ? 'ri-max' : '';
      });
    }
    renderChart(wrapper, grand);
    renderConclusion(wrapper, grand);
  }

  // ── Створення одного тестового блоку ───────────────────────
  function createTest(data) {
    testCounter++;
    var wrapper = document.createElement('div');
    wrapper.className = 'ri-test-wrapper';

    var numPresentations = (data && data.numPresentations >= MIN_PRES && data.numPresentations <= MAX_PRES) ? data.numPresentations : 4;
    var titleVal = data && data.title ? data.title : '';
    var savedScores = data && data.scores ? data.scores : {};

    wrapper.innerHTML =
      '<div class="ri-test-top-bar">' +
        '<div class="ri-test-title-area">' +
          '<span class="ri-test-num-label">' + S.test_num + testCounter + ':</span>' +
          '<input type="text" class="ri-title-input" placeholder="' + S.ri_test_title_placeholder + '" value="' + titleVal + '">' +
        '</div>' +
        '<button class="ri-delete-btn" title="' + S.ess_delete_test_title + '">×</button>' +
      '</div>' +
      '<div class="ri-toolbar">' +
        '<div class="ri-toolbar-group">' +
          '<label>' + S.ri_questions_label + '</label><span style="font-size:13px;font-weight:700;">' + QUESTIONS + '</span><span class="ri-hint">(' + S.ri_questions_fixed_hint + ')</span>' +
        '</div>' +
        '<div class="ri-toolbar-group">' +
          '<label>' + S.ri_presentations_label + '</label>' +
          '<select class="ri-pres-select">' +
            [3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (n === numPresentations ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
          '</select>' +
          '<span class="ri-hint">(' + MIN_PRES + '-' + MAX_PRES + ')</span>' +
        '</div>' +
      '</div>' +
      '<div class="ri-table-wrap"></div>' +
      '<div class="ri-chart-container">' +
        '<div class="ri-chart-title">' + S.ri_chart_title + '</div>' +
        '<div class="ri-chart"></div>' +
      '</div>' +
      '<div class="ri-conclusion-box"><span class="ri-conclusion"></span></div>';

    wrapper._riNumPresentations = numPresentations;
    renderTable(wrapper, numPresentations, savedScores);

    wrapper.querySelector('.ri-title-input').addEventListener('input', triggerUnsaved);
    wrapper.querySelector('.ri-title-input').addEventListener('blur', performSave);

    wrapper.querySelector('.ri-pres-select').addEventListener('change', function (e) {
      wrapper._riNumPresentations = parseInt(e.target.value, 10);
      triggerUnsaved();
      renderTable(wrapper, wrapper._riNumPresentations, wrapper._riScores);
      performSave();
    });

    wrapper.querySelector('.ri-delete-btn').addEventListener('click', function () {
      if (confirm(S.ess_confirm_delete_test)) {
        wrapper.remove();
        triggerUnsaved();
        performSave();
      }
    });

    testsContainer.appendChild(wrapper);
    return wrapper;
  }

  // ── CSS ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ri-styles')) return;
    var style = document.createElement('style');
    style.id = 'ri-styles';
    style.textContent = [
      '.ri-module-container{max-width:880px;margin:0 auto;width:100%;padding-bottom:20px;}',
      '.ri-test-wrapper{margin-bottom:15px;border:1px solid #ccc;padding:8px 12px;border-radius:6px;background-color:#fff;width:100%;}',
      '.ri-test-top-bar{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}',
      '.ri-test-title-area{display:flex;align-items:baseline;width:100%;margin-bottom:6px;font-size:13px;font-weight:700;flex-wrap:wrap;}',
      '.ri-test-num-label{font-size:12px;color:#666;margin-right:6px;}',
      '.ri-title-input{flex-grow:1;min-width:150px;border:none;border-bottom:1px solid transparent;background:transparent;font-size:13px;font-weight:700;color:inherit;padding:2px 4px;outline:none;line-height:1.2;}',
      '.ri-title-input:focus{border-bottom-color:#3a7cfd;background-color:rgba(128,128,128,.06);border-radius:3px 3px 0 0;}',
      '.ri-delete-btn{font-size:16px;font-weight:bold;color:#ff0000;background:rgba(255,0,0,.1);border:1px solid #ff0000;border-radius:4px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;line-height:1;flex-shrink:0;}',
      '.ri-delete-btn:hover{background-color:#ff0000;color:#fff;}',
      '.ri-toolbar{display:flex;align-items:center;gap:16px;margin-bottom:10px;flex-wrap:wrap;}',
      '.ri-toolbar-group{display:flex;align-items:center;gap:6px;}',
      '.ri-toolbar label{font-size:12px;font-weight:600;color:#555;}',
      '.ri-toolbar select{min-width:50px;font-size:12px;padding:2px 4px;}',
      '.ri-hint{font-size:10.5px;color:#999;}',
      '.ri-table-responsive{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:6px;background:#fff;border:1px solid #ccc;margin-bottom:10px;position:relative;}',
      '.ri-table{width:100%;min-width:480px;border-collapse:collapse;table-layout:fixed;}',
      '.ri-table th,.ri-table td{border:1px solid #888;padding:2px;text-align:center;vertical-align:middle;height:24px;}',
      '.ri-table thead th{position:sticky;top:0;z-index:5;background:#e0e0e0;font-weight:800;font-size:12px;color:#222;padding:4px 2px;border-bottom-color:transparent;box-shadow:inset 0 -1px 0 #888;}',
      '.ri-th-label{width:16%;}',
      '.ri-row-label{text-align:left;padding-left:8px;font-weight:normal;font-size:11px;white-space:nowrap;background:rgba(128,128,128,.04);}',
      '.ri-pres-row td{text-align:left;font-weight:600;font-size:11px;background:rgba(58,124,253,.06);color:#3a7cfd;padding:4px 8px;}',
      '.ri-sub-row td{font-weight:600;background:rgba(128,128,128,.08);font-size:12px;}',
      '.ri-grand-row td,.ri-grand-row th{font-weight:800;background:rgba(58,124,253,.1);font-size:15px;color:#222;}',
      '.ri-rank-input{width:24px;height:22px;text-align:center;padding:0;font-size:12px;font-weight:700;border:1px solid #bbb;border-radius:3px;outline:none;font-family:inherit;}',
      '.ri-rank-input:focus{border-color:#3a7cfd;background:rgba(58,124,253,.06);}',
      '.ri-max{background-color:#2e7d32!important;color:#fff!important;font-weight:800;}',
      '.ri-chart-container{margin-top:8px;padding:6px 10px;background:rgba(128,128,128,.03);border-radius:4px;border:1px solid #ddd;}',
      '.ri-chart-title{font-size:10px;font-weight:bold;text-transform:uppercase;color:#555;letter-spacing:.5px;margin-bottom:8px;}',
      '.ri-chart{display:flex;align-items:flex-end;gap:14px;height:110px;padding:0 6px;}',
      '.ri-bar-col{display:flex;flex-direction:column;align-items:center;flex:1;gap:5px;height:100%;justify-content:flex-end;min-width:0;}',
      '.ri-bar-val{font-size:11px;font-weight:600;color:#333;}',
      '.ri-bar{width:65%;border-radius:4px 4px 0 0;transition:height .3s;}',
      '.ri-bar-label{font-size:11px;color:#666;font-weight:600;}',
      '.ri-chart-empty{font-size:11px;color:#999;text-align:center;padding:20px 0;}',
      '.ri-conclusion-box{padding:8px 10px;background:rgba(46,125,50,.05);border:1px solid #ddd;border-left:3px solid #2e7d32;border-radius:4px;font-size:12.5px;line-height:1.4;color:#333;min-height:14px;}',
      '.ri-add-btn{color:#fff;background-color:#3a7cfd;display:block;width:100%;margin-top:15px;padding:8px 0;font-size:13px;text-align:center;border:none;border-radius:5px;cursor:pointer;font-weight:bold;transition:background .2s;}',
      '.ri-add-btn:hover{background-color:#2a68e0;}',
      '@media (max-width:720px){.ri-table-responsive{overflow-x:auto;}.ri-table thead th{position:static;box-shadow:none;}}',
      '@media print{.ri-toolbar,.ri-delete-btn,.ri-add-btn{display:none!important;}.ri-table thead th{position:static!important;box-shadow:none!important;}}'
    ].join('');
    document.head.appendChild(style);
  }

  // ── Публічний API ──────────────────────────────────────────
  return {
    init: function () {
      appRoot = document.getElementById('ri-app');
      if (!appRoot) return;
      injectStyles();

      var container = document.createElement('div');
      container.className = 'ri-module-container';

      testsContainer = document.createElement('div');
      addBtnBottom = document.createElement('button');
      addBtnBottom.className = 'ri-add-btn';
      addBtnBottom.textContent = S.ri_add_btn;
      addBtnBottom.addEventListener('click', function () {
        createTest(null);
        triggerUnsaved();
        performSave();
      });

      container.appendChild(testsContainer);
      container.appendChild(addBtnBottom);
      appRoot.appendChild(container);
    },

    collectState: function () {
      return Array.from(testsContainer.querySelectorAll('.ri-test-wrapper')).map(function (wrapper) {
        var titleInput = wrapper.querySelector('.ri-title-input');
        return {
          title: titleInput ? titleInput.value : '',
          numPresentations: wrapper._riNumPresentations || 4,
          scores: wrapper._riScores || {}
        };
      });
    },

    restoreState: function (data) {
      testsContainer.innerHTML = '';
      testCounter = 0;
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(function (d) { createTest(d); });
      } else {
        createTest(null);
      }
    }
  };
})();
