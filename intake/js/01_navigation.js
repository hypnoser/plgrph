/* ======================================================================
   Intake v4.1 — 01_navigation.js
   ====================================================================== */
"use strict";

var NAV_STACK = [];

function show(id, opts){
  opts = opts || {};
  var s = document.querySelectorAll(".screen");
  for (var i = 0; i < s.length; i++) s[i].classList.remove("on");
  var target = el(id);
  if (target) target.classList.add("on");
  if (opts.pushBack !== false && opts.from) NAV_STACK.push(opts.from);
  window.scrollTo(0, 0);
}
function navBack(fallback){ show(NAV_STACK.pop() || fallback); }

var PI_SAVE = (function(){
  var ITER = 150000, handle = null, key = null, salt = null, dir = null, caseDir = null, casePath = "", caseId = "";
  var readOnly = false, dirty = false, busy = false, lastSaved = 0, lastError = "", revision = 0, savedRevision = 0;
  var source = null, timer = null, running = null, requested = false;
  var plainHandleBeforeEncrypt = null;

  function b64(buf){ var a = new Uint8Array(buf), s = ""; for (var i=0;i<a.length;i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s){ return Uint8Array.from(atob(s), function(c){ return c.charCodeAt(0); }); }
  function derive(pw, s, n){
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"])
      .then(function(b){ return crypto.subtle.deriveKey({ name:"PBKDF2", salt:s, iterations:n, hash:"SHA-256" }, b, { name:"AES-GCM", length:256 }, false, ["encrypt","decrypt"]); });
  }
  function idb(mode, fn){
    return new Promise(function(resolve, reject){
      var rq = indexedDB.open("intake_fs", 1);
      rq.onupgradeneeded = function(){ rq.result.createObjectStore("h"); };
      rq.onerror = function(){ reject(rq.error); };
      rq.onsuccess = function(){
        var db = rq.result, tx, r;
        try { tx = db.transaction("h", mode); r = fn(tx.objectStore("h")); }
        catch(e){ db.close(); reject(e); return; }
        tx.oncomplete = function(){ var v = r && r.result; db.close(); resolve(v); };
        tx.onerror = tx.onabort = function(){ db.close(); reject(tx.error || new Error("storage")); };
      };
    });
  }
  function dirState(){ return dir ? dir.queryPermission({ mode:"readwrite" }).catch(function(){ return "denied"; }) : Promise.resolve("none"); }
  function loadDir(){ return idb("readonly", function(st){ return st.get("dir"); }).then(function(h){ dir = h || null; return dirState(); }).catch(function(){ return "none"; }); }
  async function chooseDir(){
    if (!window.showDirectoryPicker) return null;
    try {
      var h = await window.showDirectoryPicker({ mode:"readwrite", id:"intake_sessions" });
      dir = h; caseDir = null; casePath = "";
      await idb("readwrite", function(st){ return st.put(h, "dir"); }).catch(function(){});
      return h;
    } catch(e){ return null; }
  }
  function grantDir(){ return dir ? dir.requestPermission({ mode:"readwrite" }).catch(function(){ return "denied"; }) : Promise.resolve("none"); }
  function safeName(v){ return String(v || "").normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "").trim().slice(0, 90); }

  async function prepareCase(info){
    if (caseId === info.id && caseDir) return casePath;
    if (await dirState() !== "granted"){ caseDir = null; casePath = ""; caseId = info.id; return ""; }
    var d = new Date(info.created), y = String(d.getFullYear()), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
    var name = y + "-" + m + "-" + day + "-" + (safeName(info.label) || "Справа");
    var yd = await dir.getDirectoryHandle(y, { create:true }), md = await yd.getDirectoryHandle(m, { create:true });
    caseDir = await md.getDirectoryHandle(name, { create:true }); casePath = y + "/" + m + "/" + name; caseId = info.id;
    return casePath;
  }
  function download(name, text){
    var blob = new Blob([text], { type:"application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 3000);
  }
  async function putFile(root, name, text){
    var h = await root.getFileHandle(name, { create:true }), w = await h.createWritable();
    try { await w.write(text); await w.close(); } catch(e){ try { await w.abort(); } catch(_){} throw e; }
    return h;
  }
  async function removeFile(root, name){ try { await root.removeEntry(name); } catch(e){} }
  async function writeFile(name, text){
    try { if (caseDir) await putFile(caseDir, name, text); else download(name, text); return true; }
    catch(e){ lastError = e.name || "помилка"; return false; }
  }
  async function chooseFile(id){
    if (!window.showSaveFilePicker) throw new Error("Цей браузер не підтримує прямий запис у файл. Відкрийте програму в Microsoft Edge або Chrome на комп'ютері.");
    var selected = await window.showSaveFilePicker({
      suggestedName: "session_" + id + (key ? ".pgi" : ".json"),
      types: [{ description:"Сесія анкетування", accept:{ "application/json":[".json",".pgi"] } }]
    });
    if (running) await running;
    handle = selected; lastError = ""; return true;
  }
  /* Відкриває раніше збережений файл сесії ЧЕРЕЗ showOpenFilePicker
     (не звичайний <input type=file>), бо лише цей шлях дає handle з
     правом на запис — потрібно, щоб продовжене заповнення автоматично
     писалось назад у той самий файл, без окремого кроку "обрати файл
     для запису" в Налаштуваннях. Повертає { file, handle } — handle
     може бути null, якщо showOpenFilePicker недоступний (тоді виклик
     не відбудеться взагалі, викликач має впасти на input[type=file]). */
  async function openForResume(){
    if (!window.showOpenFilePicker) return null;
    var picked = await window.showOpenFilePicker({
      types: [{ description:"Сесія анкетування", accept:{ "application/json":[".json",".pgi"] } }],
      excludeAcceptAllOption: false,
      mode: "readwrite"
    });
    var h = picked[0];
    var file = await h.getFile();
    return { file:file, handle:h };
  }
  async function usePassword(pw){
    if (running) await running;
    if (!pw){ key = null; salt = null; return false; }
    var ns = crypto.getRandomValues(new Uint8Array(16)), nk = await derive(pw, ns, ITER);
    salt = ns; key = nk;
    if (handle && !plainHandleBeforeEncrypt) plainHandleBeforeEncrypt = { name: handle.name };
    return true;
  }
  async function pack(obj){
    var plain = JSON.stringify(obj);
    if (!key) return plain;
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name:"AES-GCM", iv:iv }, key, new TextEncoder().encode(plain));
    return JSON.stringify({ pgiVersion:1, kdf:{ salt:b64(salt), iterations:ITER }, iv:b64(iv), ciphertext:b64(ct) });
  }
  async function drain(){
    busy = true; var success = true;
    try {
      while (requested){
        requested = false;
        var obj = source && source();
        if (readOnly || !obj) break;
        var rev = revision, copy = JSON.parse(JSON.stringify(obj));
        if (copy.integrity_version === 2) copy.hash = await sessionHash(copy);
        var text = await pack(copy);
        var isEncryptedNow = !!key;
        var targetName = "session_" + (obj.session_id || "session") + (isEncryptedNow ? ".pgi" : ".json");

        if (isEncryptedNow && plainHandleBeforeEncrypt && caseDir){
          await putFile(caseDir, targetName, text);
          if (plainHandleBeforeEncrypt.name && plainHandleBeforeEncrypt.name !== targetName)
            await removeFile(caseDir, plainHandleBeforeEncrypt.name);
          handle = await caseDir.getFileHandle(targetName);
          plainHandleBeforeEncrypt = null;
        } else if (handle){
          var w = await handle.createWritable();
          try { await w.write(text); await w.close(); } catch(e){ try { await w.abort(); } catch(_){} throw e; }
        } else if (caseDir){
          handle = await caseDir.getFileHandle(targetName, { create:true });
          var w2 = await handle.createWritable();
          try { await w2.write(text); await w2.close(); } catch(e){ try { await w2.abort(); } catch(_){} throw e; }
        } else {
          throw new Error("Файл для запису не обрано. Дані ще не збережено.");
        }
        if (obj === (source && source()) && revision === rev) obj.hash = copy.hash;
        savedRevision = rev; lastSaved = Date.now(); lastError = ""; dirty = revision !== savedRevision;
        if (dirty && (handle||caseDir)) requested = true;
      }
    } catch(e){ lastError = e.message || e.name || "помилка запису"; dirty = true; requested = false; success = false; }
    finally { busy = false; running = null; if (timer){ clearTimeout(timer); timer = null; } }
    return success;
  }
  function writeNow(){
    if (readOnly || !source || !source()) return Promise.resolve(false);
    if (!handle && !caseDir){ dirty = true; lastError = "Файл для запису не обрано."; return Promise.resolve(false); }
    requested = true;
    if (running) return running;
    running = drain(); return running;
  }
  function touched(){
    if (readOnly) return;
    revision++; dirty = true;
    if (busy){ requested = true; return; }
    if (!handle && !caseDir) return;
    if (!timer) timer = setTimeout(function(){ timer = null; writeNow(); }, 1000);
  }
  function status(){ return { mode: handle ? "file" : (caseDir?"dir":"none"), encrypted: !!key, dirty: dirty || busy, busy: busy, saved: lastSaved, error: lastError, casePath: casePath }; }

  async function readSession(file, pw){
    if (file.size > 50 * 1024 * 1024) throw new Error("Файл завеликий (понад 50 МБ)");
    var data = JSON.parse(await file.text()); assertSafeTree(data);
    var nk = null, ns = null;
    if (data && data.pgiVersion === 1){
      if (!pw) throw new Error("no_password");
      var n = data.kdf && data.kdf.iterations;
      if (!Number.isInteger(n) || n < 10000 || n > 2000000) throw new Error("bad_format");
      ns = unb64(data.kdf.salt);
      if (ns.length !== 16 || unb64(data.iv).length !== 12) throw new Error("bad_format");
      try {
        nk = await derive(pw, ns, n);
        var plain = await crypto.subtle.decrypt({ name:"AES-GCM", iv:unb64(data.iv) }, nk, unb64(data.ciphertext));
        data = JSON.parse(new TextDecoder().decode(plain));
      } catch(e){ throw new Error("bad_password"); }
      assertSafeTree(data);
    }
    validateSaved(data);
    key = nk; salt = ns; return data;
  }
  async function reset(){
    if (running) await running;
    handle = null; key = null; salt = null; readOnly = false; dirty = false; lastSaved = 0; lastError = "";
    revision = 0; savedRevision = 0; source = null; requested = false; plainHandleBeforeEncrypt = null;
    if (timer){ clearTimeout(timer); timer = null; }
  }

  return {
    setTarget:function(h){ handle=h; lastError=""; }, getTarget:function(){ return handle; },
    hasHandle:function(){ return !!handle; }, readOnly:function(v){ readOnly=!!v; if(v) handle=null; }, isReadOnly:function(){ return readOnly; },
    usePassword:usePassword, chooseFile:chooseFile, chooseDir:chooseDir, loadDir:loadDir, grantDir:grantDir, dirState:dirState,
    dirName:function(){ return dir?dir.name:""; }, casePath:function(){ return casePath; }, prepareCase:prepareCase,
    clearCase:function(){ caseDir=null; casePath=""; caseId=""; }, writeFile:writeFile, bind:function(fn){ source=fn; },
    touched:touched, now:writeNow, status:status, read:readSession, reset:reset, available:function(){ return !!window.showSaveFilePicker; },
    openForResume:openForResume
  };
})();

