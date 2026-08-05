window.APP_API = (function() {
  var isUnsaved = false;
  var saveStatus, nameInp, dateInp;

  return {
    init: function() {
      ['g-save', 'g-open', 'g-save-json', 'g-markdown', 'g-print', 'g-clear'].forEach(function(id) {
        var el = document.getElementById(id);
        if(el) {
          var clone = el.cloneNode(true);
          el.parentNode.replaceChild(clone, el);
        }
      });

      saveStatus = document.getElementById('g-status');
      nameInp = document.getElementById('global-resp-name');
      dateInp = document.getElementById('global-exam-date');

      if(nameInp) nameInp.addEventListener('input', this.markUnsaved.bind(this));
      if(dateInp) dateInp.addEventListener('change', this.markUnsaved.bind(this));

      var btnSave = document.getElementById('g-save');
      if(btnSave) btnSave.addEventListener('click', this.performSave.bind(this));
      
      var btnSaveJson = document.getElementById('g-save-json');
      if(btnSaveJson) btnSaveJson.addEventListener('click', function() {
        this.performSave();
        var state = this.collectGlobalState();
        var resp = nameInp ? nameInp.value.trim() : "";
        var safeResp = resp ? resp.replace(/[^a-zа-яієїґ0-9]/gi, '_') + "-" : "";
        var dateStr = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0,10);
        var filename = "polygraph-suite-" + safeResp + dateStr + ".json";

        var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a"); 
        a.href = url; 
        a.download = filename; 
        a.click();
        URL.revokeObjectURL(url);
      }.bind(this));

      var handleFileLoad = function(file) {
        var reader = new FileReader();
        reader.onload = function(evt) {
          try {
            var parsed = JSON.parse(evt.target.result);
            
            if (parsed.tests && !parsed.ess) {
                parsed.ess = parsed.tests;
            }

            var cleanState = {
              respondentName: parsed.respondentName || "",
              examDate: parsed.examDate || "",
              ess: parsed.ess || [],
              cit: parsed.cit || []
            };
            
            localStorage.setItem('polygraph_suite_data', JSON.stringify(cleanState));
            alert('Дані успішно завантажено! Сторінку буде оновлено для відображення змін.');
            location.reload(); 
          } catch(err) { alert('Помилка читання файлу JSON. Файл пошкоджено або має невірний формат.'); }
        };
        reader.readAsText(file);
      };

      var fileInput = document.getElementById('file-import');
      if(fileInput) {
        var newFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(newFileInput, fileInput);
        
        var btnOpen = document.getElementById('g-open');
        if(btnOpen) btnOpen.addEventListener('click', function() { newFileInput.click(); });
        
        newFileInput.addEventListener('change', function(e) {
          if(e.target.files[0]) handleFileLoad(e.target.files[0]);
          newFileInput.value = '';
        });
      }

      window.addEventListener('dragover', function(e) { 
        e.preventDefault(); 
        document.body.style.backgroundColor = '#e3f2fd'; 
      });
      window.addEventListener('dragleave', function(e) { 
        e.preventDefault(); 
        document.body.style.backgroundColor = '#f5f5f5'; 
      });
      window.addEventListener('drop', function(e) {
        e.preventDefault(); 
        document.body.style.backgroundColor = '#f5f5f5';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            var file = e.dataTransfer.files[0];
            if (file.name.toLowerCase().indexOf('.json') !== -1) {
                handleFileLoad(file);
            } else {
                alert("Будь ласка, перетягніть файл саме у форматі .json");
            }
        }
      });

      var btnPrint = document.getElementById('g-print');
      if(btnPrint) btnPrint.addEventListener('click', function() { window.print(); });

      var btnClear = document.getElementById('g-clear');
      if(btnClear) btnClear.addEventListener('click', function() {
        if(confirm('Очистити всі дані в обох вкладках (Почати нову сесію)?')) {
          localStorage.removeItem('polygraph_suite_data');
          localStorage.removeItem('ess_polygraph_data');
          localStorage.removeItem('cit_standalone_data');
          localStorage.removeItem('polygraph_suite_master_data');
          location.reload();
        }
      }.bind(this));

      var btnHelp = document.getElementById('g-help');
      if(btnHelp) btnHelp.addEventListener('click', function() { window.open('info.html', '_blank'); });

      var btnMarkdown = document.getElementById('g-markdown');
      if(btnMarkdown) btnMarkdown.addEventListener('click', function() {
        var respName = (nameInp && nameInp.value.trim()) ? nameInp.value.trim() : 'Невідомо';
        var dateVal = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0,10);
        
        var md = '---\n';
        md += 'tags:\n  - polygraph_report\n  - suite\n';
        md += 'date: ' + dateVal + '\n';
        md += 'respondent: ' + respName + '\n';
        md += '---\n\n';
        md += '# Комплексний звіт поліграфолога\n\n';
        md += '**Респондент:** ' + respName + '\n';
        md += '**Дата проведення:** [[' + dateVal + ']]\n\n---\n\n';

        if(window.ESS_API) {
          var essMd = window.ESS_API.getMarkdown();
          if(essMd) md += '## 1. Скринінг / Діагностика (ESS-M)\n\n' + essMd + '\n\n---\n\n';
        }
        
        if(window.CIT_API) {
          var citMd = window.CIT_API.getMarkdown();
          if(citMd) md += '## 2. Тест на приховану інформацію (CIT)\n\n' + citMd + '\n\n---\n\n';
        }

        var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a"); 
        a.href = url; 
        a.download = 'polygraph-suite-' + safeResp + dateVal + '.md'; 
        a.click();
        URL.revokeObjectURL(url);
      }.bind(this));
    },

    collectGlobalState: function() {
      return {
        respondentName: nameInp ? nameInp.value : "",
        examDate: dateInp ? dateInp.value : "",
        ess: window.ESS_API ? window.ESS_API.collectState() : [],
        cit: window.CIT_API ? window.CIT_API.collectState() : []
      };
    },

    markUnsaved: function() {
      if(!isUnsaved) {
        isUnsaved = true;
        if(saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = '🟠 Є незбережені зміни'; }
      }
    },

    performSave: function() {
      try {
        localStorage.setItem('polygraph_suite_data', JSON.stringify(this.collectGlobalState()));
        isUnsaved = false;
        if(saveStatus) { saveStatus.classList.remove('unsaved'); saveStatus.textContent = '🟢 Дані збережено'; }
      } catch(e) {
        if(saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = '❌ Помилка запису'; }
      }
    },

    loadData: function() {
      try {
        var raw = localStorage.getItem('polygraph_suite_data');
        if(raw) {
          var parsed = JSON.parse(raw);
          if(parsed.respondentName !== undefined && nameInp) nameInp.value = parsed.respondentName;
          if(parsed.examDate !== undefined && dateInp) dateInp.value = parsed.examDate;
          
          // Ізольовані блоки відновлення: помилка в одному не зламає інший
          if(window.ESS_API) {
            try { window.ESS_API.restoreState(parsed.ess || []); } 
            catch(e) { console.error('ESS Restore Error:', e); }
          }
          if(window.CIT_API) {
            try { window.CIT_API.restoreState(parsed.cit || []); } 
            catch(e) { console.error('CIT Restore Error:', e); }
          }
        } else {
          if(window.ESS_API) window.ESS_API.restoreState([]);
          if(window.CIT_API) window.CIT_API.restoreState([]);
        }
      } catch(err) {
        console.error('loadData Error:', err);
        if(window.ESS_API) window.ESS_API.restoreState([]);
        if(window.CIT_API) window.CIT_API.restoreState([]);
      }
    }
  };
})();

