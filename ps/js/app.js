window.APP_API = (function () {
  var S = window.STRINGS;
  var isUnsaved = false;
  var saveStatus, nameInp, dateInp;

  function checkJSZip() {
    if (typeof JSZip === 'undefined') { alert(S.err_jszip_missing); return false; }
    return true;
  }

  function dataUrlToUint8(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var binary = atob(base64);
    var arr = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  }

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

  // ── Шифрування захищеного експорту (AES-256-GCM, ключ з пароля через PBKDF2) ──
  // Формат файлу .pgse: JSON-обгортка { pgseVersion, kdf: {salt, iterations}, iv, ciphertext } —
  // усі бінарні поля в base64. Ключ ніколи не зберігається, лише похідний від пароля щоразу заново.
  var PGSE_KDF_ITERATIONS = 150000;

  function uint8ToBase64(uint8) {
    var binary = '';
    for (var i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
  }

  function base64ToUint8(base64) {
    var binary = atob(base64);
    var arr = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  }

  function deriveAesKey(password, saltUint8) {
    var enc = new TextEncoder();
    return window.crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (baseKey) {
        return window.crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: saltUint8, iterations: PGSE_KDF_ITERATIONS, hash: 'SHA-256' },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  // plaintextBytes: Uint8Array вихідного файлу (.json або .zip, уже готового як бінарний вміст)
  // Повертає Promise<string> — JSON-рядок формату .pgse, готовий для збереження як файл.
  function encryptToPgse(password, plaintextBytes) {
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    return deriveAesKey(password, salt).then(function (key) {
      return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintextBytes);
    }).then(function (ciphertextBuf) {
      var wrapper = {
        pgseVersion: 1,
        kdf: { salt: uint8ToBase64(salt), iterations: PGSE_KDF_ITERATIONS },
        iv: uint8ToBase64(iv),
        ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuf))
      };
      return JSON.stringify(wrapper);
    });
  }

  // pgseText: вміст .pgse файлу як текст. Повертає Promise<Uint8Array> розшифрованого вмісту
  // (сам вихідний .json або .zip у байтах) або відхиляє проміс при невірному паролі/пошкодженні.
  function decryptFromPgse(password, pgseText) {
    var wrapper;
    try { wrapper = JSON.parse(pgseText); }
    catch (e) { return Promise.reject(new Error('bad_format')); }
    if (!wrapper || wrapper.pgseVersion !== 1 || !wrapper.kdf || !wrapper.iv || !wrapper.ciphertext) {
      return Promise.reject(new Error('bad_format'));
    }
    var salt = base64ToUint8(wrapper.kdf.salt);
    var iv = base64ToUint8(wrapper.iv);
    var ciphertext = base64ToUint8(wrapper.ciphertext);
    return deriveAesKey(password, salt).then(function (key) {
      // AES-GCM сам перевіряє цілісність/автентичність — невірний пароль призводить
      // до помилки decrypt (OperationError), яку ловимо як "невірний пароль".
      return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
    }).then(function (plainBuf) {
      return new Uint8Array(plainBuf);
    }).catch(function () {
      return Promise.reject(new Error('wrong_password'));
    });
  }

  // Розпізнає .pgse за вмістом (не лише розширенням): валідний JSON з pgseVersion:1.
  // Дозволяє коректно обробити файл навіть якщо користувач перейменував розширення.
  function looksLikePgse(text) {
    try {
      var obj = JSON.parse(text);
      return !!(obj && obj.pgseVersion === 1 && obj.kdf && obj.iv && obj.ciphertext);
    } catch (e) { return false; }
  }

  function collectGlobalState() {
    var notesState = window.NOTES_API ? window.NOTES_API.collectState() : { text: '', imagesMeta: [] };
    return {
      respondentName: nameInp ? nameInp.value : '',
      examDate: dateInp ? dateInp.value : '',
      ess: window.ESS_API ? window.ESS_API.collectState() : [],
      cit: window.CIT_API ? window.CIT_API.collectState() : [],
      notes: notesState.text || '',
      imagesMeta: notesState.imagesMeta || [],
      sv: window.SUPERVISION_API ? window.SUPERVISION_API.collectState() : [],
      ri: window.RI_API ? window.RI_API.collectState() : []
    };
  }

  function performSave() {
    try {
      localStorage.setItem('polygraph_suite_data', JSON.stringify(collectGlobalState()));
      isUnsaved = false;
      if (saveStatus) { saveStatus.classList.remove('unsaved'); saveStatus.textContent = S.status_saved; }
    } catch (e) {
      if (saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = S.status_error; }
    }
  }

  function loadData() {
    var raw;
    try {
      raw = localStorage.getItem('polygraph_suite_data');
    } catch (err) {
      console.error('loadData Error (localStorage):', err);
      raw = null;
    }

    var parsed = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
        if (parsed.tests && !parsed.ess) parsed.ess = parsed.tests;
      } catch (err) {
        console.error('loadData Error (JSON parse):', err);
        parsed = null;
      }
    }

    if (parsed) {
      try { if (parsed.respondentName !== undefined && nameInp) nameInp.value = parsed.respondentName; }
      catch (err) { console.error('loadData Error (respondentName):', err); }
      try { if (parsed.examDate !== undefined && dateInp) dateInp.value = parsed.examDate; }
      catch (err) { console.error('loadData Error (examDate):', err); }
    }

    // Кожен модуль відновлюється незалежно: збій одного не блокує решту
    try { if (window.ESS_API) window.ESS_API.restoreState(parsed ? (parsed.ess || []) : []); }
    catch (err) { console.error('loadData Error (ESS_API):', err); }

    try { if (window.CIT_API) window.CIT_API.restoreState(parsed ? (parsed.cit || []) : []); }
    catch (err) { console.error('loadData Error (CIT_API):', err); }

    try { if (window.NOTES_API) window.NOTES_API.restoreState({ text: parsed ? (parsed.notes || '') : '', imagesMeta: parsed ? (parsed.imagesMeta || []) : [] }); }
    catch (err) { console.error('loadData Error (NOTES_API):', err); }

    try { if (window.SUPERVISION_API) window.SUPERVISION_API.restoreState(parsed ? (parsed.sv || []) : []); }
    catch (err) { console.error('loadData Error (SUPERVISION_API):', err); }

    try { if (window.RI_API) window.RI_API.restoreState(parsed ? (parsed.ri || []) : []); }
    catch (err) { console.error('loadData Error (RI_API):', err); }
  }

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
    location.reload();
  }

  function handleZipLoad(file) {
    if (!checkJSZip()) return;
    JSZip.loadAsync(file).then(function (zip) {
      var jsonFile = zip.file('data.json');
      if (!jsonFile) { alert(S.err_zip_no_json); return; }
      jsonFile.async('string').then(function (jsonStr) {
        var parsed;
        try { parsed = JSON.parse(jsonStr); } catch (e) { alert(S.err_zip_bad_json); return; }
        if (parsed.tests && !parsed.ess) parsed.ess = parsed.tests;
        var cleanState = {
          respondentName: parsed.respondentName || '',
          examDate: parsed.examDate || '',
          ess: parsed.ess || [],
          cit: parsed.cit || [],
          notes: parsed.notes || '',
          // навмисно порожній: реальні id призначаються в restoreImagesFromZip
          // після reload, щоб уникнути дублювання зображень
          imagesMeta: []
        };
        localStorage.setItem('polygraph_suite_data', JSON.stringify(cleanState));

        var imageFiles = [];
        var folder = zip.folder('images');
        if (folder) folder.forEach(function (relativePath, f) { imageFiles.push({ name: relativePath, file: f }); });
        if (imageFiles.length === 0) { location.reload(); return; }

        var pending = imageFiles.length;
        var imagesForRestore = [];
        imageFiles.forEach(function (item) {
          item.file.async('uint8array').then(function (data) {
            var mime = getMimeFromName(item.name);
            var dataUrl = uint8ToDataUrl(data, mime);
            imagesForRestore.push({ name: item.name, dataUrl: dataUrl });
            pending--;
            if (pending === 0) {
              sessionStorage.setItem('polygraph_zip_images', JSON.stringify(imagesForRestore));
              location.reload();
            }
          });
        });
      });
    }).catch(function (e) {
      alert(S.err_zip_read + ': ' + e.message);
    });
  }

  function restoreZipImagesIfNeeded() {
    var raw = sessionStorage.getItem('polygraph_zip_images');
    if (!raw) return;
    sessionStorage.removeItem('polygraph_zip_images');
    if (!window.NOTES_API) return;
    try {
      var images = JSON.parse(raw);
      if (images && images.length > 0) {
        window.NOTES_API.restoreImagesFromZip(images, function () { performSave(); });
      }
    } catch (e) {}
  }

  // Формує вміст експорту (JSON-текст або ZIP-байти, залежно від наявності зображень)
  // без запуску завантаження файлу — спільна логіка для звичайного й захищеного експорту.
  // callback(err, { bytes: Uint8Array, ext: 'json'|'zip' })
  function buildExportPayload(state, callback) {
    if (window.NOTES_API && window.NOTES_API.hasImages()) {
      if (!checkJSZip()) { callback(new Error('jszip_missing')); return; }
      window.NOTES_API.getAllImageData(function (err, images) {
        var zip = new JSZip();
        zip.file('data.json', JSON.stringify(state, null, 2));
        var imgFolder = zip.folder('images');
        images.forEach(function (img) {
          try {
            var uint8 = dataUrlToUint8(img.dataUrl);
            imgFolder.file(img.name, uint8, { binary: true });
          } catch (e) {}
        });
        zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }).then(function (bytes) {
          callback(null, { bytes: bytes, ext: 'zip' });
        });
      });
    } else {
      var enc = new TextEncoder();
      callback(null, { bytes: enc.encode(JSON.stringify(state, null, 2)), ext: 'json' });
    }
  }

  function downloadBlob(bytes, mimeType, filename) {
    var blob = new Blob([bytes], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson(state, safeResp, dateStr) {
    var filename = 'polygraph-suite-' + safeResp + dateStr + '.json';
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportZip(state, safeResp, dateStr) {
    if (!checkJSZip()) return;
    window.NOTES_API.getAllImageData(function (err, images) {
      var zip = new JSZip();
      zip.file('data.json', JSON.stringify(state, null, 2));
      var imgFolder = zip.folder('images');
      images.forEach(function (img) {
        try {
          var uint8 = dataUrlToUint8(img.dataUrl);
          imgFolder.file(img.name, uint8, { binary: true });
        } catch (e) {}
      });
      zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }).then(function (blob) {
        var filename = 'polygraph-suite-' + safeResp + dateStr + '.zip';
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  return {
    init: function () {
      saveStatus = document.getElementById('g-status');
      nameInp = document.getElementById('global-resp-name');
      dateInp = document.getElementById('global-exam-date');

      if (nameInp) nameInp.addEventListener('input', this.markUnsaved.bind(this));
      if (dateInp) dateInp.addEventListener('change', this.markUnsaved.bind(this));

      // Локалізація статичного тексту модалок захищеного експорту/імпорту (.pgse)
      var pgseSaveBtn = document.getElementById('g-save-encrypted');
      if (pgseSaveBtn) pgseSaveBtn.title = S.pgse_export_btn_title;
      var elExportTitle = document.getElementById('pgse-export-title');
      if (elExportTitle) elExportTitle.textContent = S.pgse_export_modal_title;
      var elExportPass1Label = document.getElementById('pgse-export-pass1-label');
      if (elExportPass1Label) elExportPass1Label.insertBefore(document.createTextNode(S.pgse_export_pass1_label + ' '), elExportPass1Label.firstChild);
      var elExportPass2Label = document.getElementById('pgse-export-pass2-label');
      if (elExportPass2Label) elExportPass2Label.insertBefore(document.createTextNode(S.pgse_export_pass2_label + ' '), elExportPass2Label.firstChild);
      var elExportHint = document.getElementById('pgse-export-hint');
      if (elExportHint) elExportHint.textContent = S.pgse_export_hint;
      var elExportConfirmBtn = document.getElementById('pgse-export-confirm');
      if (elExportConfirmBtn) elExportConfirmBtn.textContent = S.pgse_export_confirm_btn;
      var elExportCancelBtn = document.getElementById('pgse-export-cancel');
      if (elExportCancelBtn) elExportCancelBtn.textContent = S.modal_cancel;
      var elImportTitle = document.getElementById('pgse-import-title');
      if (elImportTitle) elImportTitle.textContent = S.pgse_import_modal_title;
      var elImportPassLabel = document.getElementById('pgse-import-pass-label');
      if (elImportPassLabel) elImportPassLabel.insertBefore(document.createTextNode(S.pgse_import_pass_label + ' '), elImportPassLabel.firstChild);
      var elImportConfirmBtn = document.getElementById('pgse-import-confirm');
      if (elImportConfirmBtn) elImportConfirmBtn.textContent = S.pgse_import_confirm_btn;
      var elImportCancelBtn = document.getElementById('pgse-import-cancel');
      if (elImportCancelBtn) elImportCancelBtn.textContent = S.modal_cancel;

      var btnSave = document.getElementById('g-save');
      if (btnSave) btnSave.addEventListener('click', function () { performSave(); });

      var btnSaveJson = document.getElementById('g-save-json');
      if (btnSaveJson) btnSaveJson.addEventListener('click', function () {
        performSave();
        var state = collectGlobalState();
        var resp = nameInp ? nameInp.value.trim() : '';
        var safeResp = resp ? resp.replace(/[^a-zа-яієїґ0-9]/gi, '_') + '-' : '';
        var dateStr = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0, 10);

        if (window.NOTES_API && window.NOTES_API.hasImages()) {
          if (confirm(S.confirm_export_zip)) exportZip(state, safeResp, dateStr);
          else exportJson(state, safeResp, dateStr);
        } else {
          exportJson(state, safeResp, dateStr);
        }
      });

      // ── Захищений експорт (.pgse): та сама логіка вибору json/zip, але результат шифрується паролем ──
      var pgseExportOverlay = document.getElementById('pgse-export-modal-overlay');
      var pgseExportPass1 = document.getElementById('pgse-export-pass1');
      var pgseExportPass2 = document.getElementById('pgse-export-pass2');
      var pgseExportError = document.getElementById('pgse-export-error');
      var pgseExportSafeResp, pgseExportDateStr, pgseExportState;

      var btnSaveEncrypted = document.getElementById('g-save-encrypted');
      if (btnSaveEncrypted && pgseExportOverlay) {
        btnSaveEncrypted.addEventListener('click', function () {
          performSave();
          pgseExportState = collectGlobalState();
          var resp = nameInp ? nameInp.value.trim() : '';
          pgseExportSafeResp = resp ? resp.replace(/[^a-zа-яієїґ0-9]/gi, '_') + '-' : '';
          pgseExportDateStr = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0, 10);
          pgseExportPass1.value = ''; pgseExportPass2.value = '';
          pgseExportError.style.display = 'none';
          pgseExportOverlay.classList.add('active');
          pgseExportPass1.focus();
        });
      }

      var closePgseExportModal = function () { if (pgseExportOverlay) pgseExportOverlay.classList.remove('active'); };
      var pgseExportClose = document.getElementById('pgse-export-close');
      var pgseExportCancel = document.getElementById('pgse-export-cancel');
      if (pgseExportClose) pgseExportClose.addEventListener('click', closePgseExportModal);
      if (pgseExportCancel) pgseExportCancel.addEventListener('click', closePgseExportModal);
      if (pgseExportOverlay) pgseExportOverlay.addEventListener('click', function (e) { if (e.target === pgseExportOverlay) closePgseExportModal(); });

      var pgseExportConfirm = document.getElementById('pgse-export-confirm');
      if (pgseExportConfirm) pgseExportConfirm.addEventListener('click', function () {
        var p1 = pgseExportPass1.value, p2 = pgseExportPass2.value;
        pgseExportError.style.display = 'none';
        if (!p1) { pgseExportError.textContent = S.pgse_err_empty; pgseExportError.style.display = 'block'; return; }
        if (p1 !== p2) { pgseExportError.textContent = S.pgse_err_mismatch; pgseExportError.style.display = 'block'; return; }

        pgseExportConfirm.disabled = true;
        buildExportPayload(pgseExportState, function (err, payload) {
          if (err) { pgseExportConfirm.disabled = false; pgseExportError.textContent = S.err_jszip_missing; pgseExportError.style.display = 'block'; return; }
          encryptToPgse(p1, payload.bytes).then(function (pgseText) {
            var filename = 'polygraph-suite-' + pgseExportSafeResp + pgseExportDateStr + '.pgse';
            downloadBlob(new TextEncoder().encode(pgseText), 'application/json', filename);
            pgseExportConfirm.disabled = false;
            closePgseExportModal();
          }).catch(function () {
            pgseExportConfirm.disabled = false;
            pgseExportError.textContent = S.pgse_err_encrypt_failed;
            pgseExportError.style.display = 'block';
          });
        });
      });

      // ── Розпізнавання й маршрутизація імпортованого файлу: .pgse (за розширенням АБО за вмістом,
      // якщо файл перейменували), звичайний .json, звичайний .zip ──
      var pgseImportOverlay = document.getElementById('pgse-import-modal-overlay');
      var pgseImportPass = document.getElementById('pgse-import-pass');
      var pgseImportError = document.getElementById('pgse-import-error');
      var pgseImportConfirm = document.getElementById('pgse-import-confirm');
      var pgsePendingText = null; // текст .pgse-файлу, що очікує розшифрування

      var closePgseImportModal = function () {
        if (pgseImportOverlay) pgseImportOverlay.classList.remove('active');
        pgsePendingText = null;
        if (pgseImportPass) pgseImportPass.value = '';
      };

      function openPgseImportModal(pgseText) {
        pgsePendingText = pgseText;
        if (pgseImportError) pgseImportError.style.display = 'none';
        if (pgseImportPass) pgseImportPass.value = '';
        if (pgseImportOverlay) { pgseImportOverlay.classList.add('active'); pgseImportPass.focus(); }
      }

      var pgseImportClose = document.getElementById('pgse-import-close');
      var pgseImportCancel = document.getElementById('pgse-import-cancel');
      if (pgseImportClose) pgseImportClose.addEventListener('click', closePgseImportModal);
      if (pgseImportCancel) pgseImportCancel.addEventListener('click', closePgseImportModal);
      if (pgseImportOverlay) pgseImportOverlay.addEventListener('click', function (e) { if (e.target === pgseImportOverlay) closePgseImportModal(); });

      if (pgseImportConfirm) pgseImportConfirm.addEventListener('click', function () {
        var pass = pgseImportPass.value;
        if (pgseImportError) pgseImportError.style.display = 'none';
        if (!pass || !pgsePendingText) return;
        pgseImportConfirm.disabled = true;
        decryptFromPgse(pass, pgsePendingText).then(function (plainBytes) {
          pgseImportConfirm.disabled = false;
          // Розшифрований вміст — це або JSON-текст, або бінарний ZIP; розрізняємо за сигнатурою ZIP (PK).
          var isZip = plainBytes.length > 2 && plainBytes[0] === 0x50 && plainBytes[1] === 0x4B;
          closePgseImportModal();
          if (isZip) {
            handleZipLoad(new Blob([plainBytes]));
          } else {
            try { handleJsonLoad(JSON.parse(new TextDecoder().decode(plainBytes))); }
            catch (err) { alert(S.err_json_read); }
          }
        }).catch(function (err) {
          pgseImportConfirm.disabled = false;
          if (pgseImportError) {
            pgseImportError.textContent = (err && err.message === 'bad_format') ? S.pgse_err_bad_format : S.pgse_err_wrong_password;
            pgseImportError.style.display = 'block';
          }
        });
      });

      function routeImportedFile(file) {
        var name = file.name.toLowerCase();
        if (name.endsWith('.pgse')) {
          var pgseReader = new FileReader();
          pgseReader.onload = function (evt) { openPgseImportModal(evt.target.result); };
          pgseReader.onerror = function () { alert(S.err_json_read); };
          pgseReader.readAsText(file);
          return;
        }
        if (name.endsWith('.zip')) { handleZipLoad(file); return; }
        if (name.endsWith('.json')) {
          var reader = new FileReader();
          reader.onload = function (evt) {
            var text = evt.target.result;
            // Підстраховка: якщо вміст .json-файлу насправді є .pgse (перейменований вручну) —
            // все одно розпізнаємо його як захищений, а не валимось з помилкою парсингу.
            if (looksLikePgse(text)) { openPgseImportModal(text); return; }
            try { handleJsonLoad(JSON.parse(text)); }
            catch (err) { alert(S.err_json_read); }
          };
          reader.readAsText(file);
          return;
        }
        alert(S.err_unsupported_format);
      }

      var fileInput = document.getElementById('file-import');
      if (fileInput) {
        var btnOpen = document.getElementById('g-open');
        if (btnOpen) btnOpen.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (e) {
          var file = e.target.files[0];
          if (!file) return;
          routeImportedFile(file);
          fileInput.value = '';
        });
      }

      window.addEventListener('dragover', function (e) { e.preventDefault(); document.body.style.backgroundColor = '#e3f2fd'; });
      window.addEventListener('dragleave', function (e) { e.preventDefault(); document.body.style.backgroundColor = '#f5f5f5'; });
      window.addEventListener('drop', function (e) {
        e.preventDefault();
        document.body.style.backgroundColor = '#f5f5f5';
        var file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        routeImportedFile(file);
      });

      var btnPrint = document.getElementById('g-print');
      if (btnPrint) btnPrint.addEventListener('click', function () { window.print(); });

      var btnClear = document.getElementById('g-clear');
      if (btnClear) btnClear.addEventListener('click', function () {
        if (!confirm(S.confirm_clear_all)) return;
        ['polygraph_suite_data', 'ess_polygraph_data', 'cit_standalone_data', 'polygraph_suite_master_data']
          .forEach(function (k) { localStorage.removeItem(k); });
        if (window.NOTES_API) window.NOTES_API.clearAll(function () { location.reload(); });
        else location.reload();
      });

      var btnHelp = document.getElementById('g-help');
      if (btnHelp) btnHelp.addEventListener('click', function () { performSave(); window.location.href = 'info.html'; });

      var btnMarkdown = document.getElementById('g-markdown');
      if (btnMarkdown) btnMarkdown.addEventListener('click', function () {
        var respName = (nameInp && nameInp.value.trim()) ? nameInp.value.trim() : S.md_unknown;
        var dateVal = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0, 10);
        var safeResp = respName !== S.md_unknown ? respName.replace(/[^a-zа-яієїґ0-9]/gi, '_') + '-' : '';
        // YAML double-quoted scalar escaping: захищає frontmatter від "/newline/спецсимволів в імені
        var yamlSafeResp = '"' + respName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';

        var md = '---\n';
        md += 'tags:\n  - polygraph_report\n  - suite\n';
        md += 'date: ' + dateVal + '\n';
        md += 'respondent: ' + yamlSafeResp + '\n';
        md += '---\n\n';
        md += '# ' + S.md_report_title + '\n\n';
        md += '**' + S.md_respondent + ':** ' + respName + '\n';
        md += '**' + S.md_date + ':** [[' + dateVal + ']]\n\n---\n\n';

        if (window.ESS_API) {
          var essMd = window.ESS_API.getMarkdown();
          if (essMd) md += '## 1. ' + S.md_ess_title + '\n\n' + essMd + '\n\n---\n\n';
        }
        if (window.CIT_API) {
          var citMd = window.CIT_API.getMarkdown();
          if (citMd) md += '## 2. ' + S.md_cit_title + '\n\n' + citMd + '\n\n---\n\n';
        }
        if (window.NOTES_API) {
          var notesMd = window.NOTES_API.getMarkdown();
          if (notesMd) md += '## 3. ' + S.md_notes_title + '\n\n' + notesMd + '\n\n---\n\n';
        }

        var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'polygraph-suite-' + safeResp + dateVal + '.md';
        a.click();
        URL.revokeObjectURL(url);
      });

      // ── Автозбереження ────────────────────────────────────
      // 1. Періодичний інтервал: раз на 30 сек, лише якщо є незбережені зміни
      setInterval(function () {
        if (isUnsaved) performSave();
      }, 30000);

      // 2. Втрата видимості вкладки (перемкнули вкладку браузера, згорнули, вимкнули екран)
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && isUnsaved) performSave();
      });

      // 3. Закриття/перезавантаження сторінки — останній рубіж
      window.addEventListener('beforeunload', function () {
        if (isUnsaved) performSave();
      });

      // 4. Вихід фокусу з поля введення після зміни даних (клік в інше місце)
      document.addEventListener('focusout', function (e) {
        var tag = e.target.tagName;
        var insideAuth = e.target.closest && e.target.closest('#auth-overlay');
        if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !insideAuth && isUnsaved) {
          performSave();
        }
      });
    },

    collectGlobalState: collectGlobalState,

    markUnsaved: function () {
      if (!isUnsaved) {
        isUnsaved = true;
        if (saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = S.status_unsaved; }
      }
    },

    performSave: performSave,
    loadData: loadData,
    restoreZipImagesIfNeeded: restoreZipImagesIfNeeded
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  var S = window.STRINGS;

  var authOverlay = document.getElementById('auth-overlay');
  var mainAppContainer = document.getElementById('main-app-container');
  var passInput = document.getElementById('auth-password');
  var authBtn = document.getElementById('auth-submit-btn');
  var authError = document.getElementById('auth-error');
  var forgotLink = document.getElementById('auth-forgot-link');
  var backToLoginLink = document.getElementById('quiz-back-to-login');

  var isAuthorized = false;
  try { isAuthorized = localStorage.getItem('suite_auth') === 'true'; } catch (e) {}

  var quizQuestions = S.quiz_questions;
  var currentQuizQuestions = [];
  var quizState = { attemptsPerQuestion: [0, 0, 0], totalAttempts: 0 };
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
    quizState.attemptsPerQuestion = [0, 0, 0];
    quizState.totalAttempts = 0;
    authOverlay.querySelectorAll('.auth-quiz-option').forEach(function (btn) { btn.classList.remove('correct', 'wrong'); btn.disabled = false; });
    ['quiz-error-q1', 'quiz-error-q2', 'quiz-error-q3'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
    ['quiz-attempts-q1', 'quiz-attempts-q2', 'quiz-attempts-q3'].forEach(function (id) { var el = document.getElementById(id); if (el) { el.textContent = S.quiz_attempt_1_of_3; el.classList.remove('danger'); } });
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
    if (errEl) { errEl.textContent = S.quiz_wrong_prefix + remaining; errEl.style.display = 'block'; }
    if (attEl) { attEl.textContent = S.quiz_attempt_prefix + (quizState.attemptsPerQuestion[qIndex] + 1) + S.quiz_attempt_of_3; if (remaining === 1) attEl.classList.add('danger'); }
    if (remaining <= 0 || quizState.totalAttempts >= MAX_TOTAL_ATTEMPTS) {
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

  try {
    if (window.ESS_API) window.ESS_API.init();
    if (window.CIT_API) window.CIT_API.init();
    if (window.NOTES_API) window.NOTES_API.init();
    if (window.SUPERVISION_API) window.SUPERVISION_API.init();
    if (window.RI_API) window.RI_API.init();
    if (window.APP_API) {
      window.APP_API.init();
      window.APP_API.loadData();
      window.APP_API.restoreZipImagesIfNeeded();
    }
  } catch (error) {
    console.error('Init error:', error);
    alert(S.err_init + ': ' + error.message);
  }

  var tabBtns = document.querySelectorAll('.suite-tab-btn');
  var tabContents = document.querySelectorAll('.suite-tab-content');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      tabContents.forEach(function (c) { c.style.display = 'none'; c.classList.remove('active'); });
      btn.classList.add('active');
      var targetEl = document.getElementById(btn.getAttribute('data-target'));
      if (targetEl) { targetEl.style.display = 'block'; targetEl.classList.add('active'); }
      // При переході на вкладку супервізії — оновити список тестів свіжими даними ESS
      if (btn.getAttribute('data-target') === 'tab-supervision' && window.SUPERVISION_API) {
        window.SUPERVISION_API.refresh();
      }
      // Автозбереження при перемиканні вкладок
      if (window.APP_API) window.APP_API.performSave();
    });
  });
});
