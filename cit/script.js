document.addEventListener('DOMContentLoaded', function() {
  
  // ==========================================
  // 1. АВТОРИЗАЦІЯ (ЗАХИСТ ПАРОЛЕМ)
  // ==========================================
  var authOverlay = document.getElementById('auth-overlay');
  var mainAppContainer = document.getElementById('main-app-container');
  var passInput = document.getElementById('auth-password');
  var authBtn = document.getElementById('auth-submit-btn');
  var authError = document.getElementById('auth-error');

  var isAuthorized = false;
  try { isAuthorized = localStorage.getItem('cit_auth_passed') === 'true'; } catch(e) {}

  var unlockApp = function(saveToLocal) {
    authOverlay.style.display = 'none';
    mainAppContainer.style.display = 'block';
    if (saveToLocal) {
      try { localStorage.setItem('cit_auth_passed', 'true'); } catch(e) {}
    }
    initApp();
  };

  if (isAuthorized) {
    unlockApp(false);
  } else {
    var checkPassword = function() {
      if (passInput.value === 'plgrph') {
        unlockApp(true);
      } else {
        authError.style.display = 'block';
        var modal = authOverlay.querySelector('.auth-modal');
        modal.style.animation = 'none';
        setTimeout(function() { modal.style.animation = 'shake 0.4s'; }, 10);
      }
    };
    authBtn.addEventListener('click', checkPassword);
    passInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') checkPassword(); });
  }

  // ==========================================
  // 2. БАЗА ДАНИХ ЙМОВІРНОСТЕЙ (З ПОСІБНИКА)
  // ==========================================
  // Рядки - кількість CIT (від 3 до 8)
  // Стовпці - сума балів. Значення - ймовірність того, що опитуваний наївний.
  const probData = {
    3: { 3:"0.28", 4:"0.13", 5:"0.03", 6:"0.01" },
    4: { 3:"0.44", 4:"0.25", 5:"0.10", 6:"0.04", 7:"0.01", 8:"0.00" },
    5: { 3:"0.58", 4:"0.38", 5:"0.20", 6:"0.09", 7:"0.03", 8:"0.01", 9:"0.00", 10:"0.00" },
    6: { 3:"0.69", 4:"0.50", 5:"0.31", 6:"0.17", 7:"0.08", 8:"0.03", 9:"0.00", 10:"0.00", 11:"0.00", 12:"0.00" },
    7: { 3:"0.78", 4:"0.61", 5:"0.42", 6:"0.26", 7:"0.14", 8:"0.07", 9:"0.03", 10:"0.01", 11:"0.00", 12:"0.00", 13:"0.00", 14:"0.00" },
    8: { 3:"0.84", 4:"0.70", 5:"0.53", 6:"0.36", 7:"0.22", 8:"0.12", 9:"0.06", 10:"0.03", 11:"0.01", 12:"0.00", 13:"0.00", 14:"0.00", 15:"0.00", 16:"0.00" }
  };

  // ==========================================
  // 3. ОСНОВНІ ЗМІННІ ТА ЕЛЕМЕНТИ
  // ==========================================
  var testsContainer = document.getElementById("tests-container");
  var btnAddTest = document.getElementById("btn-add-test");
  var respondentInput = document.getElementById("respondent-name");
  var dateInput = document.getElementById("exam-date");
  var saveStatus = document.getElementById("save-status");
  var matrixTable = document.getElementById("probability-table");
  
  var sumCountEl = document.getElementById("summary-count");
  var sumScoreEl = document.getElementById("summary-score");
  var sumDecisionEl = document.getElementById("summary-decision");
  var matrixTextEl = document.getElementById("matrix-active-text");

  var isUnsaved = false;
  var autoSaveTimeout;
  var testCounter = 0;

  // ==========================================
  // 4. ГЕНЕРАЦІЯ МАТРИЦІ ЙМОВІРНОСТЕЙ
  // ==========================================
  var renderMatrix = function() {
    var maxScoreCols = 16;
    var html = '<thead><tr><th class="th-corner"></th>';
    
    // Заголовки стовпців (Бали від 0 до 16)
    for (var s = 0; s <= maxScoreCols; s++) {
      html += '<th>' + s + '</th>';
    }
    html += '</tr></thead><tbody>';
    
    // Рядки (Кількість тестів від 3 до 8)
    for (var t = 3; t <= 8; t++) {
      html += '<tr><th>' + t + '</th>';
      for (var s = 0; s <= maxScoreCols; s++) {
        var prob = (probData[t] && probData[t][s]) ? probData[t][s] : "-";
        
        // Логіка для балів < 3 (у таблиці PDF їх немає, але ми знаємо, що ймовірність висока)
        if (s < 3 && prob === "-") prob = ">0.9"; 
        
        // Для балів вище максимуму (наприклад, 12 балів при 5 тестах неможливо)
        if (s > t * 2) prob = ""; 

        html += '<td class="matrix-cell" data-cit="' + t + '" data-score="' + s + '">' + prob + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
    matrixTable.innerHTML = html;
  };

  // ==========================================
  // 5. ЛОГІКА РОБОТИ З ТЕСТАМИ ТА ОБРАХУНОК
  // ==========================================
  
  var isArtifact = function(val) {
    var v = String(val).trim().toLowerCase();
    return v === "a" || v === "а" || v === "f" || v === "ф" || v === "∅";
  };

  var markUnsaved = function() {
    if (!isUnsaved) { 
      isUnsaved = true; 
      saveStatus.classList.add("unsaved"); 
    }
    saveStatus.textContent = "🟠 Є незбережені зміни!";
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(performSave, 5000);
  };

  var updateTestNumbers = function() {
    var rows = testsContainer.querySelectorAll(".cit-test-row");
    rows.forEach(function(row, index) {
      row.querySelector(".cit-test-num").textContent = (index + 1) + ".";
    });
  };

  var calculateCIT = function() {
    var rows = testsContainer.querySelectorAll(".cit-test-row");
    var validTestsCount = 0;
    var totalScore = 0;

    rows.forEach(function(row) {
      var scoreInput = row.querySelector(".cit-test-score-input");
      var val = scoreInput.value.trim();
      
      scoreInput.classList.remove("artifact");

      if (isArtifact(val)) {
        scoreInput.classList.add("artifact");
      } else if (val !== "") {
        var num = parseInt(val, 10);
        if (!isNaN(num) && num >= 0 && num <= 2) {
          validTestsCount++;
          totalScore += num;
        }
      }
    });

    sumCountEl.textContent = validTestsCount;
    sumScoreEl.textContent = totalScore;

    var decision = "N/A";
    var decisionClass = "val-na";
    
    // Очищення матриці
    matrixTable.classList.remove("table-has-result");
    matrixTable.querySelectorAll(".matrix-cell").forEach(function(cell) {
      cell.classList.remove("cell-active", "res-ri", "res-nri");
    });

    if (validTestsCount === 0) {
      sumDecisionEl.textContent = "Немає даних";
      matrixTextEl.textContent = "Введіть результати для відображення";
      matrixTextEl.style.background = "#eff6ff";
      matrixTextEl.style.color = "#3a7cfd";
    } else if (validTestsCount < 3) {
      decision = "NO";
      decisionClass = "val-no";
      sumDecisionEl.textContent = decision + " (<3 тестів)";
      matrixTextEl.textContent = "Мінімум 3 тести для висновку";
      matrixTextEl.style.background = "#f1f5f9";
      matrixTextEl.style.color = "#64748b";
    } else {
      // Правило CIT: RI якщо Загальний бал >= Кількість тестів
      if (totalScore >= validTestsCount) {
        decision = "RI";
        decisionClass = "val-ri";
        matrixTextEl.textContent = "Значуща реакція (RI)";
        matrixTextEl.style.background = "#fef2f2";
        matrixTextEl.style.color = "#d32f2f";
      } else {
        decision = "NRI";
        decisionClass = "val-nri";
        matrixTextEl.textContent = "Немає реакції (NRI)";
        matrixTextEl.style.background = "#f0fdf4";
        matrixTextEl.style.color = "#2e7d32";
      }
      
      sumDecisionEl.textContent = decision;
      
      // Підсвічування клітинки в матриці (обмеження до 8 тестів для відображення)
      if (validTestsCount <= 8) {
        matrixTable.classList.add("table-has-result");
        var activeCell = matrixTable.querySelector('.matrix-cell[data-cit="' + validTestsCount + '"][data-score="' + totalScore + '"]');
        if (activeCell) {
          activeCell.classList.add("cell-active");
          activeCell.classList.add(decision === "RI" ? "res-ri" : "res-nri");
        }
      } else {
        matrixTextEl.textContent = decision + " (Матриця до 8 тестів)";
      }
    }

    sumDecisionEl.className = "summary-value status " + decisionClass;
  };

  var createTestRow = function(keyText, scoreVal) {
    testCounter++;
    var row = document.createElement("div");
    row.className = "cit-test-row";
    
    var numSpan = document.createElement("span");
    numSpan.className = "cit-test-num";
    
    var keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "cit-test-key-input";
    keyInput.placeholder = "Тематика або ключ (наприклад: 'Ніж')...";
    keyInput.value = keyText || "";
    keyInput.addEventListener("input", markUnsaved);

    var scoreInput = document.createElement("input");
    scoreInput.type = "text";
    scoreInput.className = "cit-test-score-input";
    scoreInput.placeholder = "-";
    scoreInput.maxLength = 1;
    scoreInput.value = scoreVal || "";
    scoreInput.title = "Введіть 0, 1, 2 або 'А' (артефакт)";
    
    scoreInput.addEventListener("input", function(e) {
      var val = e.target.value.toUpperCase();
      if (val === "Ф" || val === "F") val = "А";
      
      if (val !== "" && val !== "0" && val !== "1" && val !== "2" && val !== "А" && val !== "A") {
        e.target.value = "";
      } else {
        e.target.value = val === "A" ? "А" : val;
      }
      calculateCIT();
      markUnsaved();
    });

    var delBtn = document.createElement("button");
    delBtn.className = "btn-del-test";
    delBtn.innerHTML = "×";
    delBtn.title = "Видалити тест";
    delBtn.onclick = function() {
      row.remove();
      updateTestNumbers();
      calculateCIT();
      markUnsaved();
    };

    row.appendChild(numSpan);
    row.appendChild(keyInput);
    row.appendChild(scoreInput);
    row.appendChild(delBtn);

    testsContainer.appendChild(row);
    updateTestNumbers();
    calculateCIT();
  };

  // ==========================================
  // 6. ЗБЕРЕЖЕННЯ ТА ЗАВАНТАЖЕННЯ (JSON)
  // ==========================================
  var collectState = function() {
    var tests = [];
    testsContainer.querySelectorAll(".cit-test-row").forEach(function(row) {
      tests.push({
        key: row.querySelector(".cit-test-key-input").value,
        score: row.querySelector(".cit-test-score-input").value
      });
    });
    return {
      respondentName: respondentInput.value,
      examDate: dateInput.value,
      tests: tests
    };
  };

  var performSave = function() {
    try {
      localStorage.setItem("cit_polygraph_data", JSON.stringify(collectState()));
      isUnsaved = false;
      saveStatus.classList.remove("unsaved");
      saveStatus.textContent = "🟢 Дані збережено";
    } catch (error) {
      saveStatus.textContent = "❌ Помилка запису!";
      saveStatus.classList.add("unsaved");
    }
  };

  var saveToFile = function() {
    var state = collectState();
    var resp = state.respondentName.trim();
    var safeResp = resp ? resp.replace(/[^a-zа-яієїґ0-9]/gi, '_').replace(/_+/g, '_') + "-" : "";
    var dateStr = state.examDate || new Date().toISOString().slice(0,10);
    var filename = "cit-" + safeResp + dateStr + ".json";
    
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    performSave();
  };

  var loadFromFile = function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        respondentInput.value = data.respondentName || "";
        dateInput.value = data.examDate || "";
        testsContainer.innerHTML = "";
        
        if (data.tests && data.tests.length > 0) {
          data.tests.forEach(function(t) { createTestRow(t.key, t.score); });
        } else {
          for(var i=0; i<3; i++) createTestRow();
        }
        performSave();
      } catch (err) { alert("Помилка завантаження файлу!"); }
    };
    reader.readAsText(file);
  };

  // ==========================================
  // 7. ЕКСПОРТ У MARKDOWN
  // ==========================================
  var saveToMarkdown = function() {
    var state = collectState();
    var respName = state.respondentName.trim() || 'Невідомо';
    var dateVal = state.examDate || new Date().toISOString().slice(0,10);
    
    var md = '---\n';
    md += 'tags:\n  - polygraph_report\n  - cit\n';
    md += 'date: ' + dateVal + '\n';
    md += 'respondent: ' + respName + '\n';
    md += '---\n\n';
    md += '# Звіт поліграфологічного тестування (CIT)\n\n';
    md += '**Респондент:** ' + respName + '\n';
    md += '**Дата проведення:** [[' + dateVal + ']]\n\n';
    md += '## Методика: Concealed Information Test (CIT)\n\n';
    
    md += '| № | Ключ / Тематика | Бал ЕДА |\n';
    md += '| :---: | :--- | :---: |\n';
    
    var validTests = 0;
    var totalScore = 0;
    
    state.tests.forEach(function(t, i) {
      var scoreStr = t.score === "" ? "-" : t.score;
      md += '| ' + (i+1) + ' | ' + (t.key || 'Без назви') + ' | **' + scoreStr + '** |\n';
      
      if (!isArtifact(scoreStr) && scoreStr !== "-") {
        validTests++;
        totalScore += parseInt(scoreStr, 10);
      }
    });
    
    md += '\n## Висновок\n\n';
    md += '- **Кількість придатних тестів (CITs):** ' + validTests + '\n';
    md += '- **Загальний набраний бал:** ' + totalScore + '\n';
    
    if (validTests < 3) {
      md += '- **Рішення:** **NO OPINION** (Недостатньо придатних тестів. Мінімум 3).\n';
    } else {
      var isRI = totalScore >= validTests;
      md += '- **Рішення:** **' + (isRI ? 'RI (Recognition Indicated)' : 'NRI (No Recognition Indicated)') + '**\n';
      
      if (validTests <= 8) {
        var prob = probData[validTests][totalScore] || "N/A";
        md += '- **Ймовірність наївності (Pr):** ~' + prob + ' (Шанс того, що особа не знає деталей злочину)\n';
      }
    }
    
    md += '\n---\n*Оцінювання здійснено за системою Lykken Scoring. Використовувався канал ЕДА (2 бали — максимальна амплітуда, 1 бал — друга, 0 — інші).*';

    var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); 
    a.href = url; 
    a.download = 'cit-' + (respName ? respName.replace(/[^a-zа-яієїґ0-9]/gi, '_') + "-" : "") + dateVal + '.md'; 
    a.click();
    URL.revokeObjectURL(url);
  };

  // ==========================================
  // 8. ІНІЦІАЛІЗАЦІЯ ТА ПОДІЇ
  // ==========================================
  var initApp = function() {
    renderMatrix();
    
    try {
      var raw = localStorage.getItem("cit_polygraph_data");
      if (raw) {
        var data = JSON.parse(raw);
        respondentInput.value = data.respondentName || "";
        dateInput.value = data.examDate || "";
        if (data.tests && data.tests.length > 0) {
          data.tests.forEach(function(t) { createTestRow(t.key, t.score); });
        } else {
          for(var i=0; i<3; i++) createTestRow(); // 3 тести за замовчуванням
        }
      } else {
        for(var j=0; j<3; j++) createTestRow();
      }
    } catch(e) {
      for(var k=0; k<3; k++) createTestRow();
    }
    
    calculateCIT();
  };

  btnAddTest.addEventListener("click", function() {
    createTestRow();
    markUnsaved();
  });

  respondentInput.addEventListener("input", markUnsaved);
  dateInput.addEventListener("change", markUnsaved);

  document.getElementById("btn-save").addEventListener("click", performSave);
  document.getElementById("btn-save-json").addEventListener("click", saveToFile);
  document.getElementById("btn-markdown").addEventListener("click", saveToMarkdown);
  document.getElementById("btn-print").addEventListener("click", function() { window.print(); });
  
  document.getElementById("btn-clear-all").addEventListener("click", function() {
    if (confirm("Очистити всі введені дані (П.І.Б. та всі тести)?")) {
      respondentInput.value = "";
      dateInput.value = "";
      testsContainer.innerHTML = "";
      for(var i=0; i<3; i++) createTestRow();
      markUnsaved();
    }
  });

  // Завантаження файлу
  var fileInput = document.getElementById("file-import");
  document.getElementById("btn-open").addEventListener("click", function() { fileInput.click(); });
  fileInput.addEventListener("change", function(e) { 
    if (e.target.files[0]) loadFromFile(e.target.files[0]); 
    e.target.value = ""; 
  });

});
