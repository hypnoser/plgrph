// app.js — Polygraph Suite v7.1
// Виправлення: safeResp в markdown-обробнику, isArt дублікат в ess.js,
// очищення IndexedDB при clearAll, підтримка .zip import/export

window.APP_API = (function () {
  var isUnsaved = false;
  var saveStatus, nameInp, dateInp;

  // ── ZIP-утиліти (JSZip — локальний файл) ──────────────────
  function checkJSZip() {
    if (typeof JSZip === 'undefined') {
      alert('Бібліотека JSZip не завантажена. Перевірте наявність файлу jszip.min.js поруч із index.html.');
      return false;
    }
    return true;
  }

  // dataUrl → Uint8Array (без base64-заголовку)
  function dataUrlToUint8(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var binary = atob(base64);
    var arr = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  }

  // Uint8Array → dataUrl
  function uint8ToDataUrl(uint8, mimeType) {
    var binary = '';
    for (var i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return 'data:' + mimeType + ';base64,' + btoa(binary);
  }

  function getMimeFromName(name) {
    var ext = name.split('.').pop().toLowerCase();
    var map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
    return map[ext] || 'image/jpeg';
  }

  // ── Збір глобального стану ─────────────────────────────────
  function collectGlobalState() {
    var notesState = window.NOTES_API ? window.NOTES_API.collectState() : { text: '', imagesMeta: [] };
    return {
      respondentName: nameInp ? nameInp.value : '',
      examDate: dateInp ? dateInp.value : '',
      ess: window.ESS_API ? window.ESS_API.collectState() : [],
      cit: window.CIT_API ? window.CIT_API.collectState() : [],
      notes: notesState.text || '',
      imagesMeta: notesState.imagesMeta || []
    };
  }

  // ── Збереження в localStorage ──────────────────────────────
  function performSave() {
    try {
      localStorage.setItem('polygraph_suite_data', JSON.stringify(collectGlobalState()));
      isUnsaved = false;
      if (saveStatus) { saveStatus.classList.remove('unsaved'); saveStatus.textContent = '🟢 Дані збережено'; }
    } catch (e) {
      if (saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = '❌ Помилка запису'; }
    }
  }

  // ── Завантаження з localStorage ───────────────────────────
  function loadData() {
    try {
      var raw = localStorage.getItem('polygraph_suite_data');
      if (raw) {
        var parsed = JSON.parse(raw);
        // Сумісність зі старим форматом
        if (parsed.tests && !parsed.ess) parsed.ess = parsed.tests;

        if (parsed.respondentName !== undefined && nameInp) nameInp.value = parsed.respondentName;
        if (parsed.examDate !== undefined && dateInp) dateInp.value = parsed.examDate;

        if (window.ESS_API) {
          try { window.ESS_API.restoreState(parsed.ess || []); }
          catch (e) { console.error('ESS Restore Error:', e); }
        }
        if (window.CIT_API) {
          try { window.CIT_API.restoreState(parsed.cit || []); }
          catch (e) { console.error('CIT Restore Error:', e); }
        }
        if (window.NOTES_API) {
          try {
            window.NOTES_API.restoreState({
              text: parsed.notes || '',
              imagesMeta: parsed.imagesMeta || []
            });
          } catch (e) { console.error('NOTES Restore Error:', e); }
        }
      } else {
        if (window.ESS_API) window.ESS_API.restoreState([]);
        if (window.CIT_API) window.CIT_API.restoreState([]);
        if (window.NOTES_API) window.NOTES_API.restoreState({ text: '', imagesMeta: [] });
      }
    } catch (err) {
      console.error('loadData Error:', err);
      if (window.ESS_API) window.ESS_API.restoreState([]);
      if (window.CIT_API) window.CIT_API.restoreState([]);
    }
  }

  // ── Імпорт JSON ────────────────────────────────────────────
  function handleJsonLoad(parsed) {
    if (parsed.tests && !parsed.ess) parsed.ess = parsed.tests;
    var cleanState = {
      respondentName: parsed.respondentName || '',
      examDate: parsed.examDate || '',
      ess: parsed.ess || [],
      cit: parsed.cit || [],
      notes: parsed.notes || '',
      imagesMeta: parsed.imagesMeta || []
    };
    localStorage.setItem('polygraph_suite_data', JSON.stringify(cleanState));
    alert('Дані успішно завантажено! Сторінку буде оновлено для відображення змін.');
    location.reload();
  }

  // ── Імпорт ZIP ─────────────────────────────────────────────
  function handleZipLoad(file) {
    if (!checkJSZip()) return;
    JSZip.loadAsync(file).then(function (zip) {
      // 1. Знаходимо data.json всередині
      var jsonFile = zip.file('data.json');
      if (!jsonFile) {
        alert('ZIP-архів не містить файлу data.json. Можливо, архів пошкоджений або має інший формат.');
        return;
      }
      jsonFile.async('string').then(function (jsonStr) {
        var parsed;
        try { parsed = JSON.parse(jsonStr); }
        catch (e) { alert('Помилка читання data.json у ZIP. Файл пошкоджений.'); return; }

        if (parsed.tests && !parsed.ess) parsed.ess = parsed.tests;
        var cleanState = {
          respondentName: parsed.respondentName || '',
          examDate: parsed.examDate || '',
          ess: parsed.ess || [],
          cit: parsed.cit || [],
          notes: parsed.notes || '',
          imagesMeta: parsed.imagesMeta || []
        };
        localStorage.setItem('polygraph_suite_data', JSON.stringify(cleanState));

        // 2. Завантажуємо зображення з папки images/
        var imageFiles = [];
        zip.folder('images').forEach(function (relativePath, file) {
          imageFiles.push({ name: relativePath, file: file });
        });

        if (imageFiles.length === 0) {
          alert('Дані успішно завантажено (без зображень)! Сторінку буде оновлено.');
          location.reload();
          return;
        }

        // Завантажуємо кожне зображення як base64
        var pending = imageFiles.length;
        var imagesForRestore = [];

        imageFiles.forEach(function (item) {
          item.file.async('uint8array').then(function (data) {
            var mime = getMimeFromName(item.name);
            var dataUrl = uint8ToDataUrl(data, mime);
            imagesForRestore.push({ name: item.name, dataUrl: dataUrl });
            pending--;
            if (pending === 0) {
              // Зберігаємо зображення в IndexedDB після reload через sessionStorage
              // (IndexedDB скидається на reload, тому передаємо через sessionStorage як base64)
              // Оскільки об'єм може бути великим, зберігаємо напряму перед reload
              // через тимчасовий localStorage-ключ (буде видалено після відновлення)
              try {
                sessionStorage.setItem('polygraph_zip_images', JSON.stringify(imagesForRestore));
              } catch (e) {
                // Якщо sessionStorage переповнений — попереджаємо, але продовжуємо
                console.warn('Не вдалось зберегти зображення в sessionStorage:', e);
              }
              alert('Дані та ' + imagesForRestore.length + ' зображень успішно завантажено! Сторінку буде оновлено.');
              location.reload();
            }
          });
        });
      });
    }).catch(function (e) {
      alert('Помилка читання ZIP: ' + e.message);
    });
  }

  // ── Відновлення зображень після ZIP-імпорту ────────────────
  function restoreZipImagesIfNeeded() {
    var raw = sessionStorage.getItem('polygraph_zip_images');
    if (!raw) return;
    sessionStorage.removeItem('polygraph_zip_images');
    if (!window.NOTES_API) return;
    try {
      var images = JSON.parse(raw);
      if (images && images.length > 0) {
        window.NOTES_API.restoreImagesFromZip(images, function () {
          // Після відновлення зображень зберігаємо оновлений стан
          performSave();
        });
      }
    } catch (e) {
      console.warn('Помилка відновлення зображень з ZIP:', e);
    }
  }

  // ── Експорт JSON ───────────────────────────────────────────
  function exportJson(state, safeResp, dateStr) {
    var filename = 'polygraph-suite-' + safeResp + dateStr + '.json';
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Експорт ZIP ────────────────────────────────────────────
  function exportZip(state, safeResp, dateStr) {
    if (!checkJSZip()) return;
    window.NOTES_API.getAllImageData(function (err, images) {
      var zip = new JSZip();
      // Кладемо JSON без imagesMeta (вона вже там є, для відновлення)
      zip.file('data.json', JSON.stringify(state, null, 2));
      // Кладемо зображення в папку images/
      var imgFolder = zip.folder('images');
      images.forEach(function (img) {
        try {
          var uint8 = dataUrlToUint8(img.dataUrl);
          imgFolder.file(img.name, uint8, { binary: true });
        } catch (e) {
          console.warn('Не вдалось додати зображення в ZIP:', img.name, e);
        }
      });
      zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
        .then(function (blob) {
          var filename = 'polygraph-suite-' + safeResp + dateStr + '.zip';
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = filename; a.click();
          URL.revokeObjectURL(url);
        });
    });
  }

  // ── Публічний API ──────────────────────────────────────────
  return {
    init: function () {
      var self = this;

      // Клонуємо кнопки тулбару щоб прибрати старі обробники
      ['g-save', 'g-open', 'g-save-json', 'g-markdown', 'g-print', 'g-clear', 'g-help'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { var clone = el.cloneNode(true); el.parentNode.replaceChild(clone, el); }
      });

      saveStatus = document.getElementById('g-status');
      nameInp = document.getElementById('global-resp-name');
      dateInp = document.getElementById('global-exam-date');

      if (nameInp) nameInp.addEventListener('input', this.markUnsaved.bind(this));
      if (dateInp) dateInp.addEventListener('change', this.markUnsaved.bind(this));

      // 💾 Зберегти (localStorage)
      var btnSave = document.getElementById('g-save');
      if (btnSave) btnSave.addEventListener('click', function () { performSave(); });

      // 📥 Зберегти (.json або .zip залежно від наявності зображень)
      var btnSaveJson = document.getElementById('g-save-json');
      if (btnSaveJson) btnSaveJson.addEventListener('click', function () {
        performSave();
        var state = collectGlobalState();
        var resp = nameInp ? nameInp.value.trim() : '';
        var safeResp = resp ? resp.replace(/[^a-zа-яієїґ0-9]/gi, '_') + '-' : '';
        var dateStr = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0, 10);

        var hasImages = window.NOTES_API && window.NOTES_API.hasImages();
        if (hasImages) {
          var choice = confirm(
            'Виявлено прикріплені зображення.\n\n' +
            'OK → Зберегти як ZIP (json + зображення)\n' +
            'Скасувати → Зберегти тільки JSON (зображення не включаються)'
          );
          if (choice) exportZip(state, safeResp, dateStr);
          else exportJson(state, safeResp, dateStr);
        } else {
          exportJson(state, safeResp, dateStr);
        }
      });

      // 📂 Відкрити (.json або .zip)
      var fileInput = document.getElementById('file-import');
      if (fileInput) {
        var newFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(newFileInput, fileInput);

        var btnOpen = document.getElementById('g-open');
        if (btnOpen) btnOpen.addEventListener('click', function () { newFileInput.click(); });

        newFileInput.addEventListener('change', function (e) {
          var file = e.target.files[0];
          if (!file) return;
          var name = file.name.toLowerCase();
          if (name.endsWith('.json')) {
            var reader = new FileReader();
            reader.onload = function (evt) {
              try { handleJsonLoad(JSON.parse(evt.target.result)); }
              catch (err) { alert('Помилка читання JSON. Файл пошкоджений або має невірний формат.'); }
            };
            reader.readAsText(file);
          } else if (name.endsWith('.zip')) {
            handleZipLoad(file);
          } else {
            alert('Підтримуються лише файли .json та .zip');
          }
          newFileInput.value = '';
        });
      }

      // Drag & Drop — підтримка .json і .zip
      window.addEventListener('dragover', function (e) {
        e.preventDefault();
        document.body.style.backgroundColor = '#e3f2fd';
      });
      window.addEventListener('dragleave', function (e) {
        e.preventDefault();
        document.body.style.backgroundColor = '#f5f5f5';
      });
      window.addEventListener('drop', function (e) {
        e.preventDefault();
        document.body.style.backgroundColor = '#f5f5f5';
        var file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        var name = file.name.toLowerCase();
        if (name.endsWith('.json')) {
          var reader = new FileReader();
          reader.onload = function (evt) {
            try { handleJsonLoad(JSON.parse(evt.target.result)); }
            catch (err) { alert('Помилка читання JSON.'); }
          };
          reader.readAsText(file);
        } else if (name.endsWith('.zip')) {
          handleZipLoad(file);
        } else {
          alert('Підтримуються лише файли .json та .zip');
        }
      });

      // 🖨️ Друк
      var btnPrint = document.getElementById('g-print');
      if (btnPrint) btnPrint.addEventListener('click', function () { window.print(); });

      // 🗑️ Очистити все — включно з IndexedDB
      var btnClear = document.getElementById('g-clear');
      if (btnClear) btnClear.addEventListener('click', function () {
        if (!confirm('Очистити всі дані в усіх вкладках (Почати нову сесію)?')) return;
        // Очищаємо localStorage
        ['polygraph_suite_data', 'ess_polygraph_data', 'cit_standalone_data', 'polygraph_suite_master_data']
          .forEach(function (k) { localStorage.removeItem(k); });
        // Очищаємо IndexedDB через NOTES_API
        if (window.NOTES_API) {
          window.NOTES_API.clearAll(function () { location.reload(); });
        } else {
          location.reload();
        }
      });

      // ❓ Довідка
      var btnHelp = document.getElementById('g-help');
      if (btnHelp) btnHelp.addEventListener('click', function () { window.open('info.html', '_blank'); });

      // 📝 Markdown-експорт (виправлено: safeResp тепер в скоупі обробника)
      var btnMarkdown = document.getElementById('g-markdown');
      if (btnMarkdown) btnMarkdown.addEventListener('click', function () {
        var respName = (nameInp && nameInp.value.trim()) ? nameInp.value.trim() : 'Невідомо';
        var dateVal = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0, 10);
        // ВИПРАВЛЕНО: safeResp тепер оголошена локально в цьому обробнику
        var safeResp = respName !== 'Невідомо' ? respName.replace(/[^a-zа-яієїґ0-9]/gi, '_') + '-' : '';

        var md = '---\n';
        md += 'tags:\n  - polygraph_report\n  - suite\n';
        md += 'date: ' + dateVal + '\n';
        md += 'respondent: ' + respName + '\n';
        md += '---\n\n';
        md += '# Комплексний звіт поліграфолога\n\n';
        md += '**Респондент:** ' + respName + '\n';
        md += '**Дата проведення:** [[' + dateVal + ']]\n\n---\n\n';

        if (window.ESS_API) {
          var essMd = window.ESS_API.getMarkdown();
          if (essMd) md += '## 1. Скринінг / Діагностика (ESS-M)\n\n' + essMd + '\n\n---\n\n';
        }
        if (window.CIT_API) {
          var citMd = window.CIT_API.getMarkdown();
          if (citMd) md += '## 2. Тест на приховану інформацію (CIT)\n\n' + citMd + '\n\n---\n\n';
        }
        if (window.NOTES_API) {
          var notesMd = window.NOTES_API.getMarkdown();
          if (notesMd) md += '## 3. Нотатки поліграфолога\n\n' + notesMd + '\n\n---\n\n';
        }

        var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'polygraph-suite-' + safeResp + dateVal + '.md';
        a.click();
        URL.revokeObjectURL(url);
      });
    },

    collectGlobalState: collectGlobalState,

    markUnsaved: function () {
      if (!isUnsaved) {
        isUnsaved = true;
        if (saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = '🟠 Є незбережені зміни'; }
      }
    },

    performSave: performSave,
    loadData: loadData
  };
})();