function validateSaved(s){
  if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("Це не файл сесії");
  function obj(v){ return v && typeof v === "object" && !Array.isArray(v); }
  function images(o){
    if (!obj(o)) throw new Error("Пошкоджено рукописні поля");
    Object.keys(o).forEach(function(k){
      if (typeof o[k] !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(o[k])) throw new Error("Рукописні поля мають бути вбудованими PNG");
    });
  }
  /* signatures — змішаний об'єкт з версії, де підпис нефінальних блоків
     замінено на чекбокс підтвердження (confirmNode): S.signatures[block.id]
     для КОЖНОГО блоку, крім останнього, зберігає ISO-timestamp моменту
     підтвердження, не зображення. Лише signatures.final лишається
     рукописним PNG-підписом (останній блок і далі підписується стилусом).
     images() тут перевіряла б усі значення як PNG і хибно відхиляла б
     будь-яку реальну завершену сесію з підтвердженими нефінальними
     блоками — тому перевіряємо кожен ключ за його власним форматом. */
  function signatures(o){
    if (!obj(o)) throw new Error("Пошкоджено підписи блоків");
    Object.keys(o).forEach(function(k){
      var v = o[k];
      if (typeof v !== "string") throw new Error("Підпис «" + k + "» пошкоджено");
      if (k === "final"){
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)) throw new Error("Підсумковий підпис має бути вбудованим PNG");
      } else {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)) throw new Error("Підтвердження блоку «" + k + "» має бути часовою міткою");
      }
    });
  }
  if (["1.0","1.1","2.0"].indexOf(s.schema_version) < 0) throw new Error("Непідтримувана версія сесії");
  /* questionnaire може бути null — це проміжний стан "справу створено,
     анкету ще не завантажено" (файл сесії існує й пишеться на диск
     одразу після збереження ПІБ, ще до вибору анкети). Якщо анкета
     є — вона все одно має бути валідною за схемою. */
  if (s.questionnaire !== null){
    var v = PI_VALIDATE.run(s.questionnaire); if (!v.ok) throw new Error("Некоректна анкета всередині сесії");
  }
  if (typeof s.session_id !== "string" || !s.session_id || !/^[a-zA-Z0-9_.-]+$/.test(s.session_id) ||
      !Array.isArray(s.events) || s.events.length > 100000 || !obj(s.answers) || !obj(s.identity) ||
      !obj(s.explanations) || !obj(s.signatures)) throw new Error("Неповний файл сесії");
  images(s.identity); images(s.explanations); signatures(s.signatures);
  return true;
}
function legacyCanonical(S){
  return JSON.stringify({
    session_id:S.session_id, started:S.started, finished:S.finished, questionnaire:S.questionnaire,
    identity:S.identity, answers:S.answers, explanations:S.explanations, signatures:S.signatures,
    consent_record:S.consent_record||null, events:S.events, marks:S.marks||[], reminder:S.reminder,
    notes:S.notes||"", overrides:S.overrides||{}
  });
}
function canonical(S){
  if (S.integrity_version !== 2) return legacyCanonical(S);
  var o = {}; Object.keys(S).forEach(function(k){ if (k !== "hash") o[k] = S[k]; }); return stable(o);
}
function hashText(text){ return digest(text).then(function(h){ return h.slice(0,32).toUpperCase().replace(/(.{8})(?=.)/g,"$1 "); }); }
function sessionHash(S){ return S.integrity_version === 2 ? digest(canonical(S)) : hashText(canonical(S)); }

var SETTINGS_PIN = "";
(function(){ try { SETTINGS_PIN = localStorage.getItem("intake_settings_pin") || ""; } catch(e){} })();
function openSettings(fromScreenId){
  if (!SETTINGS_PIN){ show("s-settings", { from: fromScreenId }); return; }
  NAV_STACK.push(fromScreenId);
  show("s-settings-gate", { pushBack:false });
}
function trySettingsPin(){
  var val = el("settings-pin-input").value;
  if (val === SETTINGS_PIN){ el("settings-pin-input").value=""; el("settings-pin-why").textContent=""; show("s-settings",{pushBack:false}); }
  else el("settings-pin-why").textContent = "Неправильний PIN";
}