document.addEventListener('DOMContentLoaded', function() {

  /* ===== ЛОГІКА АВТОРИЗАЦІЇ ТА КВІЗУ ===== */
  var authOverlay = document.getElementById('auth-overlay');
  var mainAppContainer = document.getElementById('main-app-container');
  var passInput = document.getElementById('auth-password');
  var authBtn = document.getElementById('auth-submit-btn');
  var authError = document.getElementById('auth-error');
  var forgotLink = document.getElementById('auth-forgot-link');
  var backToLoginLink = document.getElementById('quiz-back-to-login');

  var isAuthorized = false;
  try { isAuthorized = localStorage.getItem('suite_auth') === 'true'; } catch(e) {}

  // Стан квізу
  var quizState = {
    currentQuestion: 0,
    attemptsPerQuestion: [0, 0, 0],
    totalAttempts: 0,
    blocked: false
  };

  var MAX_ATTEMPTS_PER_QUESTION = 3;
  var MAX_TOTAL_ATTEMPTS = 9;

  function showAuthStep(stepId) {
    var steps = authOverlay.querySelectorAll('.auth-step');
    steps.forEach(function(s) { s.classList.remove('active'); });
    var target = document.getElementById(stepId);
    if (target) target.classList.add('active');
  }

  function resetQuizState() {
    quizState.currentQuestion = 0;
    quizState.attemptsPerQuestion = [0, 0, 0];
    quizState.totalAttempts = 0;
    quizState.blocked = false;

    authOverlay.querySelectorAll('.auth-quiz-option').forEach(function(btn) {
      btn.classList.remove('correct', 'wrong');
      btn.disabled = false;
    });

    ['quiz-error-q1', 'quiz-error-q2', 'quiz-error-q3'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.style.display = 'none'; }
    });

    ['quiz-attempts-q1', 'quiz-attempts-q2', 'quiz-attempts-q3'].forEach(function(id, idx) {
      var el = document.getElementById(id);
      if (el) {
        el.textContent = 'Спроба 1 з 3';
        el.classList.remove('danger');
      }
    });

    authOverlay.querySelectorAll('.auth-quiz-dot').forEach(function(dot) {
      dot.classList.remove('active', 'correct');
    });
  }

  function unlockApp(saveToLocal) {
    if(authOverlay) authOverlay.style.display = 'none';
    if(mainAppContainer) mainAppContainer.style.display = 'block';
    if(saveToLocal) { try { localStorage.setItem('suite_auth', 'true'); } catch(e) {} }
  }

  function handleWrongAnswer(qNum) {
    var qIndex = qNum - 1;
    quizState.attemptsPerQuestion[qIndex]++;
    quizState.totalAttempts++;

    var remaining = MAX_ATTEMPTS_PER_QUESTION - quizState.attemptsPerQuestion[qIndex];
    var errEl = document.getElementById('quiz-error-q' + qNum);
    var attEl = document.getElementById('quiz-attempts-q' + qNum);

    if (errEl) {
      errEl.textContent = '❌ Неправильно. Залишилось спроб: ' + remaining;
      errEl.style.display = 'block';
    }
    if (attEl) {
      attEl.textContent = 'Спроба ' + (quizState.attemptsPerQuestion[qIndex] + 1) + ' з ' + MAX_ATTEMPTS_PER_QUESTION;
      if (remaining === 1) attEl.classList.add('danger');
    }

    if (remaining <= 0 || quizState.totalAttempts >= MAX_TOTAL_ATTEMPTS) {
      quizState.blocked = true;
      try { sessionStorage.setItem('suite_auth_blocked', 'true'); } catch(e) {}
      setTimeout(function() { showAuthStep('auth-step-blocked'); }, 600);
    } else {
      setTimeout(function() {
        var options = authOverlay.querySelectorAll('.auth-quiz-option[data-q="' + qNum + '"]');
        options.forEach(function(btn) {
          btn.classList.remove('wrong');
          btn.disabled = false;
        });
        if (errEl) errEl.style.display = 'none';
      }, 1200);
    }
  }

  function handleCorrectAnswer(qNum) {
    var options = authOverlay.querySelectorAll('.auth-quiz-option[data-q="' + qNum + '"]');
    options.forEach(function(btn) { btn.disabled = true; });

    var dots = authOverlay.querySelectorAll('#auth-step-q' + qNum + ' .auth-quiz-dot');
    dots.forEach(function(dot) {
      if (dot.classList.contains('active')) dot.classList.add('correct');
    });

    setTimeout(function() {
      if (qNum === 3) {
        showAuthStep('auth-step-success');
      } else {
        showAuthStep('auth-step-q' + (qNum + 1));
      }
    }, 500);
  }

  function checkPassword() {
    if(!passInput) return;
    var val = passInput.value.trim().toLowerCase();
    if (val === 'plgrph' || val === 'здікзр') unlockApp(true);
    else {
      if(authError) authError.style.display = 'block';
      if(authOverlay) {
        var modal = authOverlay.querySelector('.auth-modal');
        if(modal) {
          modal.style.animation = 'none';
          setTimeout(function() { modal.style.animation = 'shake 0.4s'; }, 10);
        }
      }
    }
  }

  // Перевірка блокування в сесії
  var isSessionBlocked = false;
  try { isSessionBlocked = sessionStorage.getItem('suite_auth_blocked') === 'true'; } catch(e) {}

  if (isSessionBlocked) {
    showAuthStep('auth-step-blocked');
  } else if (isAuthorized) {
    unlockApp(false);
  } else {
    showAuthStep('auth-step-login');
  }

  if(authBtn) authBtn.addEventListener('click', checkPassword);
  if(passInput) passInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') checkPassword(); });

  if (forgotLink) {
    forgotLink.addEventListener('click', function(e) {
      e.preventDefault();
      if (passInput) passInput.value = '';
      if (authError) authError.style.display = 'none';
      resetQuizState();
      showAuthStep('auth-step-q1');
    });
  }

  if (backToLoginLink) {
    backToLoginLink.addEventListener('click', function(e) {
      e.preventDefault();
      if (passInput) passInput.value = '';
      if (authError) authError.style.display = 'none';
      resetQuizState();
      showAuthStep('auth-step-login');
    });
  }

  authOverlay.querySelectorAll('.auth-quiz-option').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.disabled) return;
      var qNum = parseInt(btn.getAttribute('data-q'), 10);
      var isCorrect = btn.getAttribute('data-correct') === 'true';
      btn.disabled = true;
      if (isCorrect) {
        btn.classList.add('correct');
        handleCorrectAnswer(qNum);
      } else {
        btn.classList.add('wrong');
        handleWrongAnswer(qNum);
      }
    });
  });

  var quizUnlockBtn = document.getElementById('auth-quiz-unlock-btn');
  if (quizUnlockBtn) {
    quizUnlockBtn.addEventListener('click', function() {
      unlockApp(true);
    });
  }

  /* ===== ІНІЦІАЛІЗАЦІЯ МОДУЛІВ ===== */  try {
    if (window.ESS_API) window.ESS_API.init();
    else console.error("⚠️ Модуль ESS_API не знайдено!");

    if (window.CIT_API) window.CIT_API.init();
    else console.error("⚠️ Модуль CIT_API не знайдено!");

    if (window.APP_API) {
      window.APP_API.init();
      window.APP_API.loadData();
    }
  } catch (error) {
    console.error("Помилка при ініціалізації: ", error);
    alert("Сталася помилка при завантаженні калькуляторів. Деталі: " + error.message);
  }

  var tabBtns = document.querySelectorAll('.suite-tab-btn');
  var tabContents = document.querySelectorAll('.suite-tab-content');
  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      tabBtns.forEach(function(b) { b.classList.remove('active'); });
      tabContents.forEach(function(c) { c.style.display = 'none'; c.classList.remove('active'); });
      btn.classList.add('active');
      var targetEl = document.getElementById(btn.getAttribute('data-target'));
      if(targetEl) { targetEl.style.display = 'block'; targetEl.classList.add('active'); }
    });
  });

});
