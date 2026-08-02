document.addEventListener('DOMContentLoaded', function() {
  
  var container = document.getElementById('cit-blocks-container');
  var btnAddBlock = document.getElementById('btn-add-cit-block');
  var blockCounter = 0;

  // ==========================================
  // 1. БАЗА ДАНИХ ЙМОВІРНОСТЕЙ (ТАБЛИЦЯ 1)
  // ==========================================
  const probData = {
    3: { 3:"0.28", 4:"0.13", 5:"0.03", 6:"0.01" },
    4: { 3:"0.44", 4:"0.25", 5:"0.10", 6:"0.04", 7:"0.01", 8:"0.00" },
    5: { 3:"0.58", 4:"0.38", 5:"0.20", 6:"0.09", 7:"0.03", 8:"0.01", 9:"0.00", 10:"0.00" },
    6: { 3:"0.69", 4:"0.50", 5:"0.31", 6:"0.17", 7:"0.08", 8:"0.03", 9:"0.00", 10:"0.00", 11:"0.00", 12:"0.00" },
    7: { 3:"0.78", 4:"0.61", 5:"0.42", 6:"0.26", 7:"0.14", 8:"0.07", 9:"0.03", 10:"0.01", 11:"0.00", 12:"0.00", 13:"0.00", 14:"0.00" },
    8: { 3:"0.84", 4:"0.70", 5:"0.53", 6:"0.36", 7:"0.22", 8:"0.12", 9:"0.06", 10:"0.03", 11:"0.01", 12:"0.00", 13:"0.00", 14:"0.00", 15:"0.00", 16:"0.00" }
  };

  // ==========================================
  // 2. ГЕНЕРАЦІЯ БЛОКУ ДОСЛІДЖЕННЯ CIT
  // ==========================================
  function createCitBlock(data) {
    blockCounter++;
    var bId = "cit-block-" + blockCounter;
    data = data || { title: "Дослідження CIT №" + blockCounter, tests: [] };

    var wrapper = document.createElement('div');
    wrapper.className = 'cit-block-wrapper';
    wrapper.id = bId;

    var html = `
      <div class="cit-block-header">
        <h3 class="cit-block-title">
          <input type="text" class="cit-block-title-input" value="${data.title}" placeholder="Назва дослідження...">
        </h3>
        <button class="btn-del-cit-block" title="Видалити дослідження">Видалити блок</button>
      </div>

      <div class="cit-layout-grid">
        
        <!-- Ліва колонка: Тести -->
        <div class="cit-tests-section">
          <div style="display:flex; gap:10px; margin-bottom:10px; padding:0 10px;">
            <div style="flex:1; font-size:11px; font-weight:bold; color:#64748b; padding-left:25px;">ТЕМА</div>
            <div style="flex:1; font-size:11px; font-weight:bold; color:#64748b;">КЛЮЧ</div>
            <div style="width:50px; font-size:11px; font-weight:bold; color:#64748b; text-align:center;">ЕДА</div>
            <div style="width:22px;"></div>
          </div>
          
          <div class="cit-rows-container"></div>
          
          <button class="btn-add-test-row">+ Додати запитання</button>
        </div>

        <!-- Права колонка: Дашборд та Матриця -->
        <div class="cit-results-section">
          <div class="summary-dashboard">
            <div class="summary-box">
              <div class="summary-label">Кількість CIT</div>
              <div class="summary-value sum-count">-</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">Загальний бал</div>
              <div class="summary-value sum-score">-</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">Рішення</div>
              <div class="summary-value sum-decision val-na">N/A</div>
            </div>
          </div>

          <div class="probability-matrix-container">
            <div class="matrix-header">
              <h4>Матриця ймовірностей (Pr)</h4>
              <span class="matrix-highlight-text">Введіть результати</span>
            </div>
            <div style="overflow-x:auto;">
              <table class="cit-matrix-table"></table>
            </div>
          </div>
        </div>
        
      </div>
    `;
    
    wrapper.innerHTML = html;
    container.appendChild(wrapper);

    // Ініціалізація матриці
    renderMatrix(wrapper.querySelector('.cit-matrix-table'));

    // Додавання подій
    var btnDel = wrapper.querySelector('.btn-del-cit-block');
    btnDel.onclick = function() {
      if (confirm('Видалити це дослідження CIT повністю?')) {
        wrapper.remove();
        window.PolygraphApp.markUnsaved();
      }
    };
    
    var titleInput = wrapper.querySelector('.cit-block-title-input');
    titleInput.addEventListener('input', window.PolygraphApp.markUnsaved);

    var btnAddRow = wrapper.querySelector('.btn-add-test-row');
    btnAddRow.onclick = function() {
      createTestRow(wrapper);
      window.PolygraphApp.markUnsaved();
    };

    // Відновлення тестів або створення порожніх
    if (data.tests && data.tests.length > 0) {
      data.tests.forEach(function(t) { createTestRow(wrapper, t.theme, t.key, t.score); });
    } else {
      for(var i=0; i<3; i++) createTestRow(wrapper);
    }
    
    calculateCitBlock(wrapper);
  }

  // ==========================================
  // 3. РЯДКИ ТЕСТІВ (ТЕМА + КЛЮЧ)
  // ==========================================
  function createTestRow(wrapper, themeText, keyText, scoreVal) {
    var rowsContainer = wrapper.querySelector('.cit-rows-container');
    
    var row = document.createElement("div");
    row.className = "cit-test-row";
    
    var numSpan = document.createElement("span");
    numSpan.className = "cit-test-num";
    
    var themeInput = document.createElement("input");
    themeInput.type = "text";
    themeInput.className = "cit-test-key-input theme-input";
    themeInput.placeholder = "Тема (напр. Зброя)";
    themeInput.value = themeText || "";
    themeInput.addEventListener("input", window.PolygraphApp.markUnsaved);

    var keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "cit-test-key-input key-input";
    keyInput.placeholder = "Ключ (напр. Ніж)";
    keyInput.value = keyText || "";
    keyInput.addEventListener("input", window.PolygraphApp.markUnsaved);

    var scoreInput = document.createElement("input");
    scoreInput.type = "text";
    scoreInput.className = "cit-test-score-input";
    scoreInput.placeholder = "-";
    scoreInput.maxLength = 1;
    scoreInput.value = scoreVal || "";
    
    scoreInput.addEventListener("input", function(e) {
      var val = e.target.value.toUpperCase();
      if (val === "Ф" || val === "F" || val === "∅") val = "А";
      if (val !== "" && val !== "0" && val !== "1" && val !== "2" && val !== "А" && val !== "A") {
        e.target.value = "";
      } else {
        e.target.value = val === "A" ? "А" : val;
      }
      calculateCitBlock(wrapper);
      window.PolygraphApp.markUnsaved();
    });

    var delBtn = document.createElement("button");
    delBtn.className = "ess-delete-btn"; // Використовуємо стиль з ESS для однаковості
    delBtn.style.width = "22px";
    delBtn.style.height = "22px";
    delBtn.style.fontSize = "16px";
    delBtn.innerHTML = "×";
    delBtn.onclick = function() {
      row.remove();
      updateRowNumbers(wrapper);
      calculateCitBlock(wrapper);
      window.PolygraphApp.markUnsaved();
    };

    row.appendChild(numSpan);
    row.appendChild(themeInput);
    row.appendChild(keyInput);
    row.appendChild(scoreInput);
    row.appendChild(delBtn);

    rowsContainer.appendChild(row);
    updateRowNumbers(wrapper);
    calculateCitBlock(wrapper);
  }

  function updateRowNumbers(wrapper) {
    var rows = wrapper.querySelectorAll(".cit-test-row");
    rows.forEach(function(row, index) {
      row.querySelector(".cit-test-num").textContent = (index + 1) + ".";
    });
  }

  // ==========================================
  // 4. МАТРИЦЯ
  // ==========================================
  function renderMatrix(tableEl) {
    var maxScoreCols = 16;
    var html = '<thead><tr><th class="th-corner"></th>';
    for (var s = 0; s <= maxScoreCols; s++) html += '<th>' + s + '</th>';
    html += '</tr></thead><tbody>';
    
    for (var t = 3; t <= 8; t++) {
      html += '<tr><th>' + t + '</th>';
      for (var s = 0; s <= maxScoreCols; s++) {
        var prob = (probData[t] && probData[t][s]) ? probData[t][s] : "-";
        if (s < 3 && prob === "-") prob = ">.9"; 
        if (s > t * 2) prob = ""; 
        html += '<td class="matrix-cell" data-cit="' + t + '" data-score="' + s + '">' + prob + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
    tableEl.innerHTML = html;
  }

  // ==========================================
  // 5. ОБРАХУНОК ЛІККЕНА ТА ВІЗУАЛІЗАЦІЯ
  // ==========================================
  function isArt(val) {
    var v = String(val).trim().toUpperCase();
    return v === "А" || v === "A";
  }

  function calculateCitBlock(wrapper) {
    var rows = wrapper.querySelectorAll(".cit-test-row");
    var validTestsCount = 0;
    var totalScore = 0;

    rows.forEach(function(row) {
      var scoreInput = row.querySelector(".cit-test-score-input");
      var val = scoreInput.value.trim();
      scoreInput.classList.remove("artifact");

      if (isArt(val)) {
        scoreInput.classList.add("artifact");
      } else if (val !== "") {
        var num = parseInt(val, 10);
        if (!isNaN(num) && num >= 0 && num <= 2) {
          validTestsCount++;
          totalScore += num;
        }
      }
    });

    var sumCountEl = wrapper.querySelector(".sum-count");
    var sumScoreEl = wrapper.querySelector(".sum-score");
    var sumDecisionEl = wrapper.querySelector(".sum-decision");
    var matrixTextEl = wrapper.querySelector(".matrix-highlight-text");
    var matrixTable = wrapper.querySelector(".cit-matrix-table");

    sumCountEl.textContent = validTestsCount;
    sumScoreEl.textContent = totalScore;

    var decision = "N/A";
    var decisionClass = "val-na";
    
    matrixTable.classList.remove("table-has-result");
    matrixTable.querySelectorAll(".matrix-cell").forEach(function(cell) {
      cell.classList.remove("cell-active", "res-ri", "res-nri");
    });

    if (validTestsCount === 0) {
      sumDecisionEl.textContent = "Немає даних";
      matrixTextEl.textContent = "Введіть результати";
      matrixTextEl.style.background = "#eff6ff";
      matrixTextEl.style.color = "#3a7cfd";
    } else if (validTestsCount < 3) {
      decision = "NO";
      decisionClass = "val-no";
      sumDecisionEl.textContent = "NO (<3)";
      matrixTextEl.textContent = "Мінімум 3 тести";
      matrixTextEl.style.background = "#f1f5f9";
      matrixTextEl.style.color = "#64748b";
    } else {
      // CIT Rule: RI якщо Загальний бал >= Кількість тестів
      if (totalScore >= validTestsCount) {
        decision = "RI";
        decisionClass = "val-ri";
        matrixTextEl.textContent = "Впізнання (RI)";
        matrixTextEl.style.background = "#fef2f2";
        matrixTextEl.style.color = "#d32f2f";
      } else {
        decision = "NRI";
        decisionClass = "val-nri";
        matrixTextEl.textContent = "Немає впізнання (NRI)";
        matrixTextEl.style.background = "#f0fdf4";
        matrixTextEl.style.color = "#2e7d32";
      }
      
      sumDecisionEl.textContent = decision;
      
      if (validTestsCount <= 8) {
        matrixTable.classList.add("table-has-result");
        var activeCell = matrixTable.querySelector('.matrix-cell[data-cit="' + validTestsCount + '"][data-score="' + totalScore + '"]');
        if (activeCell) {
          activeCell.classList.add("cell-active");
          activeCell.classList.add(decision === "RI" ? "res-ri" : "res-nri");
        }
      } else {
        matrixTextEl.textContent = decision + " (Макс. 8)";
      }
    }
    sumDecisionEl.className = "summary-value sum-decision " + decisionClass;
  }

  // ==========================================
  // 6. API ДЛЯ ГЛОБАЛЬНОГО ДОДАТКУ (app.js)
  // ==========================================
  
  window.PolygraphApp.cit.collectState = function() {
    var state = [];
    var blocks = container.querySelectorAll('.cit-block-wrapper');
    blocks.forEach(function(b) {
      var tests = [];
      b.querySelectorAll('.cit-test-row').forEach(function(row) {
        tests.push({
          theme: row.querySelector('.theme-input').value,
          key: row.querySelector('.key-input').value,
          score: row.querySelector('.cit-test-score-input').value
        });
      });
      state.push({
        title: b.querySelector('.cit-block-title-input').value,
        tests: tests
      });
    });
    return state;
  };

  window.PolygraphApp.cit.restoreState = function(data) {
    container.innerHTML = '';
    blockCounter = 0;
    if (data && data.length > 0) {
      data.forEach(function(d) { createCitBlock(d); });
    }
  };

  window.PolygraphApp.cit.clearAll = function() {
    container.innerHTML = '';
    blockCounter = 0;
  };

  window.PolygraphApp.cit.getMarkdown = function() {
    var blocks = container.querySelectorAll('.cit-block-wrapper');
    if (blocks.length === 0) return "";
    
    var md = "";
    blocks.forEach(function(b, idx) {
      var title = b.querySelector('.cit-block-title-input').value || ('Дослідження CIT №' + (idx + 1));
      md += '### ' + title + '\n\n';
      
      md += '| № | Тема | Ключ | Бал ЕДА |\n';
      md += '| :---: | :--- | :--- | :---: |\n';
      
      var validTests = 0;
      var totalScore = 0;
      
      var rows = b.querySelectorAll('.cit-test-row');
      rows.forEach(function(row, i) {
        var thm = row.querySelector('.theme-input').value || '-';
        var key = row.querySelector('.key-input').value || '-';
        var scoreStr = row.querySelector('.cit-test-score-input').value;
        if (scoreStr === "") scoreStr = "-";
        
        md += '| ' + (i+1) + ' | ' + thm + ' | ' + key + ' | **' + scoreStr + '** |\n';
        
        if (!isArt(scoreStr) && scoreStr !== "-") {
          validTests++;
          totalScore += parseInt(scoreStr, 10);
        }
      });
      
      md += '\n**Результати дослідження:**\n';
      md += '- **Придатних тестів:** ' + validTests + '\n';
      md += '- **Загальний бал:** ' + totalScore + '\n';
      
      if (validTests < 3) {
        md += '- **Висновок:** **NO OPINION** (Недостатньо придатних тестів).\n';
      } else {
        var isRI = totalScore >= validTests;
        md += '- **Висновок:** **' + (isRI ? 'RI (Впізнання виявлено)' : 'NRI (Ознаки впізнання відсутні)') + '**\n';
        
        if (validTests <= 8) {
          var probDec = probData[validTests][totalScore] || "N/A";
          var probPercent = (probDec !== "N/A" && probDec !== "-") ? Math.round(parseFloat(probDec) * 100) + '%' : "N/A";
          if (probDec === "0.00") probPercent = "< 1%";
          
          md += '- **Ймовірність наївності (Pr):** ~' + probPercent + ' (Ймовірність того, що опитуваний не знає деталей злочину)\n';
        }
      }
      md += '\n---\n';
    });
    
    return md;
  };

  // ==========================================
  // 7. ІНІЦІАЛІЗАЦІЯ
  // ==========================================
  btnAddBlock.addEventListener('click', function() {
    createCitBlock();
    window.PolygraphApp.markUnsaved();
  });

});