document.addEventListener('DOMContentLoaded', function () {

  /* ── Авторизація (без змін) ── */
  var authOverlay = document.getElementById('auth-overlay');
  var mainAppContainer = document.getElementById('main-app-container');
  var passInput = document.getElementById('auth-password');
  var authBtn = document.getElementById('auth-submit-btn');
  var authError = document.getElementById('auth-error');
  var forgotLink = document.getElementById('auth-forgot-link');
  var backToLoginLink = document.getElementById('quiz-back-to-login');

  var isAuthorized = false;
  try { isAuthorized = localStorage.getItem('suite_auth') === 'true'; } catch (e) {}

  var quizQuestions = [
    { text: 'Який пристрій використовується для реєстрації фізіологічних реакцій під час дослідження?', options: [{ text: 'Поліграф', correct: true }, { text: 'Рентген-апарат', correct: false }, { text: 'УЗД-сканер', correct: false }] },
    { text: 'Що вимірює канал EDA на поліграфі?', options: [{ text: 'Електродермальну активність (потовиділення)', correct: true }, { text: 'Температуру тіла', correct: false }, { text: 'Рівень цукру в крові', correct: false }] },
    { text: 'Який тест перевіряє, чи знає людина деталі події, які вона не повинна знати?', options: [{ text: 'CIT (Concealed Information Test)', correct: true }, { text: 'Тест на IQ', correct: false }, { text: 'Тест Роршаха', correct: false }] },
    { text: 'Який канал на поліграфі реєструє зміни частоти серцевих скорочень?', options: [{ text: 'Кардіо (кардіографія)', correct: true }, { text: 'Термометр', correct: false }, { text: 'Глюкометр', correct: false }] },
    { text: 'Що таке «базова лінія» (baseline) у поліграфному тестуванні?', options: [{ text: 'Початковий рівень фізіологічної активності перед стимулом', correct: true }, { text: 'Лінія на папері', correct: false }, { text: 'Медичний діагноз', correct: false }] },
    { text: 'Який тест порівнює реакції на релевантні та порівняльні питання?', options: [{ text: 'CQT (Comparison Question Test)', correct: true }, { text: 'MMPI', correct: false }, { text: 'Тест на слух', correct: false }] },
    { text: 'Що означає абревіатура EDA?', options: [{ text: 'Electrodermal Activity', correct: true }, { text: 'Electronic Data Analysis', correct: false }, { text: 'Emotional Detection Algorithm', correct: false }] },
    { text: 'Який орган реагує на зміни в каналі пневмографії?', options: [{ text: 'Легені / дихальна система', correct: true }, { text: 'Печінка', correct: false }, { text: 'Нирки', correct: false }] },
    { text: 'Що таке «релевантне питання» у CQT?', options: [{ text: 'Питання, безпосередньо пов\'язане з розслідуваною подією', correct: true }, { text: 'Питання про погоду', correct: false }, { text: 'Питання про хобі респондента', correct: false }] },
    { text: 'Який метод оцінювання CIT запропонував Девід Ліккен?', options: [{ text: 'Ранжування амплітуд ЕДР (0, 1, 2)', correct: true }, { text: 'Вимірювання температури тіла', correct: false }, { text: 'Аналіз голосу', correct: false }] },
    { text: 'Що таке «порівняльне питання» у CQT?', options: [{ text: 'Питання про загальні правопорушення, не пов\'язане з цільовою подією', correct: true }, { text: 'Питання про сім\'ю респондента', correct: false }, { text: 'Питання про улюблену їжу', correct: false }] },
    { text: 'Які бали допустимі для каналу ЕДА в ESS-M?', options: [{ text: '-2, 0, +2', correct: true }, { text: '-5, 0, +5', correct: false }, { text: '1, 2, 3', correct: false }] }
  ];

  var currentQuizQuestions = [];
  var quizState = { currentQuestion: 0, attemptsPerQuestion: [0, 0, 0], totalAttempts: 0, blocked: false };
  var MAX_ATTEMPTS_PER_QUESTION = 3;
  var MAX_TOTAL_ATTEMPTS = 9;

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
    return a;
  }

  function generateQuiz() {
    var shuffled = shuffleArray(quizQuestions);
    currentQuizQuestions = shuffled.slice(0, 3);
    for (var i = 0; i < 3; i++) {
      var q = currentQuizQuestions[i];
      var stepNum = i + 1;
      var textEl = document.getElementById('quiz-q-text-' + stepNum);
      if (textEl) textEl.textContent = stepNum + '. ' + q.text;
      var shuffledOpts = shuffleArray(q.options);
      var optsContainer = document.getElementById('quiz-q-options-' + stepNum);
      if (optsContainer) {
        optsContainer.innerHTML = '';
        shuffledOpts.forEach(function (opt) {
          var btn = document.createElement('button');
          btn.className = 'auth-quiz-option';
          btn.setAttribute('data-q', stepNum);
          btn.setAttribute('data-correct', opt.correct ? 'true' : 'false');
          btn.textContent = opt.text;
          optsContainer.appendChild(btn);
        });
      }
    }
  }

  function showAuthStep(stepId) {
    authOverlay.querySelectorAll('.auth-step').forEach(function (s) { s.classList.remove('active'); });
    var target = document.getElementById(stepId);
    if (target) target.classList.add('active');
  }

  function resetQuizState() {
    quizState.currentQuestion = 0; quizState.attemptsPerQuestion = [0, 0, 0]; quizState.totalAttempts = 0; quizState.blocked = false;
    authOverlay.querySelectorAll('.auth-quiz-option').forEach(function (btn) { btn.classList.remove('correct', 'wrong'); btn.disabled = false; });
    ['quiz-error-q1', 'quiz-error-q2', 'quiz-error-q3'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
    ['quiz-attempts-q1', 'quiz-attempts-q2', 'quiz-attempts-q3'].forEach(function (id) { var el = document.getElementById(id); if (el) { el.textContent = 'Спроба 1 з 3'; el.classList.remove('danger'); } });
    authOverlay.querySelectorAll('.auth-quiz-dot').forEach(function (dot) { dot.classList.remove('active', 'correct'); });
    generateQuiz();
  }

  function unlockApp(saveToLocal) {
    if (authOverlay) authOverlay.style.display = 'none';
    if (mainAppContainer) mainAppContainer.style.display = 'block';
    if (saveToLocal) { try { localStorage.setItem('suite_auth', 'true'); } catch (e) {} }
  }

  function handleWrongAnswer(qNum) {
    var qIndex = qNum - 1;
    quizState.attemptsPerQuestion[qIndex]++;
    quizState.totalAttempts++;
    var remaining = MAX_ATTEMPTS_PER_QUESTION - quizState.attemptsPerQuestion[qIndex];
    var errEl = document.getElementById('quiz-error-q' + qNum);
    var attEl = document.getElementById('quiz-attempts-q' + qNum);
    if (errEl) { errEl.textContent = '❌ Неправильно. Залишилось спроб: ' + remaining; errEl.style.display = 'block'; }
    if (attEl) { attEl.textContent = 'Спроба ' + (quizState.attemptsPerQuestion[qIndex] + 1) + ' з ' + MAX_ATTEMPTS_PER_QUESTION; if (remaining === 1) attEl.classList.add('danger'); }
    if (remaining <= 0 || quizState.totalAttempts >= MAX_TOTAL_ATTEMPTS) {
      quizState.blocked = true;
      try { sessionStorage.setItem('suite_auth_blocked', 'true'); } catch (e) {}
      setTimeout(function () { showAuthStep('auth-step-blocked'); }, 600);
    } else {
      setTimeout(function () {
        var options = authOverlay.querySelectorAll('.auth-quiz-option[data-q="' + qNum + '"]');
        options.forEach(function (btn) { btn.classList.remove('wrong'); btn.disabled = false; });
        if (errEl) errEl.style.display = 'none';
      }, 1200);
    }
  }

  function handleCorrectAnswer(qNum) {
    authOverlay.querySelectorAll('.auth-quiz-option[data-q="' + qNum + '"]').forEach(function (btn) { btn.disabled = true; });
    authOverlay.querySelectorAll('#auth-step-q' + qNum + ' .auth-quiz-dot').forEach(function (dot) { if (dot.classList.contains('active')) dot.classList.add('correct'); });
    setTimeout(function () { if (qNum === 3) showAuthStep('auth-step-success'); else showAuthStep('auth-step-q' + (qNum + 1)); }, 500);
  }

  function checkPassword() {
    if (!passInput) return;
    var val = passInput.value.trim().toLowerCase();
    if (val === 'plgrph' || val === 'здікзр') unlockApp(true);
    else {
      if (authError) authError.style.display = 'block';
      var modal = authOverlay ? authOverlay.querySelector('.auth-modal') : null;
      if (modal) { modal.style.animation = 'none'; setTimeout(function () { modal.style.animation = 'shake 0.4s'; }, 10); }
    }
  }

  var isSessionBlocked = false;
  try { isSessionBlocked = sessionStorage.getItem('suite_auth_blocked') === 'true'; } catch (e) {}

  if (isSessionBlocked) showAuthStep('auth-step-blocked');
  else if (isAuthorized) unlockApp(false);
  else showAuthStep('auth-step-login');

  if (authBtn) authBtn.addEventListener('click', checkPassword);
  if (passInput) passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkPassword(); });
  if (forgotLink) {
    forgotLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (passInput) passInput.value = '';
      if (authError) authError.style.display = 'none';
      resetQuizState();
      showAuthStep('auth-step-q1');
    });
  }
  if (backToLoginLink) {
    backToLoginLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (passInput) passInput.value = '';
      if (authError) authError.style.display = 'none';
      resetQuizState();
      showAuthStep('auth-step-login');
    });
  }

  authOverlay.addEventListener('click', function (e) {
    var btn = e.target.closest('.auth-quiz-option');
    if (!btn || btn.disabled) return;
    var qNum = parseInt(btn.getAttribute('data-q'), 10);
    var isCorrect = btn.getAttribute('data-correct') === 'true';
    btn.disabled = true;
    if (isCorrect) { btn.classList.add('correct'); handleCorrectAnswer(qNum); }
    else { btn.classList.add('wrong'); handleWrongAnswer(qNum); }
  });

  var quizUnlockBtn = document.getElementById('auth-quiz-unlock-btn');
  if (quizUnlockBtn) quizUnlockBtn.addEventListener('click', function () { unlockApp(true); });

  /* ── Ініціалізація модулів ── */
  try {
    if (window.ESS_API) window.ESS_API.init();
    else console.error('⚠️ Модуль ESS_API не знайдено!');

    if (window.CIT_API) window.CIT_API.init();
    else console.error('⚠️ Модуль CIT_API не знайдено!');

    if (window.NOTES_API) window.NOTES_API.init();
    else console.error('⚠️ Модуль NOTES_API не знайдено!');

    if (window.APP_API) {
      window.APP_API.init();
      window.APP_API.loadData();
      // Відновлюємо зображення якщо попередній сеанс був завантаженням ZIP
      window.APP_API.restoreZipImagesIfNeeded && window.APP_API.restoreZipImagesIfNeeded();
    }
  } catch (error) {
    console.error('Помилка при ініціалізації:', error);
    alert('Сталася помилка при завантаженні. Деталі: ' + error.message);
  }

  /* ── Перемикач вкладок ── */
  var tabBtns = document.querySelectorAll('.suite-tab-btn');
  var tabContents = document.querySelectorAll('.suite-tab-content');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      tabContents.forEach(function (c) { c.style.display = 'none'; c.classList.remove('active'); });
      btn.classList.add('active');
      var targetEl = document.getElementById(btn.getAttribute('data-target'));
      if (targetEl) { targetEl.style.display = 'block'; targetEl.classList.add('active'); }
    });
  });

  /* Відновлення зображень після ZIP-імпорту (виклик тут, бо NOTES_API вже ініціалізований) */
  (function restoreZipImages() {
    var raw = sessionStorage.getItem('polygraph_zip_images');
    if (!raw || !window.NOTES_API) return;
    sessionStorage.removeItem('polygraph_zip_images');
    try {
      var images = JSON.parse(raw);
      if (images && images.length > 0) {
        window.NOTES_API.restoreImagesFromZip(images, function () {
          // Оновлюємо imagesMeta в localStorage
          var stored = localStorage.getItem('polygraph_suite_data');
          if (stored) {
            try {
              var parsed = JSON.parse(stored);
              var notesState = window.NOTES_API.collectState();
              parsed.imagesMeta = notesState.imagesMeta;
              localStorage.setItem('polygraph_suite_data', JSON.stringify(parsed));
            } catch (e) {}
          }
        });
      }
    } catch (e) { console.warn('Помилка відновлення зображень з ZIP:', e); }
  })();

});
