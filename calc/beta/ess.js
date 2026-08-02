document.addEventListener('DOMContentLoaded', function() {
  
  var container = document.getElementById('ess-tests-container');
  var btnAdd = document.getElementById('btn-add-ess');
  var testCounter = 0;

  // ==========================================
  // 1. СТВОРЕННЯ HTML ДЛЯ ОДНОГО ТЕСТУ ESS-M
  // ==========================================
  function createEssTest(data) {
    testCounter++;
    var tId = "ess-test-" + testCounter;
    data = data || { format: 'ZCT', contamination: false, qs: ['R1', 'R2', 'R3', 'R4'], cells: {} };

    var wrapper = document.createElement('div');
    wrapper.className = 'ess-test-wrapper';
    wrapper.id = tId;

    var html = `
      <div class="ess-test-top-bar">
        <div class="ess-top-bar-left">
          <select class="ess-format-select">
            <option value="DLST" ${data.format === 'DLST' ? 'selected' : ''}>DLST (2 питання)</option>
            <option value="ZCT" ${data.format === 'ZCT' ? 'selected' : ''}>ZCT (3 питання)</option>
            <option value="AFMGQT" ${data.format === 'AFMGQT' ? 'selected' : ''}>AFMGQT (4 питання)</option>
          </select>
          <div class="ess-type-toggle">
            <input type="checkbox" id="contam-${tId}" class="contam-check" ${data.contamination ? 'checked' : ''}>
            <label for="contam-${tId}">🔒 Контамінація (Spot Rule)</label>
          </div>
          <button class="ess-btn btn-questions">📝 Питання</button>
        </div>
        <button class="ess-delete-btn" title="Видалити тест">×</button>
      </div>

      <div class="ess-test-title-area">
        <span class="ess-test-num-label">Тест ${testCounter}</span>
        <input type="text" class="ess-test-name" placeholder="Назва тесту (наприклад: Тест №1. ZCT змішаний)..." value="${data.title || ''}">
      </div>

      <div class="ess-table-responsive">
        <table class="ess-table">
          <thead>
            <tr>
              <th style="width: 120px;">Канал / Питання</th>
              <th class="col-r1">R1</th>
              <th class="col-r2">R2</th>
              <th class="col-r3">R3</th>
              <th class="col-r4">R4</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="row-label">Дихання "В"</td>
              <td class="col-r1"><input type="text" class="score-input p1" data-q="1" value="${data.cells['p1-1'] || ''}"></td>
              <td class="col-r2"><input type="text" class="score-input p1" data-q="2" value="${data.cells['p1-2'] || ''}"></td>
              <td class="col-r3"><input type="text" class="score-input p1" data-q="3" value="${data.cells['p1-3'] || ''}"></td>
              <td class="col-r4"><input type="text" class="score-input p1" data-q="4" value="${data.cells['p1-4'] || ''}"></td>
            </tr>
            <tr>
              <td class="row-label">Дихання "Н"</td>
              <td class="col-r1"><input type="text" class="score-input p2" data-q="1" value="${data.cells['p2-1'] || ''}"></td>
              <td class="col-r2"><input type="text" class="score-input p2" data-q="2" value="${data.cells['p2-2'] || ''}"></td>
              <td class="col-r3"><input type="text" class="score-input p2" data-q="3" value="${data.cells['p2-3'] || ''}"></td>
              <td class="col-r4"><input type="text" class="score-input p2" data-q="4" value="${data.cells['p2-4'] || ''}"></td>
            </tr>
            <tr>
              <td class="row-label">ЕДА</td>
              <td class="col-r1"><input type="text" class="score-input eda" data-q="1" value="${data.cells['eda-1'] || ''}" title="-2, 0, 2"></td>
              <td class="col-r2"><input type="text" class="score-input eda" data-q="2" value="${data.cells['eda-2'] || ''}" title="-2, 0, 2"></td>
              <td class="col-r3"><input type="text" class="score-input eda" data-q="3" value="${data.cells['eda-3'] || ''}" title="-2, 0, 2"></td>
              <td class="col-r4"><input type="text" class="score-input eda" data-q="4" value="${data.cells['eda-4'] || ''}" title="-2, 0, 2"></td>
            </tr>
            <tr>
              <td class="row-label">Кардіо</td>
              <td class="col-r1"><input type="text" class="score-input car" data-q="1" value="${data.cells['car-1'] || ''}"></td>
              <td class="col-r2"><input type="text" class="score-input car" data-q="2" value="${data.cells['car-2'] || ''}"></td>
              <td class="col-r3"><input type="text" class="score-input car" data-q="3" value="${data.cells['car-3'] || ''}"></td>
              <td class="col-r4"><input type="text" class="score-input car" data-q="4" value="${data.cells['car-4'] || ''}"></td>
            </tr>
            <tr>
              <td class="total-label">Бал питання:</td>
              <td class="col-r1 calc-cell" id="sub-${tId}-1">-</td>
              <td class="col-r2 calc-cell" id="sub-${tId}-2">-</td>
              <td class="col-r3 calc-cell" id="sub-${tId}-3">-</td>
              <td class="col-r4 calc-cell" id="sub-${tId}-4">-</td>
            </tr>
            <tr>
              <td class="total-label">Статус:</td>
              <td class="col-r1 status-cell" id="stat-${tId}-1"></td>
              <td class="col-r2 status-cell" id="stat-${tId}-2"></td>
              <td class="col-r3 status-cell" id="stat-${tId}-3"></td>
              <td class="col-r4 status-cell" id="stat-${tId}-4"></td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- Динаміка та Підсумок -->
      <div class="ess-dynamics-container">
        <div class="ess-dynamics-header">
          <span class="ess-dynamics-title">Загальний висновок: <span class="grand-status" id="grand-${tId}">-</span></span>
          <span class="grand-score" id="gscore-${tId}" style="font-weight:900; font-size:16px; color:#1e40af;"></span>
        </div>
        <div class="ess-dynamics-chart" id="chart-${tId}">
          <!-- SVG малюється через JS -->
        </div>
      </div>

      <!-- Модалка для питань (прихована) -->
      <div class="ess-modal-overlay" id="modal-${tId}">
        <div class="ess-modal">
          <div class="ess-modal-header">
            <h3>Редактор питань</h3>
            <button class="ess-modal-close">×</button>
          </div>
          <div class="ess-modal-body">
            <label>Питання R1: <input type="text" class="ess-question-input q1" value="${data.qs[0]}"></label>
            <label>Питання R2: <input type="text" class="ess-question-input q2" value="${data.qs[1]}"></label>
            <label>Питання R3: <input type="text" class="ess-question-input q3" value="${data.qs[2]}"></label>
            <label>Питання R4: <input type="text" class="ess-question-input q4" value="${data.qs[3]}"></label>
          </div>
          <div class="ess-modal-footer">
            <button class="ess-btn ess-modal-save">Зберегти</button>
          </div>
        </div>
      </div>
    `;
    
    wrapper.innerHTML = html;
    container.appendChild(wrapper);

    attachEvents(wrapper, tId);
    applyFormat(wrapper);
    calculateTest(wrapper);
  }

  // ==========================================
  // 2. ПОДІЇ ТА ВАЛІДАЦІЯ
  // ==========================================
  function attachEvents(wrapper, tId) {
    var inputs = wrapper.querySelectorAll('.score-input');
    var formatSel = wrapper.querySelector('.ess-format-select');
    var contamChk = wrapper.querySelector('.contam-check');
    var titleInp = wrapper.querySelector('.ess-test-name');
    var btnDel = wrapper.querySelector('.ess-delete-btn');
    
    // Модалка
    var btnQs = wrapper.querySelector('.btn-questions');
    var modal = wrapper.querySelector('.ess-modal-overlay');
    var btnClose = wrapper.querySelector('.ess-modal-close');
    var btnSave = wrapper.querySelector('.ess-modal-save');

    btnQs.onclick = function() { modal.classList.add('active'); };
    btnClose.onclick = function() { modal.classList.remove('active'); window.PolygraphApp.markUnsaved(); };
    btnSave.onclick = function() { modal.classList.remove('active'); applyFormat(wrapper); calculateTest(wrapper); window.PolygraphApp.markUnsaved(); };

    btnDel.onclick = function() {
      if (confirm('Видалити цей тест?')) {
        wrapper.remove();
        window.PolygraphApp.markUnsaved();
      }
    };

    formatSel.addEventListener('change', function() {
      applyFormat(wrapper);
      calculateTest(wrapper);
      window.PolygraphApp.markUnsaved();
    });

    contamChk.addEventListener('change', function() {
      calculateTest(wrapper);
      window.PolygraphApp.markUnsaved();
    });
    
    titleInp.addEventListener('input', window.PolygraphApp.markUnsaved);

    inputs.forEach(function(inp) {
      inp.addEventListener('keydown', function(e) {
        if (e.key === '-' || e.key === 'Subtract') {
          e.preventDefault();
          if (inp.value === '-') inp.value = '';
          else if (!inp.value.startsWith('-')) inp.value = '-' + inp.value;
          inp.dispatchEvent(new Event('input'));
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          // Простий перехід вниз
          var allInps = Array.from(wrapper.querySelectorAll('.score-input:not(:disabled)'));
          var idx = allInps.indexOf(inp);
          if (idx > -1 && idx < allInps.length - 1) allInps[idx + 1].focus();
        }
      });

      inp.addEventListener('input', function(e) {
        var val = e.target.value.toUpperCase();
        var isEda = inp.classList.contains('eda');
        
        // Дозволені символи
        val = val.replace(/[^0-9\-AFАФ∅]/g, '');
        if (val === 'F' || val === 'Ф' || val === '∅') val = 'А';
        if (val === 'A') val = 'А';

        // Валідація за каналами
        if (val !== '' && val !== '-' && val !== 'А' && val !== '00') {
          var num = parseInt(val, 10);
          if (isNaN(num)) val = '';
          else {
            if (isEda) {
              if (num !== -2 && num !== 0 && num !== 2) val = '';
            } else {
              if (num < -1 || num > 1) val = '';
            }
          }
        }
        e.target.value = val;
        
        // Колір артефакту
        if (val === 'А' || val === '00') e.target.classList.add('bg-local-artifact');
        else e.target.classList.remove('bg-local-artifact');

        calculateTest(wrapper);
        window.PolygraphApp.markUnsaved();
      });
    });
  }

  function applyFormat(wrapper) {
    var format = wrapper.querySelector('.ess-format-select').value;
    var cols = { 'DLST': 2, 'ZCT': 3, 'AFMGQT': 4 }[format];
    
    [1, 2, 3, 4].forEach(function(i) {
      var els = wrapper.querySelectorAll('.col-r' + i);
      els.forEach(function(el) {
        if (i > cols) {
          el.classList.add('col-disabled');
          var inp = el.querySelector('input');
          if (inp) { inp.disabled = true; inp.value = ''; }
        } else {
          el.classList.remove('col-disabled');
          var inp = el.querySelector('input');
          if (inp) inp.disabled = false;
        }
      });
      // Оновлюємо заголовки колонок з модалки
      if (i <= cols) {
        var qText = wrapper.querySelector('.ess-question-input.q' + i).value || 'R' + i;
        var th = wrapper.querySelector('th.col-r' + i);
        if (th) th.textContent = qText;
      }
    });
  }

  // ==========================================
  // 3. МАТЕМАТИКА ESS-M ТА ПРАВИЛА
  // ==========================================
  function isArt(val) {
    return val === 'А' || val === '00';
  }

  function calculateTest(wrapper) {
    var format = wrapper.querySelector('.ess-format-select').value;
    var isContam = wrapper.querySelector('.contam-check').checked;
    var colsCount = { 'DLST': 2, 'ZCT': 3, 'AFMGQT': 4 }[format];
    
    var grandTotal = 0;
    var spots = [];
    var hasSR = false;

    for (var i = 1; i <= colsCount; i++) {
      var p1 = wrapper.querySelector('.col-r' + i + ' .p1').value;
      var p2 = wrapper.querySelector('.col-r' + i + ' .p2').value;
      var eda = wrapper.querySelector('.col-r' + i + ' .eda').value;
      var car = wrapper.querySelector('.col-r' + i + ' .car').value;
      
      var cellSub = wrapper.querySelector('#sub-' + wrapper.id + '-' + i);
      var cellStat = wrapper.querySelector('#stat-' + wrapper.id + '-' + i);
      
      // Логіка дихання (Об'єднання верхнього і нижнього)
      var pneumoVal = null;
      var pneumoArt = false;
      
      if (isArt(p1) && isArt(p2)) pneumoArt = true;
      else if (isArt(p1) && p2 !== '') pneumoVal = parseInt(p2, 10);
      else if (isArt(p2) && p1 !== '') pneumoVal = parseInt(p1, 10);
      else if (p1 !== '' && p2 !== '') {
        var n1 = parseInt(p1, 10), n2 = parseInt(p2, 10);
        pneumoVal = n1 + n2;
        if (pneumoVal > 1) pneumoVal = 1;
        if (pneumoVal < -1) pneumoVal = -1;
      }

      // Рахуємо бали та артефакти
      var qScore = 0;
      var artWeight = 0; // Макс 4 (ЕДА=2, П=1, К=1). Rule of 25% = втрата >= 1 балу.
      var hasData = false;

      if (pneumoArt) artWeight += 1;
      else if (pneumoVal !== null) { qScore += pneumoVal; hasData = true; }

      if (isArt(eda)) artWeight += 2;
      else if (eda !== '') { qScore += parseInt(eda, 10); hasData = true; }

      if (isArt(car)) artWeight += 1;
      else if (car !== '') { qScore += parseInt(car, 10); hasData = true; }

      // Визначаємо статус питання
      var statHtml = '';
      var statClass = 'bg-na';
      var finalScoreStr = hasData ? qScore.toString() : '-';

      if (!hasData && artWeight === 0) {
        // Порожня колонка
      } else if (artWeight >= 1) { 
        // Втрата хоча б 1 каналу в ESS-M (25% від 4) -> NO OPINION для споту
        statHtml = '<span class="status-badge bg-no">NO</span><span class="prob-text">Артефакт</span>';
        statClass = 'bg-no';
        finalScoreStr = 'A';
      } else {
        // Є бали. Визначаємо локальний статус
        if (qScore <= -3) {
          statHtml = '<span class="status-badge bg-sr">SR</span>';
          statClass = 'bg-sr';
          hasSR = true;
        } else if (qScore >= 1 && format !== 'ZCT' && format !== 'DLST') {
          // Для AFMGQT кожен спот оцінюється окремо
          statHtml = '<span class="status-badge bg-nsr">NSR</span>';
          statClass = 'bg-nsr';
        } else {
          statHtml = '<span class="status-badge bg-inc">INC</span>';
          statClass = 'bg-inc';
        }
        grandTotal += qScore;
      }

      cellSub.textContent = finalScoreStr;
      cellStat.innerHTML = statHtml;
      cellStat.className = 'col-r' + i + ' status-cell ' + statClass;
      
      spots.push({ score: (finalScoreStr === 'A' || finalScoreStr === '-') ? null : qScore, stat: statClass, el: cellStat });
    }

    // Загальний висновок та Контамінація
    var grandEl = wrapper.querySelector('#grand-' + wrapper.id);
    var gScoreEl = wrapper.querySelector('#gscore-' + wrapper.id);
    gScoreEl.textContent = ' (Сума: ' + grandTotal + ')';

    if (format === 'DLST' || format === 'ZCT') {
      var cutSR = format === 'DLST' ? -3 : -4;
      var cutNSR = format === 'DLST' ? 1 : 2;
      
      if (grandTotal <= cutSR || hasSR) {
        grandEl.innerHTML = '<span class="status-badge bg-sr">SR (Deception)</span>';
      } else if (grandTotal >= cutNSR) {
        if (isContam && hasSR) {
          grandEl.innerHTML = '<span class="status-badge bg-inc">INC (Contamination)</span>';
        } else {
          grandEl.innerHTML = '<span class="status-badge bg-nsr">NSR (Truthful)</span>';
        }
      } else {
        grandEl.innerHTML = '<span class="status-badge bg-inc">INC (Inconclusive)</span>';
      }
    } else {
      // AFMGQT - немає єдиного висновку NSR, якщо є SR - тест завалено
      if (hasSR) grandEl.innerHTML = '<span class="status-badge bg-sr">SR (Знайдено реакції)</span>';
      else grandEl.innerHTML = '<span class="status-badge bg-inc">Скринінг: Див. по питаннях</span>';
    }

    // Застосування Spot Rule для відображення INC замість NSR
    if (isContam && hasSR) {
      spots.forEach(function(s) {
        if (s.stat === 'bg-nsr') {
          s.el.innerHTML = '<span class="status-badge bg-inc">INC</span><span class="prob-text">Spot Rule</span>';
          s.el.className = s.el.className.replace('bg-nsr', 'bg-inc');
        }
      });
    }

    drawChart(wrapper, spots, colsCount);
  }

  // ==========================================
  // 4. ГРАФІКА (SVG)
  // ==========================================
  function drawChart(wrapper, spots, colsCount) {
    var chartDiv = wrapper.querySelector('.ess-dynamics-chart');
    var w = chartDiv.clientWidth || 600;
    var h = 90;
    
    var svg = '<svg width="100%" height="100%" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">';
    svg += '<line x1="0" y1="' + (h/2) + '" x2="' + w + '" y2="' + (h/2) + '" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4,4" />';
    
    var points = [];
    var step = w / (colsCount + 1);
    
    for (var i = 0; i < colsCount; i++) {
      if (spots[i].score !== null) {
        var x = step * (i + 1);
        // Масштабуємо бал (макс +- 4)
        var y = (h/2) - (spots[i].score * (h/10));
        points.push({x: x, y: y, score: spots[i].score, stat: spots[i].stat});
      }
    }

    if (points.length > 1) {
      var path = 'M ' + points[0].x + ' ' + points[0].y;
      for (var p = 1; p < points.length; p++) path += ' L ' + points[p].x + ' ' + points[p].y;
      svg += '<path d="' + path + '" fill="none" stroke="#3a7cfd" stroke-width="3" />';
    }

    points.forEach(function(p) {
      var color = p.stat === 'bg-sr' ? '#ef4444' : (p.stat === 'bg-nsr' ? '#22c55e' : '#eab308');
      svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="6" fill="' + color + '" stroke="#fff" stroke-width="2" />';
      svg += '<text x="' + p.x + '" y="' + (p.y - 12) + '" text-anchor="middle" font-size="11" font-weight="bold" fill="#475569">' + p.score + '</text>';
    });

    svg += '</svg>';
    chartDiv.innerHTML = svg;
  }

  // ==========================================
  // 5. API ДЛЯ ГЛОБАЛЬНОГО ДОДАТКУ (app.js)
  // ==========================================
  
  window.PolygraphApp.ess.collectState = function() {
    var state = [];
    var wrappers = container.querySelectorAll('.ess-test-wrapper');
    wrappers.forEach(function(w) {
      var cells = {};
      w.querySelectorAll('.score-input').forEach(function(inp) {
        var ch = 'p1';
        if (inp.classList.contains('p2')) ch = 'p2';
        if (inp.classList.contains('eda')) ch = 'eda';
        if (inp.classList.contains('car')) ch = 'car';
        cells[ch + '-' + inp.getAttribute('data-q')] = inp.value;
      });
      state.push({
        title: w.querySelector('.ess-test-name').value,
        format: w.querySelector('.ess-format-select').value,
        contamination: w.querySelector('.contam-check').checked,
        qs: [
          w.querySelector('.q1').value,
          w.querySelector('.q2').value,
          w.querySelector('.q3').value,
          w.querySelector('.q4').value
        ],
        cells: cells
      });
    });
    return state;
  };

  window.PolygraphApp.ess.restoreState = function(data) {
    container.innerHTML = '';
    testCounter = 0;
    if (data && data.length > 0) {
      data.forEach(function(d) { createEssTest(d); });
    } else {
      createEssTest();
    }
  };

  window.PolygraphApp.ess.clearAll = function() {
    container.innerHTML = '';
    testCounter = 0;
    createEssTest();
  };

  window.PolygraphApp.ess.getMarkdown = function() {
    var wrappers = container.querySelectorAll('.ess-test-wrapper');
    if (wrappers.length === 0) return "";
    
    var md = "";
    wrappers.forEach(function(w, idx) {
      var title = w.querySelector('.ess-test-name').value || ('Тест ESS-M №' + (idx + 1));
      var format = w.querySelector('.ess-format-select').value;
      var colsCount = { 'DLST': 2, 'ZCT': 3, 'AFMGQT': 4 }[format];
      
      md += '### ' + title + ' (' + format + ')\n\n';
      
      var headerRow = '| Канал |';
      var divRow = '| :--- |';
      for(var i=1; i<=colsCount; i++) {
        var qText = w.querySelector('.q'+i).value || 'R'+i;
        headerRow += ' ' + qText + ' |';
        divRow += ' :---: |';
      }
      md += headerRow + '\n' + divRow + '\n';
      
      var channels = [
        {name: 'Дихання "В"', cls: 'p1'},
        {name: 'Дихання "Н"', cls: 'p2'},
        {name: 'ЕДА', cls: 'eda'},
        {name: 'Кардіо', cls: 'car'}
      ];
      
      channels.forEach(function(ch) {
        var row = '| **' + ch.name + '** |';
        for(var i=1; i<=colsCount; i++) {
          var val = w.querySelector('.col-r'+i+' .'+ch.cls).value || '-';
          row += ' ' + val + ' |';
        }
        md += row + '\n';
      });
      
      // Підсумки
      var subRow = '| **Бал питання** |';
      for(var i=1; i<=colsCount; i++) {
        var val = w.querySelector('#sub-'+w.id+'-'+i).textContent || '-';
        subRow += ' **' + val + '** |';
      }
      md += subRow + '\n\n';
      
      var grandText = w.querySelector('#grand-'+w.id).textContent.trim();
      var gScoreText = w.querySelector('#gscore-'+w.id).textContent.trim();
      md += '**Висновок по тесту:** ' + grandText + ' ' + gScoreText + '\n\n';
    });
    
    return md;
  };

  // ==========================================
  // 6. ІНІЦІАЛІЗАЦІЯ
  // ==========================================
  btnAdd.addEventListener('click', function() {
    createEssTest();
    window.PolygraphApp.markUnsaved();
  });

  // При зміні розміру вікна перемальовуємо графіки
  window.addEventListener('resize', function() {
    var wrappers = container.querySelectorAll('.ess-test-wrapper');
    wrappers.forEach(function(w) { calculateTest(w); });
  });

});
