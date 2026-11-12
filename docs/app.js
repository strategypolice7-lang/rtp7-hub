(function () {
  'use strict';

  // ===== กัน clickjacking เบื้องต้น (GitHub Pages ตั้ง header เองไม่ได้) =====
  // ถ้าหน้านี้ถูกฝังอยู่ใน iframe ของเว็บอื่น ให้พยายามพาหน้าหลักมาที่หน้านี้ (บางเบราว์เซอร์อาจไม่ยอม)
  try {
    if (window.top !== window.self) window.top.location = window.self.location;
  } catch (e) { /* เบราว์เซอร์ไม่อนุญาต ข้ามไป */ }

  // ===== ค่าคงที่ =====
  var ICON_CHOICES = ['gavel', 'directions_car', 'home_work', 'flood', 'person_search', 'shield', 'smoking_rooms', 'description', 'map', 'groups',
    'assignment', 'local_police', 'security', 'campaign', 'insights', 'inventory_2', 'calendar_month', 'gps_fixed', 'traffic', 'fire_truck',
    'local_fire_department', 'medical_services', 'emergency', 'report', 'policy', 'badge', 'fingerprint', 'location_on', 'folder_shared', 'bar_chart'];
  var COLOR_CHOICES = ['#185FA5', '#0F9D58', '#E8710A', '#D93025', '#7B3FB5', '#00838F', '#C2185B', '#5D4037'];
  var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var CACHE_KEY = 'rpt_pub_cache_v1';
  var READ_KEY = 'rpt_read_ids_v1';
  var TOKEN_KEY = 'rpt_admin_token';
  var SUB_TITLES = { systems: 'จัดการระบบ', banners: 'การ์ดแบนเนอร์', ann: 'ข้อความวิ่ง และ popup ประกาศ', notif: 'ส่งแจ้งเตือนกระดิ่ง', docs: 'เอกสารดาวน์โหลด', stats: 'สถิติการใช้งาน' };
  var SUB_KIND = { systems: 'systems', banners: 'banners', ann: 'announcements', notif: 'notifications', docs: 'documents' };
  var DELETE_FN = { systems: 'deleteSystem', banners: 'deleteBanner', announcements: 'deleteAnnouncement', notifications: 'deleteNotification', documents: 'deleteDocument' };
  var MENU = [
    { key: 'systems', icon: 'apps', title: 'จัดการระบบ' },
    { key: 'banners', icon: 'view_carousel', title: 'การ์ดแบนเนอร์' },
    { key: 'ann', icon: 'campaign', title: 'ข้อความวิ่ง และ popup ประกาศ' },
    { key: 'notif', icon: 'notifications_active', title: 'ส่งแจ้งเตือนกระดิ่ง' },
    { key: 'docs', icon: 'folder_open', title: 'เอกสารดาวน์โหลด' },
    { key: 'stats', icon: 'insights', title: 'สถิติการใช้งาน' }
  ];

  var state = {
    data: null, admin: null, token: '', view: 'home', sub: '',
    bannerIdx: 0, bannerTimer: null, bannerSig: '', tickerSig: '',
    popupShown: false, statsDays: 30, statsData: null, statsSeq: 0, statsError: false,
    offlineToastShown: false, configError: ''
  };

  // ===== ตัวช่วยพื้นฐาน =====
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) {
    var s = String(u || '').trim();
    return /^https:\/\/[^\s<>"']+$/i.test(s) ? s : '';
  }
  function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : '#185FA5'; }
  function safeIcon(i) { return /^[a-z0-9_]{1,40}$/.test(String(i || '')) ? i : 'apps'; }
  function mi(name, extra) { return '<span class="mi' + (extra ? ' ' + extra : '') + '">' + safeIcon(name) + '</span>'; }
  function driveImg(fileId) { return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w800'; }
  // ทุกคีย์ที่เก็บในเบราว์เซอร์ใส่คำนำหน้า rtp7hub_ (เพราะ username.github.io เป็น origin เดียวกับโปรเจกต์อื่น)
  var KEY_PREFIX = 'rtp7hub_';
  function lsGet(k) { try { return window.localStorage.getItem(KEY_PREFIX + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(KEY_PREFIX + k, v); } catch (e) { /* ไม่เป็นไร */ } }
  function ssGet(k) { try { return window.sessionStorage.getItem(KEY_PREFIX + k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(KEY_PREFIX + k, v); } catch (e) { /* ไม่เป็นไร */ } }
  function ssDel(k) { try { window.sessionStorage.removeItem(KEY_PREFIX + k); } catch (e) { /* ไม่เป็นไร */ } }
  function debounce(fn, ms) {
    var t = null;
    return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }
  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s || '');
    if (!m) return '';
    var out = (+m[3]) + ' ' + TH_MONTHS[+m[2] - 1] + ' ' + String((+m[1] + 543) % 100);
    if (m[4]) out += ' ' + m[4] + ':' + m[5];
    return out;
  }
  function fmtNum(n) { return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function localDateKey() {
    var d = new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }
  function deviceType() {
    return (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768) ? 'mobile' : 'desktop';
  }
  function isAdmin() { return !!state.token; }

  // ===== เรียก server =====
  // ข้อความภาษาไทยที่ผู้ใช้เห็น
  var MSG_NO_CONFIG = 'ยังไม่ได้ตั้งค่าที่อยู่ระบบหลังบ้าน (ผู้ดูแลระบบต้องใส่ค่า API_URL ในไฟล์ config.js)';
  var MSG_BAD_CONFIG = 'ที่อยู่ระบบหลังบ้านไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://script.google.com/ และลงท้ายด้วย /exec ในไฟล์ config.js)';
  var MSG_NETWORK = 'เชื่อมต่อระบบหลังบ้านไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
  var MSG_TIMEOUT = 'ระบบหลังบ้านตอบช้าเกินไป กรุณาลองใหม่อีกครั้ง';
  var TIMEOUT_NORMAL_MS = 30000;      // เรียกทั่วไป 30 วินาที
  var TIMEOUT_UPLOAD_MS = 120000;     // อัปโหลดไฟล์ 120 วินาที
  var UPLOAD_ACTIONS = { uploadImage: true, saveDocument: true };

  /** อ่านที่อยู่ระบบหลังบ้านจาก config.js คืน {url, error} */
  function readApiConfig() {
    var cfg = window.APP_CONFIG;
    var url = cfg && typeof cfg.API_URL === 'string' ? cfg.API_URL.trim() : '';
    if (!url) return { url: '', error: MSG_NO_CONFIG };
    if (!/^https:\/\/script\.google\.com\/[^\s?#]+\/exec$/.test(url)) return { url: '', error: MSG_BAD_CONFIG };
    return { url: url, error: '' };
  }

  /**
   * เรียกฟังก์ชันหลังบ้าน (Apps Script) ผ่าน fetch
   * ส่งเป็น text/plain เพื่อเลี่ยง CORS preflight (Apps Script ไม่รองรับ) และไม่ใส่ header อื่น / ไม่ส่ง cookie
   * สำเร็จ → resolve(data) ; ok:false → reject(Error(message)) เพื่อให้ตรรกะเดิม (เช่น TOKEN_EXPIRED) ทำงานต่อได้
   */
  function callServer(action, args) {
    return new Promise(function (resolve, reject) {
      var cfg = readApiConfig();
      if (cfg.error) { reject(new Error(cfg.error)); return; }
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timedOut = false;
      var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, UPLOAD_ACTIONS[action] ? TIMEOUT_UPLOAD_MS : TIMEOUT_NORMAL_MS);
      function fail(msg) { clearTimeout(timer); reject(new Error(msg)); }
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, args: args || [] }),
        redirect: 'follow',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      };
      if (ctrl) opts.signal = ctrl.signal;
      fetch(cfg.url, opts).then(function (res) {
        if (!res.ok) throw new Error('HTTP');
        return res.text();
      }).then(function (text) {
        var out;
        try { out = JSON.parse(text); } catch (e) { fail(MSG_NETWORK); return; }
        if (!out || typeof out !== 'object') { fail(MSG_NETWORK); return; }
        clearTimeout(timer);
        if (out.ok === true) { resolve(out.data); return; }
        reject(new Error(typeof out.message === 'string' && out.message ? out.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'));
      }).catch(function () {
        fail(timedOut ? MSG_TIMEOUT : MSG_NETWORK);
      });
    });
  }
  function api(name) {
    return callServer(name, Array.prototype.slice.call(arguments, 1));
  }
  function isTokenExpired(err) { return !!(err && String(err.message || err).indexOf('TOKEN_EXPIRED') >= 0); }
  function adminApi(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return api.apply(null, [name, state.token].concat(args)).catch(function (err) {
      if (isTokenExpired(err)) {
        expireAdmin();
        var e = new Error('expired');
        e.silent = true;
        throw e;
      }
      throw err;
    });
  }
  function logEvent(event, target) {
    try {
      callServer('logEvent', [event, target || '', deviceType()]).catch(function () {});
    } catch (e) { /* ไม่ให้กระทบการกด */ }
  }
  function friendlyError(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'ไม่มีสัญญาณอินเทอร์เน็ต กรุณาตรวจสอบแล้วลองใหม่';
    var msg = String((err && err.message) || err || '').replace(/^(Error|Exception):\s*/, '');
    if (/[฀-๿]/.test(msg)) return msg;
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }
  function handleError(err) {
    if (err && err.silent) return;
    if (window.console) console.error(err);
    toast(friendlyError(err), 'error', 4500);
  }

  // ===== toast =====
  function toast(msg, type, ms) {
    var root = $('toastRoot');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    var icon = type === 'success' ? 'check_circle' : (type === 'error' ? 'error' : 'info');
    el.innerHTML = mi(icon) + '<span></span>';
    el.lastChild.textContent = msg;
    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms || 2600);
  }

  // ===== ปุ่มมี loading + กันกดซ้ำ =====
  function runBusy(btn, fn) {
    if (btn && btn.getAttribute('data-busy') === '1') return Promise.resolve();
    if (btn) { btn.setAttribute('data-busy', '1'); btn.disabled = true; btn.classList.add('is-loading'); }
    function done() {
      if (btn) { btn.removeAttribute('data-busy'); btn.disabled = false; btn.classList.remove('is-loading'); }
    }
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (v) { done(); return v; }, function (err) { done(); handleError(err); });
  }

  // ===== modal =====
  var modalStack = [];
  function openModal(opts) {
    var ov = document.createElement('div');
    ov.className = 'ov';
    var box = document.createElement('div');
    box.className = 'modal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    var head = document.createElement('div');
    head.className = 'm-head';
    head.innerHTML = mi(opts.icon || 'info') + '<h3></h3>';
    head.querySelector('h3').textContent = opts.title || '';
    var body = document.createElement('div');
    body.className = 'm-body';
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    var handle = { el: ov, box: box, body: body, closable: opts.closable !== false };
    handle.close = function () {
      var i = modalStack.indexOf(handle);
      if (i >= 0) modalStack.splice(i, 1);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      if (!modalStack.length) document.body.classList.remove('no-scroll');
      if (opts.onClose) opts.onClose();
    };
    if (handle.closable) {
      var x = document.createElement('button');
      x.className = 'm-x';
      x.setAttribute('aria-label', 'ปิด');
      x.innerHTML = mi('close');
      x.addEventListener('click', handle.close);
      head.appendChild(x);
    }
    box.appendChild(head);
    box.appendChild(body);
    if (opts.actions && opts.actions.length) {
      var foot = document.createElement('div');
      foot.className = 'm-foot';
      opts.actions.forEach(function (a) {
        var b = document.createElement('button');
        b.className = 'btn ' + (a.cls || 'btn-outline');
        b.innerHTML = (a.icon ? mi(a.icon) : '') + '<span></span>';
        b.lastChild.textContent = a.label;
        b.addEventListener('click', function () {
          if (!a.onClick) return;
          runBusy(b, function () { return a.onClick(handle, b); });
        });
        if (a.primary) handle.primaryBtn = b;
        foot.appendChild(b);
      });
      box.appendChild(foot);
    }
    ov.appendChild(box);
    if (opts.overlayClose) ov.addEventListener('mousedown', function (e) { if (e.target === ov) handle.close(); });
    $('modalRoot').appendChild(ov);
    document.body.classList.add('no-scroll');
    modalStack.push(handle);
    if (opts.focus) { var f = body.querySelector(opts.focus); if (f) setTimeout(function () { f.focus(); }, 60); }
    return handle;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalStack.length) {
      var top = modalStack[modalStack.length - 1];
      if (top.closable) top.close();
    }
  });
  function confirmDialog(title, message, okLabel) {
    return new Promise(function (resolve) {
      var settled = false;
      var m = openModal({
        title: title, icon: 'warning',
        body: '<p class="pre"></p>',
        onClose: function () { if (!settled) { settled = true; resolve(false); } },
        actions: [
          { label: 'ยกเลิก', cls: 'btn-outline', onClick: function (h) { h.close(); } },
          { label: okLabel || 'ยืนยัน', icon: 'delete', cls: 'btn-danger', onClick: function (h) { settled = true; h.close(); resolve(true); } }
        ]
      });
      m.body.firstChild.textContent = message;
    });
  }

  // ===== ไอคอนไฟล์ =====
  function fileMeta(type) {
    var t = String(type || '').toLowerCase();
    if (t === 'pdf') return { icon: 'picture_as_pdf', color: '#D93025', label: 'PDF' };
    if (t === 'doc' || t === 'docx') return { icon: 'description', color: '#185FA5', label: 'Word' };
    if (t === 'xls' || t === 'xlsx' || t === 'csv') return { icon: 'table_chart', color: '#0F9D58', label: t === 'csv' ? 'CSV' : 'Excel' };
    if (t === 'ppt' || t === 'pptx') return { icon: 'slideshow', color: '#E8710A', label: 'PowerPoint' };
    if (t === 'zip') return { icon: 'folder_zip', color: '#5D4037', label: 'ZIP' };
    if (t === 'jpg' || t === 'jpeg' || t === 'png' || t === 'webp') return { icon: 'image', color: '#7B3FB5', label: 'รูปภาพ' };
    if (t === 'txt') return { icon: 'article', color: '#5B6F86', label: 'ข้อความ' };
    return { icon: 'link', color: '#00838F', label: 'ลิงค์' };
  }

  // ===== เปิดลิงค์ภายนอก =====
  function openExternal(url) {
    var u = safeUrl(url);
    if (!u) return false;
    var a = document.createElement('a');
    a.href = u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }
  function openSystem(id) {
    var s = findIn(state.data ? state.data.systems : [], id);
    if (!s) return;
    var u = safeUrl(s.url);
    if (!u) { toast('ยังไม่ได้ตั้งลิงค์ระบบนี้', 'info'); return; }
    logEvent('open_system', s.id);
    toast('กำลังเปิด ' + s.name + ' ...', 'info', 1800);
    openExternal(u);
  }
  function downloadDoc(id) {
    var d = findIn(state.data ? state.data.documents : [], id);
    if (!d) return;
    if (!safeUrl(d.url)) { toast('เอกสารนี้ยังไม่มีลิงค์ดาวน์โหลด', 'error'); return; }
    logEvent('download_doc', d.id);
    toast('กำลังดาวน์โหลด ' + d.name, 'success', 2200);
    openExternal(d.url);
  }
  function findIn(list, id) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ===== วาดหน้า =====
  function renderHeader() {
    var admin = isAdmin();
    $('keyIcon').textContent = admin ? 'admin_panel_settings' : 'vpn_key';
    $('keyBtn').classList.toggle('admin-on', admin);
    $('keyBtn').setAttribute('aria-label', admin ? 'โหมด admin' : 'เข้าโหมด admin');
  }

  function getReadMap() {
    try { return JSON.parse(lsGet(READ_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function unreadCount() {
    if (!state.data) return 0;
    var read = getReadMap();
    return state.data.notifications.filter(function (n) { return !read[n.id]; }).length;
  }
  function updateBadges() {
    var c = unreadCount();
    var txt = c > 9 ? '9+' : String(c);
    ['bellBadge', 'navBadge'].forEach(function (id) {
      var el = $(id);
      el.textContent = txt;
      el.hidden = c === 0;
    });
  }

  function renderTicker() {
    var list = (state.data && state.data.ticker) || [];
    var wrap = $('ticker');
    if (!list.length) { wrap.hidden = true; state.tickerSig = ''; return; }
    var text = list.join('     •     ');
    wrap.hidden = false;
    if (text === state.tickerSig) return;
    state.tickerSig = text;
    var run = $('tickerRun');
    run.textContent = text;
    run.style.animationDuration = Math.max(14, Math.round(text.length * 0.28)) + 's';
  }

  function renderBanners() {
    var list = (state.data && state.data.banners) || [];
    var wrap = $('bannerWrap');
    if (!list.length) { wrap.hidden = true; state.bannerSig = ''; stopBannerTimer(); return; }
    wrap.hidden = false;
    var sig = JSON.stringify(list);
    if (sig === state.bannerSig) return;
    state.bannerSig = sig;
    var html = '', dots = '';
    list.forEach(function (b, i) {
      var link = safeUrl(b.linkUrl);
      // พื้นการ์ดเป็นสีเหลืองตามดีไซน์กลาง (สีที่ admin เลือกยังเก็บไว้ในข้อมูล แต่ไม่ใช้วาดพื้น)
      var img = b.imageFileId ? '<img class="slide-img" src="' + driveImg(b.imageFileId) + '" alt="" width="800" height="300" loading="lazy" decoding="async">' : '';
      html += '<div class="slide' + (link ? ' link' : '') + (b.imageFileId ? ' has-img' : '') + '" data-act="banner-open" data-idx="' + i + '"' +
        (link ? ' role="button" tabindex="0"' : '') + '>' + img + '<div class="slide-txt"><div class="slide-t">' + esc(b.title) + '</div>' +
        (b.subtitle ? '<div class="slide-s">' + esc(b.subtitle) + '</div>' : '') + '</div></div>';
      dots += '<button class="dot-b' + (i === 0 ? ' on' : '') + '" data-act="banner-dot" data-idx="' + i + '" aria-label="แบนเนอร์ที่ ' + (i + 1) + '"></button>';
    });
    $('bannerTrack').innerHTML = html;
    $('bannerDots').innerHTML = list.length > 1 ? dots : '';
    state.bannerIdx = 0;
    $('bannerTrack').scrollLeft = 0;
    startBannerTimer();
  }
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function bannerGo(i) {
    var track = $('bannerTrack');
    track.scrollTo({ left: i * track.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  function updateBannerDots() {
    var track = $('bannerTrack');
    if (!track.clientWidth) return;
    var i = Math.round(track.scrollLeft / track.clientWidth);
    state.bannerIdx = i;
    var ds = $('bannerDots').children;
    for (var k = 0; k < ds.length; k++) ds[k].classList.toggle('on', k === i);
  }
  function startBannerTimer() {
    stopBannerTimer();
    var n = state.data ? state.data.banners.length : 0;
    if (n < 2 || reducedMotion()) return;     // ผู้ใช้ตั้งลดการเคลื่อนไหว → ไม่เลื่อนอัตโนมัติ
    state.bannerTimer = setInterval(function () {
      if (document.hidden || state.view !== 'home') return;
      var next = (state.bannerIdx + 1) % n;
      bannerGo(next);
    }, 5000);
  }
  function stopBannerTimer() {
    if (state.bannerTimer) { clearInterval(state.bannerTimer); state.bannerTimer = null; }
  }

  function renderGrid() {
    var grid = $('sysGrid');
    if (!state.data && state.configError) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1">' + mi('settings') + esc(state.configError) + '</div>';
      return;
    }
    if (!state.data) {
      var sk = '';
      for (var i = 0; i < 8; i++) sk += '<div class="skel-grid-item"><div class="skel skel-circle"></div><div class="skel skel-line"></div></div>';
      grid.innerHTML = sk;
      return;
    }
    var html = '';
    state.data.systems.forEach(function (s) {
      var hasLink = !!safeUrl(s.url);
      html += '<button class="sys-item' + (hasLink ? '' : ' nolink') + '" data-act="open-sys" data-id="' + esc(s.id) + '" title="' + esc(s.desc || s.name) + '">' +
        '<span class="sys-ico">' + mi(s.icon) + '</span><span class="sys-lbl">' + esc(s.name) + '</span>' +
        (hasLink ? '' : '<span class="sys-note">ยังไม่มีลิงค์</span>') + '</button>';
    });
    if (isAdmin()) {
      html += '<button class="sys-item sys-add" data-act="add-sys-home"><span class="sys-ico">' + mi('add') + '</span><span class="sys-lbl">เพิ่มระบบ</span></button>';
    }
    if (!html) {
      html = '<div class="empty" style="grid-column:1/-1">' + mi('apps') + 'ยังไม่มีระบบให้แสดง</div>';
    }
    grid.innerHTML = html;
  }

  function docRowHtml(d) {
    var m = fileMeta(d.fileType);
    return '<div class="row"><span class="lead" style="background:' + m.color + '">' + mi(m.icon) + '</span>' +
      '<div class="row-txt"><div class="row-t">' + esc(d.name) + '</div><div class="row-s">' + esc(m.label) + (d.createdAt ? ' · ' + esc(fmtDate(d.createdAt)) : '') + '</div></div>' +
      '<button class="dl-btn" data-act="dl-doc" data-id="' + esc(d.id) + '" aria-label="ดาวน์โหลด ' + esc(d.name) + '">' + mi('download') + '</button></div>';
  }
  function renderRecentDocs() {
    var box = $('recentDocs');
    if (!state.data) { box.innerHTML = state.configError ? '' : '<div class="skel" style="height:64px"></div>'; return; }
    // เอกสารล่าสุด 3 รายการ เรียงตามวันที่เพิ่ม (หน้าเอกสารทั้งหมดยังเรียงตาม sortOrder)
    var docs = state.data.documents.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }).slice(0, 3);
    if (!docs.length) { box.innerHTML = '<div class="empty">' + mi('folder_open') + 'ยังไม่มีเอกสาร</div>'; return; }
    box.innerHTML = '<div class="card-list">' + docs.map(docRowHtml).join('') + '</div>';
  }
  function renderVersion() {
    var v = state.data && state.data.version ? ' ' + state.data.version : '';
    $('verLine').textContent = 'รวมระบบงาน ป.' + v;
  }

  function renderHome() {
    renderTicker();
    renderBanners();
    renderGrid();
    renderRecentDocs();
    renderVersion();
  }

  function renderDocsView() {
    var q = $('docSearch').value.trim().toLowerCase();
    var box = $('docList');
    if (!state.data) { box.innerHTML = pendingBlock(); return; }
    var docs = state.data.documents.filter(function (d) { return !q || d.name.toLowerCase().indexOf(q) >= 0; });
    if (!docs.length) {
      box.innerHTML = '<div class="empty">' + mi('folder_open') + (q ? 'ไม่พบเอกสารที่ค้นหา' : 'ยังไม่มีเอกสาร') + '</div>';
      return;
    }
    box.innerHTML = '<div class="card-list">' + docs.map(docRowHtml).join('') + '</div>';
  }

  function renderSearchView() {
    var q = $('searchInput').value.trim().toLowerCase();
    var box = $('searchList');
    if (!state.data) { box.innerHTML = pendingBlock(); return; }
    var list = state.data.systems.filter(function (s) {
      if (!q) return true;
      return (s.name + ' ' + (s.desc || '') + ' ' + (s.category || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) { box.innerHTML = '<div class="empty">' + mi('search_off') + 'ไม่พบระบบที่ค้นหา</div>'; return; }
    box.innerHTML = '<div class="card-list">' + list.map(function (s) {
      var hasLink = !!safeUrl(s.url);
      return '<button class="row" data-act="open-sys" data-id="' + esc(s.id) + '"' + (hasLink ? '' : ' style="opacity:.55"') + '>' +
        '<span class="lead" style="background:' + safeColor(s.color) + '">' + mi(s.icon) + '</span>' +
        '<span class="row-txt"><span class="row-t">' + esc(s.name) + '</span><br><span class="row-s">' + esc(s.desc || s.category || '') + (hasLink ? '' : ' (ยังไม่ได้ตั้งลิงค์)') + '</span></span>' +
        mi('chevron_right') + '</button>';
    }).join('') + '</div>';
  }

  function renderNotifView() {
    var box = $('notifList');
    if (!state.data) { box.innerHTML = pendingBlock(); return; }
    var list = state.data.notifications;
    var read = getReadMap();
    if (!list.length) {
      box.innerHTML = '<div class="empty">' + mi('notifications_none') + 'ยังไม่มีแจ้งเตือน</div>';
    } else {
      box.innerHTML = list.map(function (n) {
        return '<article class="n-card"><div class="n-top">' + (read[n.id] ? '' : '<span class="dot" aria-label="ยังไม่อ่าน"></span>') +
          '<h3>' + esc(n.title) + '</h3></div>' + (n.detail ? '<p>' + esc(n.detail) + '</p>' : '') +
          '<time>' + esc(fmtDate(n.createdAt)) + '</time></article>';
      }).join('');
    }
    // เปิดหน้านี้แล้วถือว่าอ่านทั้งหมด
    var next = {};
    list.forEach(function (n) { next[n.id] = 1; });
    lsSet(READ_KEY, JSON.stringify(next));
    updateBadges();
  }

  function renderSettingsView() {
    var box = $('settingsBody');
    if (!isAdmin()) {
      box.innerHTML = '<div class="empty">' + mi('lock') + 'หน้านี้สำหรับ admin เท่านั้น<br><br><button class="btn btn-primary" data-act="key">' + mi('vpn_key') + '<span>ใส่รหัส PIN</span></button></div>';
      return;
    }
    box.innerHTML = '<div class="admin-bar"><span class="chip ok">' + mi('verified_user') + 'โหมด admin</span>' +
      '<button class="btn btn-outline" data-act="adm-logout">' + mi('logout') + '<span>ออกจากโหมด admin</span></button></div>' +
      '<div class="card-list">' + MENU.map(function (m) {
        return '<button class="menu-item" data-act="settings-item" data-key="' + m.key + '"><span class="lead">' + mi(m.icon) + '</span><span class="m-t">' + esc(m.title) + '</span>' + mi('chevron_right', 'chev') + '</button>';
      }).join('') + '</div>';
  }

  // ----- หน้าย่อย admin -----
  function loadingBlock() { return '<div class="loading-block"><div class="spinner"></div>กำลังโหลด...</div>'; }
  /** ระหว่างรอข้อมูล: ถ้ายังไม่ได้ตั้งค่า API_URL ให้บอกเป็นภาษาไทยแทนการหมุนค้าง */
  function pendingBlock() { return state.configError ? configErrorHtml() : loadingBlock(); }
  function configErrorHtml() { return '<div class="empty">' + mi('settings') + esc(state.configError) + '</div>'; }

  function addBtn(kind, label) {
    return '<button class="btn btn-primary btn-block add-wide" data-act="adm-add" data-kind="' + kind + '">' + mi('add') + '<span>' + esc(label) + '</span></button>';
  }

  function rowInfo(kind, it) {
    var o = { lead: '', title: '', sub: '', on: true, flagOn: 'ซ่อน', flagOff: 'แสดง', offTag: 'ซ่อนอยู่', edit: true, move: false };
    if (kind === 'systems') {
      o.lead = '<span class="lead" style="background:' + safeColor(it.color) + '">' + mi(it.icon) + '</span>';
      o.title = it.name; o.sub = (it.category ? it.category + ' · ' : '') + (it.url ? 'ตั้งลิงค์แล้ว' : 'ยังไม่ได้ตั้งลิงค์');
      o.on = it.visible; o.move = true;
    } else if (kind === 'banners') {
      o.lead = it.imageFileId ? '<span class="lead"><img src="' + driveImg(it.imageFileId) + '" alt="" width="44" height="44" loading="lazy" decoding="async"></span>' :
        '<span class="lead" style="background:' + safeColor(it.color) + '">' + mi('view_carousel') + '</span>';
      o.title = it.title; o.sub = it.subtitle || 'ไม่มีข้อความรอง'; o.on = it.visible; o.move = true;
    } else if (kind === 'announcements') {
      var isPopup = it.type === 'popup';
      o.lead = '<span class="lead" style="background:' + (isPopup ? '#7B3FB5' : '#E8710A') + '">' + mi(isPopup ? 'article' : 'campaign') + '</span>';
      o.title = isPopup ? (it.title || it.text) : it.text;
      o.sub = (isPopup ? 'popup' : 'ข้อความวิ่ง') + ' · ' + (it.startDate || it.endDate ? (it.startDate ? fmtDate(it.startDate + ' 00:00') .slice(0, -6) : 'ไม่กำหนดเริ่ม') + ' ถึง ' + (it.endDate ? fmtDate(it.endDate + ' 00:00').slice(0, -6) : 'ไม่กำหนดสิ้นสุด') : 'ไม่จำกัดวันที่');
      o.on = it.active; o.flagOn = 'ปิด'; o.flagOff = 'เปิด'; o.offTag = 'ปิดใช้งาน';
    } else if (kind === 'notifications') {
      o.lead = '<span class="lead" style="background:#185FA5">' + mi('notifications') + '</span>';
      o.title = it.title; o.sub = fmtDate(it.createdAt) + (it.detail ? ' · ' + it.detail.slice(0, 60) : ''); o.on = it.visible; o.edit = false;
    } else if (kind === 'documents') {
      var m = fileMeta(it.fileType);
      o.lead = '<span class="lead" style="background:' + m.color + '">' + mi(m.icon) + '</span>';
      o.title = it.name; o.sub = m.label + ' · ' + (it.fileId ? 'อัปโหลดไฟล์' : 'ลิงค์'); o.on = it.visible; o.move = true;
    }
    return o;
  }

  function listHtml(kind, items) {
    if (!items.length) return '<div class="empty">' + mi('inbox') + 'ยังไม่มีรายการ</div>';
    return items.map(function (it, idx) {
      var o = rowInfo(kind, it);
      var attrs = ' data-kind="' + kind + '" data-id="' + esc(it.id) + '"';
      var acts = '';
      if (o.edit) acts += '<button class="ab" data-act="adm-edit"' + attrs + '>' + mi('edit') + '<span>แก้ไข</span></button>';
      acts += '<button class="ab" data-act="adm-toggle"' + attrs + '>' + mi(o.on ? 'visibility_off' : 'visibility') + '<span>' + (o.on ? o.flagOn : o.flagOff) + '</span></button>';
      if (o.move) {
        acts += '<button class="ab" data-act="adm-up"' + attrs + (idx === 0 ? ' disabled' : '') + '>' + mi('arrow_upward') + '<span>ขึ้น</span></button>';
        acts += '<button class="ab" data-act="adm-down"' + attrs + (idx === items.length - 1 ? ' disabled' : '') + '>' + mi('arrow_downward') + '<span>ลง</span></button>';
      }
      acts += '<button class="ab del" data-act="adm-del"' + attrs + '>' + mi('delete') + '<span>ลบ</span></button>';
      return '<div class="adm-row"><div class="adm-main">' + o.lead + '<div class="row-txt"><div class="adm-name">' + esc(o.title) +
        (o.on ? '' : '<span class="tag-off">' + o.offTag + '</span>') + '</div><div class="adm-sub">' + esc(o.sub) + '</div></div></div><div class="adm-acts">' + acts + '</div></div>';
    }).join('');
  }

  function renderSub() {
    var body = $('subBody');
    var k = state.sub;
    if (k === 'stats') { renderStats(); return; }
    if (!state.admin) { body.innerHTML = loadingBlock(); return; }
    var a = state.admin, h = '';
    if (k === 'systems') h = addBtn('systems', 'เพิ่มระบบ') + listHtml('systems', a.systems);
    else if (k === 'banners') h = addBtn('banners', 'เพิ่มแบนเนอร์') + listHtml('banners', a.banners);
    else if (k === 'ann') h = addBtn('announcements', 'เพิ่มประกาศ') + listHtml('announcements', a.announcements);
    else if (k === 'docs') h = addBtn('documents', 'เพิ่มเอกสาร') + listHtml('documents', a.documents);
    else if (k === 'notif') {
      var oldT = $('nfTitle') ? $('nfTitle').value : '';
      var oldD = $('nfDetail') ? $('nfDetail').value : '';
      h = '<div class="form-card"><label class="fld"><span>หัวข้อแจ้งเตือน *</span><input class="inp" id="nfTitle" maxlength="80" placeholder="เช่น ปิดปรับปรุงระบบ"></label>' +
        '<label class="fld"><span>รายละเอียด</span><textarea class="inp" id="nfDetail" maxlength="1000" placeholder="พิมพ์รายละเอียด"></textarea></label>' +
        '<button class="btn btn-primary btn-block" data-act="send-notif">' + mi('send') + '<span>ส่งแจ้งเตือน</span></button></div>' +
        '<h3 class="sec-title">รายการที่ส่งแล้ว</h3>' + listHtml('notifications', a.notifications);
      body.innerHTML = h;
      $('nfTitle').value = oldT;
      $('nfDetail').value = oldD;
      return;
    }
    body.innerHTML = h;
  }

  function renderStats() {
    var body = $('subBody');
    var segs = [7, 30, 90].map(function (d) {
      return '<button class="' + (state.statsDays === d ? 'on' : '') + '" data-act="stats-range" data-days="' + d + '">' + d + ' วัน</button>';
    }).join('');
    var h = '<div class="seg">' + segs + '</div>';
    var s = state.statsData;
    if (state.statsError && !s) {
      h += '<div class="empty">' + mi('error_outline') + 'โหลดสถิติไม่สำเร็จ<br><br><button class="btn btn-primary" data-act="stats-reload">' + mi('refresh') + '<span>ลองใหม่</span></button></div>';
    } else if (!s) {
      h += loadingBlock();
    } else {
      h += '<div class="stat-cards">' +
        statCard(s.today, 'เข้าใช้วันนี้') + statCard(s.d7, 'เข้าใช้ 7 วัน') + statCard(s.d30, 'เข้าใช้ 30 วัน') + statCard(s.downloads30, 'ดาวน์โหลดเอกสาร 30 วัน') + '</div>';
      h += '<div class="form-card"><h3 class="sec-title" style="margin-top:0">ระบบที่เปิดมากสุด (' + s.days + ' วัน)</h3>' + barsHtml(s.topSystems) + '</div>';
      var total = s.mobile + s.desktop;
      var pm = total ? Math.round(s.mobile * 100 / total) : 0;
      var pd = total ? 100 - pm : 0;
      h += '<div class="form-card"><h3 class="sec-title" style="margin-top:0">สัดส่วนมือถือ / คอมพิวเตอร์ (' + s.days + ' วัน)</h3>' +
        (total ? '<div class="split"><i style="width:' + pm + '%;background:#1A4FA8"></i><i style="width:' + pd + '%;background:#E8710A"></i></div>' : '<div class="muted">ยังไม่มีข้อมูล</div>') +
        '<div class="legend"><span><span class="sw-dot" style="background:#1A4FA8"></span>มือถือ <b>' + pm + '%</b> (' + fmtNum(s.mobile) + ')</span>' +
        '<span><span class="sw-dot" style="background:#E8710A"></span>คอมพิวเตอร์ <b>' + pd + '%</b> (' + fmtNum(s.desktop) + ')</span></div></div>';
      h += '<div class="form-card"><h3 class="sec-title" style="margin-top:0">เอกสารที่โหลดมากสุด (' + s.days + ' วัน)</h3>' + barsHtml(s.topDocs) + '</div>';
      h += '<p class="hint">ระบบไม่เก็บชื่อผู้ใช้ และไม่เก็บ IP</p>';
    }
    body.innerHTML = h;
  }
  function statCard(n, label) {
    return '<div class="stat-card"><div class="stat-num">' + fmtNum(n) + '</div><div class="stat-lbl">' + esc(label) + '</div></div>';
  }
  function barsHtml(list) {
    if (!list || !list.length) return '<div class="muted">ยังไม่มีข้อมูลในช่วงนี้</div>';
    var max = list[0].count || 1;
    return list.map(function (it) {
      return '<div class="bar-row"><div class="bar-name">' + esc(it.name) + '</div><div class="bar-cnt">' + fmtNum(it.count) + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(3, Math.round(it.count * 100 / max)) + '%"></div></div></div>';
    }).join('');
  }

  function loadStats() {
    var seq = ++state.statsSeq;
    state.statsData = null;
    state.statsError = false;
    renderStats();
    return adminApi('getStats', state.statsDays).then(function (d) {
      if (seq !== state.statsSeq) return;
      state.statsData = d;
      renderStats();
    }).catch(function (err) {
      if (seq !== state.statsSeq) return;
      state.statsError = true;
      renderStats();
      handleError(err);
    });
  }

  function renderCurrent() {
    if (state.view === 'docs') renderDocsView();
    else if (state.view === 'search') renderSearchView();
    else if (state.view === 'notif') renderNotifView();
    else if (state.view === 'settings') renderSettingsView();
  }
  function renderAll() {
    renderHeader();
    renderHome();
    updateBadges();
    renderCurrent();
  }

  // ===== สลับหน้า =====
  function showView(name) {
    state.view = name;
    ['home', 'docs', 'search', 'notif', 'settings', 'sub'].forEach(function (v) {
      $('view-' + v).classList.toggle('active', v === name);
    });
    var navKey = name === 'sub' ? 'settings' : name;
    var btns = document.querySelectorAll('#bottomNav .nav-b');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-view') === navKey);
    window.scrollTo(0, 0);
    if (name === 'home') { renderHome(); startBannerTimer(); }
    if (name === 'docs') renderDocsView();
    if (name === 'search') renderSearchView();
    if (name === 'notif') { renderNotifView(); logEvent('view_notification', ''); }
    if (name === 'settings') renderSettingsView();
  }
  function gotoView(name) {
    if (name === 'settings' && !isAdmin()) {
      openPinModal(function () { showView('settings'); });
      return;
    }
    showView(name);
  }
  function showSub(key) {
    state.sub = key;
    $('subTitle').textContent = SUB_TITLES[key];
    showView('sub');
    if (key === 'stats') { loadStats(); return; }
    renderSub();
    adminApi('getAdminData').then(function (snap) { state.admin = snap; renderSub(); }).catch(handleError);
  }

  // ===== โหมด admin =====
  function openPinModal(afterLogin) {
    var m = openModal({
      title: 'เข้าโหมด admin', icon: 'lock', overlayClose: true, focus: '.pin-input',
      body: '<p class="muted" style="margin-bottom:12px">กรุณาใส่รหัส PIN เพื่อจัดการระบบ</p><input class="pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="12" aria-label="รหัส PIN">',
      actions: [
        { label: 'ยกเลิก', cls: 'btn-outline', onClick: function (h) { h.close(); } },
        {
          label: 'เข้าสู่โหมด admin', icon: 'login', cls: 'btn-primary', primary: true,
          onClick: function (h) {
            var pin = h.body.querySelector('.pin-input').value.trim();
            if (!pin) { toast('กรุณาใส่รหัส PIN', 'error'); return; }
            return api('verifyAdminPin', pin).then(function (r) {
              state.token = r.token;
              ssSet(TOKEN_KEY, r.token);
              h.close();
              renderAll();
              toast('เข้าสู่โหมด admin แล้ว', 'success');
              if (afterLogin) afterLogin();
            });
          }
        }
      ]
    });
    m.body.querySelector('.pin-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && m.primaryBtn) m.primaryBtn.click();
    });
  }
  function clearAdmin() {
    state.token = '';
    state.admin = null;
    ssDel(TOKEN_KEY);
  }
  function expireAdmin() {
    clearAdmin();
    while (modalStack.length) modalStack[modalStack.length - 1].close();
    renderAll();
    showView('home');
    toast('หมดเวลาเข้าใช้งาน กรุณาใส่รหัส PIN ใหม่', 'error', 4000);
    openPinModal(function () { showView('settings'); });
  }

  // ===== ข้อมูลสาธารณะ =====
  function loadData() {
    return api('getPublicData').then(function (d) {
      state.data = d;
      lsSet(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: d }));
      renderAll();
      maybeShowPopup();
    }).catch(function (err) {
      if (window.console) console.error(err);
      if (!state.data) {
        $('sysGrid').innerHTML = '<div class="empty" style="grid-column:1/-1">' + mi('cloud_off') + 'โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต<br><br>' +
          '<button class="btn btn-primary" data-act="retry-load">' + mi('refresh') + '<span>ลองใหม่</span></button></div>';
        $('recentDocs').innerHTML = '';
      } else {
        if (!state.offlineToastShown) { state.offlineToastShown = true; toast('เชื่อมต่อไม่ได้ กำลังแสดงข้อมูลล่าสุดที่บันทึกไว้', 'info', 3500); }
        maybeShowPopup();
      }
    });
  }
  function refreshPublic() {
    return api('getPublicData').then(function (d) {
      state.data = d;
      lsSet(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: d }));
      renderAll();
    }).catch(function () { /* เงียบ ไว้รอบหน้า */ });
  }

  function maybeShowPopup() {
    var p = state.data && state.data.popup;
    if (!p || state.popupShown) return;
    var key = 'rpt_popup_' + p.id + '_' + localDateKey();
    if (lsGet(key) === '1') { state.popupShown = true; return; }
    state.popupShown = true;
    var skip = false;
    var m = openModal({
      title: p.title || 'ประกาศ', icon: 'campaign', closable: false, overlayClose: true,
      body: '<div class="pre"></div><button class="popup-skip" type="button">' + mi('check_box_outline_blank') + '<span>ไม่ต้องแสดงอีกวันนี้</span></button>',
      actions: [{
        label: 'รับทราบ', icon: 'check', cls: 'btn-primary', primary: true,
        onClick: function (h) { if (skip) lsSet(key, '1'); h.close(); }
      }]
    });
    m.body.firstChild.textContent = p.text;
    var skipBtn = m.body.querySelector('.popup-skip');
    skipBtn.addEventListener('click', function () {
      skip = !skip;
      skipBtn.firstChild.textContent = skip ? 'check_box' : 'check_box_outline_blank';
    });
  }

  // ===== admin: ฟอร์ม =====
  function applySnapshot(snap) {
    state.admin = snap;
    renderSub();
    refreshPublic();
  }
  function fieldInput(label, name, opts) {
    opts = opts || {};
    return '<label class="fld"><span>' + esc(label) + '</span><input class="inp" name="' + name + '" type="' + (opts.type || 'text') + '"' +
      (opts.max ? ' maxlength="' + opts.max + '"' : '') + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') +
      (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') + (opts.list ? ' list="' + opts.list + '"' : '') + ' autocomplete="off"></label>';
  }
  function colorGridHtml() {
    return '<div class="color-grid">' + COLOR_CHOICES.map(function (c) {
      return '<button type="button" class="col-b" data-color="' + c + '" style="background:' + c + '" aria-label="สี ' + c + '">' + mi('check') + '</button>';
    }).join('') + '</div>';
  }
  function iconGridHtml() {
    return '<div class="icon-grid">' + ICON_CHOICES.map(function (ic) {
      return '<button type="button" class="ic-b" data-icon="' + ic + '" aria-label="ไอคอน ' + ic + '">' + mi(ic) + '</button>';
    }).join('') + '</div>';
  }
  function bindPicker(root, selector, attr, initial) {
    var cur = initial;
    var btns = root.querySelectorAll(selector);
    function paint() {
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('sel', btns[i].getAttribute(attr) === cur);
    }
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { cur = this.getAttribute(attr); paint(); });
    }
    paint();
    return function () { return cur; };
  }
  function setVal(root, name, v) { var el = root.querySelector('[name="' + name + '"]'); if (el) el.value = v == null ? '' : v; }
  function getVal(root, name) { var el = root.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : ''; }
  function getChk(root, name) { var el = root.querySelector('[name="' + name + '"]'); return !!(el && el.checked); }
  function needHttps(url, label) {
    if (url && !/^https:\/\/[^\s<>"']+$/i.test(url)) { toast(label + 'ต้องขึ้นต้นด้วย https:// และห้ามมีช่องว่าง', 'error', 4000); return false; }
    return true;
  }

  function openSystemForm(id) {
    var s = id && state.admin ? findIn(state.admin.systems, id) : null;
    var cats = {};
    ((state.admin && state.admin.systems) || (state.data && state.data.systems) || []).forEach(function (x) { if (x.category) cats[x.category] = 1; });
    var m = openModal({
      title: s ? 'แก้ไขระบบ' : 'เพิ่มระบบ', icon: 'apps', focus: '[name=name]',
      body: fieldInput('ชื่อระบบ *', 'name', { max: 60, ph: 'เช่น ระบบอาวุธปืน' }) +
        fieldInput('คำอธิบายสั้น', 'desc', { max: 120 }) +
        fieldInput('ลิงค์ระบบ (ขึ้นต้น https://)', 'url', { type: 'url', max: 2000, ph: 'https://', inputmode: 'url' }) +
        '<div class="fld"><span>เลือกไอคอน</span>' + iconGridHtml() + '</div>' +
        '<div class="fld"><span>เลือกสี</span>' + colorGridHtml() + '</div>' +
        fieldInput('หมวดหมู่', 'category', { max: 40, list: 'catList' }) +
        '<datalist id="catList">' + Object.keys(cats).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
        '<label class="sw-row"><input type="checkbox" name="visible" checked><span>แสดงบนหน้าหลัก</span></label>',
      actions: [
        { label: 'ยกเลิก', cls: 'btn-outline', onClick: function (h) { h.close(); } },
        {
          label: 'บันทึก', icon: 'save', cls: 'btn-primary',
          onClick: function (h) {
            var b = h.body;
            var name = getVal(b, 'name'), url = getVal(b, 'url');
            if (!name) { toast('กรุณากรอกชื่อระบบ', 'error'); return; }
            if (!needHttps(url, 'ลิงค์ระบบ')) return;
            return adminApi('saveSystem', {
              id: s ? s.id : '', name: name, desc: getVal(b, 'desc'), url: url, icon: pickIcon(), color: pickColor(),
              category: getVal(b, 'category'), visible: getChk(b, 'visible')
            }).then(function (snap) { applySnapshot(snap); toast('บันทึกระบบเรียบร้อย', 'success'); h.close(); });
          }
        }
      ]
    });
    var b = m.body;
    var pickIcon = bindPicker(b, '.ic-b', 'data-icon', s ? s.icon : ICON_CHOICES[0]);
    var pickColor = bindPicker(b, '.col-b', 'data-color', s ? safeColor(s.color) : COLOR_CHOICES[0]);
    if (s) {
      setVal(b, 'name', s.name); setVal(b, 'desc', s.desc); setVal(b, 'url', s.url); setVal(b, 'category', s.category);
      b.querySelector('[name=visible]').checked = !!s.visible;
    }
  }

  var SHARE_WARN_MSG = 'แชร์ไฟล์สาธารณะไม่ได้ ผู้ใช้ทั่วไปอาจเปิดไม่ได้';
  function shrinkImage(file) {
    return readFileDataUrl(file).then(function (url) { return shrinkLoaded(url); });
  }
  function readFileDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(new Error('เปิดรูปไม่ได้ กรุณาเลือกไฟล์รูป JPG หรือ PNG')); };
      fr.readAsDataURL(file);
    });
  }
  function shrinkLoaded(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var max = 800;
        var sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var cw = Math.max(1, Math.round(img.naturalWidth * sc)), ch = Math.max(1, Math.round(img.naturalHeight * sc));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var cx = cv.getContext('2d');
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, cw, ch);
        cx.drawImage(img, 0, 0, cw, ch);
        var dataUrl = cv.toDataURL('image/jpeg', 0.7);
        resolve({ dataUrl: dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = function () { reject(new Error('เปิดรูปไม่ได้ กรุณาเลือกไฟล์รูป JPG หรือ PNG')); };
      img.src = url;
    });
  }
  function readFileBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { var r = String(fr.result); resolve(r.substr(r.indexOf(',') + 1)); };
      fr.onerror = function () { reject(new Error('อ่านไฟล์ไม่สำเร็จ')); };
      fr.readAsDataURL(file);
    });
  }

  function openBannerForm(id) {
    var bn = id && state.admin ? findIn(state.admin.banners, id) : null;
    var newImage = null;       // {dataUrl, base64, mime}
    var removeImage = false;
    var m = openModal({
      title: bn ? 'แก้ไขแบนเนอร์' : 'เพิ่มแบนเนอร์', icon: 'view_carousel', focus: '[name=title]',
      body: fieldInput('หัวข้อ *', 'title', { max: 60 }) + fieldInput('ข้อความรอง', 'subtitle', { max: 120 }) +
        fieldInput('ลิงค์เมื่อแตะ (ไม่บังคับ)', 'linkUrl', { type: 'url', max: 2000, ph: 'https://', inputmode: 'url' }) +
        '<div class="fld"><span>สีพื้น</span>' + colorGridHtml() + '</div>' +
        '<div class="fld"><span>รูปภาพ (ไม่บังคับ)</span><div class="img-prev" id="imgPrev">' + mi('image') + '</div>' +
        '<div class="img-acts"><button type="button" class="btn btn-outline" data-pick="1">' + mi('upload') + '<span>เลือกรูป</span></button>' +
        '<button type="button" class="btn btn-outline" data-clear="1">' + mi('delete') + '<span>เอารูปออก</span></button></div>' +
        '<input type="file" accept="image/*" hidden name="imgFile"><div class="hint">ระบบจะย่อรูปให้อัตโนมัติ (ไม่เกิน 800 พิกเซล) ก่อนอัปโหลด</div></div>' +
        '<label class="sw-row"><input type="checkbox" name="visible" checked><span>แสดงบนหน้าหลัก</span></label>',
      actions: [
        { label: 'ยกเลิก', cls: 'btn-outline', onClick: function (h) { h.close(); } },
        {
          label: 'บันทึก', icon: 'save', cls: 'btn-primary',
          onClick: function (h) {
            var b = h.body;
            var title = getVal(b, 'title'), link = getVal(b, 'linkUrl');
            if (!title) { toast('กรุณากรอกหัวข้อแบนเนอร์', 'error'); return; }
            if (!needHttps(link, 'ลิงค์แบนเนอร์')) return;
            var step = Promise.resolve(removeImage ? '' : (bn ? bn.imageFileId : ''));
            var uploadedId = '';     // รหัสไฟล์ที่เพิ่งอัปโหลดในรอบนี้ (ใช้ยกเลิกถ้าบันทึกไม่สำเร็จ)
            if (newImage) {
              step = adminApi('uploadImage', newImage.base64, newImage.mime, 'banner').then(function (r) {
                uploadedId = r.fileId;
                if (r.shareWarning) toast(SHARE_WARN_MSG, 'error', 5000);
                return r.fileId;
              });
            }
            return step.then(function (fileId) {
              return adminApi('saveBanner', {
                id: bn ? bn.id : '', title: title, subtitle: getVal(b, 'subtitle'), linkUrl: link,
                color: pickColor(), imageFileId: fileId || '', visible: getChk(b, 'visible')
              });
            }).catch(function (err) {
              // บันทึกแบนเนอร์ไม่สำเร็จ → เก็บกวาดรูปที่อัปโหลดไปแล้วเบื้องหลัง
              if (uploadedId) api('discardUpload', state.token, uploadedId).catch(function () {});
              throw err;
            }).then(function (snap) { applySnapshot(snap); toast('บันทึกแบนเนอร์เรียบร้อย', 'success'); h.close(); });
          }
        }
      ]
    });
    var b = m.body;
    var pickColor = bindPicker(b, '.col-b', 'data-color', bn ? safeColor(bn.color) : COLOR_CHOICES[0]);
    var prev = b.querySelector('#imgPrev');
    var fileInput = b.querySelector('[name=imgFile]');
    function paintPrev() {
      var src = newImage ? newImage.dataUrl : (!removeImage && bn && bn.imageFileId ? driveImg(bn.imageFileId) : '');
      if (src) { prev.style.backgroundImage = "url('" + src + "')"; prev.innerHTML = ''; }
      else { prev.style.backgroundImage = ''; prev.innerHTML = mi('image'); }
    }
    if (bn) {
      setVal(b, 'title', bn.title); setVal(b, 'subtitle', bn.subtitle); setVal(b, 'linkUrl', bn.linkUrl);
      b.querySelector('[name=visible]').checked = !!bn.visible;
    }
    paintPrev();
    b.querySelector('[data-pick]').addEventListener('click', function () { fileInput.click(); });
    b.querySelector('[data-clear]').addEventListener('click', function () { newImage = null; removeImage = true; fileInput.value = ''; paintPrev(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      shrinkImage(f).then(function (r) { newImage = r; removeImage = false; paintPrev(); toast('ย่อรูปเรียบร้อย', 'success', 1500); }).catch(handleError);
    });
  }

  function openAnnouncementForm(id) {
    var a = id && state.admin ? findIn(state.admin.announcements, id) : null;
    var type = a ? a.type : 'ticker';
    function textMax() { return type === 'popup' ? 1000 : 300; }
    var m = openModal({
      title: a ? 'แก้ไขประกาศ' : 'เพิ่มประกาศ', icon: 'campaign',
      body: '<div class="fld"><span>ชนิดประกาศ</span><div class="seg" style="margin-bottom:0"><button type="button" data-type="ticker">' + 'ข้อความวิ่ง' + '</button><button type="button" data-type="popup">popup</button></div></div>' +
        '<div data-wrap="title">' + fieldInput('หัวข้อ popup *', 'title', { max: 80 }) + '</div>' +
        '<label class="fld"><span>ข้อความ *</span><textarea class="inp" name="text" maxlength="300"></textarea><div class="fld-count" id="annCount"></div></label>' +
        fieldInput('วันเริ่มแสดง (ไม่บังคับ)', 'startDate', { type: 'date' }) + fieldInput('วันสิ้นสุด (ไม่บังคับ)', 'endDate', { type: 'date' }) +
        '<label class="sw-row"><input type="checkbox" name="active" checked><span>เปิดใช้งาน</span></label>',
      actions: [
        { label: 'ยกเลิก', cls: 'btn-outline', onClick: function (h) { h.close(); } },
        {
          label: 'บันทึก', icon: 'save', cls: 'btn-primary',
          onClick: function (h) {
            var b = h.body;
            var text = getVal(b, 'text'), title = getVal(b, 'title');
            if (type === 'popup' && !title) { toast('กรุณากรอกหัวข้อ popup', 'error'); return; }
            if (!text) { toast('กรุณากรอกข้อความ', 'error'); return; }
            if (text.length > textMax()) { toast('ข้อความยาวเกิน ' + textMax() + ' ตัวอักษร กรุณาตัดให้สั้นลง', 'error', 4000); return; }
            var sd = getVal(b, 'startDate'), ed = getVal(b, 'endDate');
            if (sd && ed && ed < sd) { toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 'error'); return; }
            return adminApi('saveAnnouncement', {
              id: a ? a.id : '', type: type, title: type === 'popup' ? title : '', text: text, startDate: sd, endDate: ed, active: getChk(b, 'active')
            }).then(function (snap) { applySnapshot(snap); toast('บันทึกประกาศเรียบร้อย', 'success'); h.close(); });
          }
        }
      ]
    });
    var b = m.body;
    var segBtns = b.querySelectorAll('[data-type]');
    var textEl = b.querySelector('[name=text]');
    var countEl = b.querySelector('#annCount');
    function paintCount() { countEl.textContent = textEl.value.length + ' / ' + textMax() + ' ตัวอักษร'; }
    textEl.addEventListener('input', paintCount);
    function paintType() {
      for (var i = 0; i < segBtns.length; i++) segBtns[i].classList.toggle('on', segBtns[i].getAttribute('data-type') === type);
      b.querySelector('[data-wrap=title]').hidden = type !== 'popup';
      textEl.maxLength = textMax();        // ข้อความวิ่ง 300 / popup 1000 ตามที่ server อนุญาต
      paintCount();
    }
    for (var i = 0; i < segBtns.length; i++) segBtns[i].addEventListener('click', function () { type = this.getAttribute('data-type'); paintType(); });
    if (a) {
      setVal(b, 'title', a.title); setVal(b, 'text', a.text); setVal(b, 'startDate', a.startDate); setVal(b, 'endDate', a.endDate);
      b.querySelector('[name=active]').checked = !!a.active;
    }
    paintType();
  }

  function openDocumentForm(id) {
    var d = id && state.admin ? findIn(state.admin.documents, id) : null;
    var mode = 'upload';
    var picked = null;
    var editLink = d && !d.fileId;
    var modeHtml = d ? '' : '<div class="fld"><span>วิธีเพิ่มเอกสาร</span><div class="seg" style="margin-bottom:0"><button type="button" data-mode="upload">' +
      'อัปโหลดไฟล์</button><button type="button" data-mode="link">วางลิงค์</button></div></div>';
    var m = openModal({
      title: d ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสาร', icon: 'folder_open',
      body: modeHtml + fieldInput('ชื่อเอกสาร *', 'name', { max: 100 }) +
        '<div data-wrap="upload"' + (d ? ' hidden' : '') + '><div class="fld"><span>ไฟล์ (ไม่เกิน 8MB)</span><button type="button" class="btn btn-outline btn-block" data-pick="1">' + mi('upload_file') + '<span>เลือกไฟล์</span></button>' +
        '<input type="file" hidden name="docFile" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.jpg,.jpeg,.png,.webp"><div class="hint" id="docPicked">ยังไม่ได้เลือกไฟล์</div></div></div>' +
        '<div data-wrap="link"' + (d && !editLink ? ' hidden' : (d ? '' : ' hidden')) + '>' + fieldInput('ลิงค์เอกสาร (Google Drive หรือ URL ขึ้นต้น https://)', 'url', { type: 'url', max: 2000, ph: 'https://', inputmode: 'url' }) + '</div>' +
        '<label class="sw-row"><input type="checkbox" name="visible" checked><span>แสดงให้ผู้ใช้เห็น</span></label>',
      actions: [
        { label: 'ยกเลิก', cls: 'btn-outline', onClick: function (h) { h.close(); } },
        {
          label: 'บันทึก', icon: 'save', cls: 'btn-primary',
          onClick: function (h) {
            var b = h.body;
            var name = getVal(b, 'name');
            if (!name) { toast('กรุณากรอกชื่อเอกสาร', 'error'); return; }
            var payload = { id: d ? d.id : '', name: name, visible: getChk(b, 'visible') };
            var step = Promise.resolve();
            if (d) {
              if (editLink) {
                var u = getVal(b, 'url');
                if (!u) { toast('กรุณาวางลิงค์เอกสาร', 'error'); return; }
                if (!needHttps(u, 'ลิงค์เอกสาร')) return;
                payload.url = u;
              }
            } else if (mode === 'upload') {
              if (!picked) { toast('กรุณาเลือกไฟล์ก่อน', 'error'); return; }
              if (picked.size > 8 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 8MB กรุณาเลือกไฟล์ที่เล็กกว่า', 'error', 4000); return; }
              toast('กำลังอัปโหลดไฟล์ อาจใช้เวลาสักครู่...', 'info', 3000);
              payload.fileName = picked.name;
              if (/^image\/(jpeg|png|webp)$/.test(picked.type)) {
                // เป็นรูป → ย่อก่อนส่ง (สูงสุด 800px, quality 0.7) ผลลัพธ์เป็น JPEG จึงเปลี่ยนนามสกุลเป็น .jpg
                step = shrinkImage(picked).then(function (r) {
                  payload.base64 = r.base64;
                  payload.fileName = picked.name.replace(/\.[A-Za-z0-9]+$/, '') + '.jpg';
                });
              } else {
                step = readFileBase64(picked).then(function (b64) { payload.base64 = b64; });
              }
            } else {
              var link = getVal(b, 'url');
              if (!link) { toast('กรุณาวางลิงค์เอกสาร', 'error'); return; }
              if (!needHttps(link, 'ลิงค์เอกสาร')) return;
              payload.url = link;
            }
            return step.then(function () { return adminApi('saveDocument', payload); })
              .then(function (snap) {
                applySnapshot(snap); toast('บันทึกเอกสารเรียบร้อย', 'success'); h.close();
                if (snap && snap.shareWarning) toast(SHARE_WARN_MSG, 'error', 5000);
              });
          }
        }
      ]
    });
    var b = m.body;
    var fileInput = b.querySelector('[name=docFile]');
    function paintMode() {
      if (d) return;
      var segBtns = b.querySelectorAll('[data-mode]');
      for (var i = 0; i < segBtns.length; i++) segBtns[i].classList.toggle('on', segBtns[i].getAttribute('data-mode') === mode);
      b.querySelector('[data-wrap=upload]').hidden = mode !== 'upload';
      b.querySelector('[data-wrap=link]').hidden = mode !== 'link';
    }
    var modeBtns = b.querySelectorAll('[data-mode]');
    for (var i = 0; i < modeBtns.length; i++) modeBtns[i].addEventListener('click', function () { mode = this.getAttribute('data-mode'); paintMode(); });
    b.querySelector('[data-pick]').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      picked = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      b.querySelector('#docPicked').textContent = picked ? picked.name + ' (' + (picked.size / 1048576).toFixed(2) + ' MB)' : 'ยังไม่ได้เลือกไฟล์';
      if (picked && !getVal(b, 'name')) setVal(b, 'name', picked.name.replace(/\.[^.]+$/, ''));
    });
    if (d) {
      setVal(b, 'name', d.name);
      b.querySelector('[name=visible]').checked = !!d.visible;
      if (editLink) {
        var cur = findIn(state.data ? state.data.documents : [], d.id);
        setVal(b, 'url', d.url || (cur ? cur.url : ''));
      }
    }
    paintMode();
  }

  var FORM_OPENERS = { systems: openSystemForm, banners: openBannerForm, announcements: openAnnouncementForm, documents: openDocumentForm };

  // ===== ตัวจัดการคลิกทั้งหมด (event delegation) =====
  var ACTIONS = {
    'nav': function (el) { gotoView(el.getAttribute('data-view')); },
    'bell': function () { gotoView('notif'); },
    'key': function () {
      if (isAdmin()) showView('settings');
      else openPinModal(function () { showView('settings'); });
    },
    'back': function () { showView('settings'); },
    'docs-all': function () { showView('docs'); },
    'open-sys': function (el) { openSystem(el.getAttribute('data-id')); },
    'dl-doc': function (el) {
      runBusy(el, function () {
        downloadDoc(el.getAttribute('data-id'));
        return new Promise(function (r) { setTimeout(r, 700); });
      });
    },
    'banner-open': function (el) {
      var b = state.data && state.data.banners[+el.getAttribute('data-idx')];
      if (b && safeUrl(b.linkUrl)) { toast('กำลังเปิดลิงค์ ...', 'info', 1500); openExternal(b.linkUrl); }
    },
    'banner-dot': function (el) { bannerGo(+el.getAttribute('data-idx')); startBannerTimer(); },
    'retry-load': function (el) { runBusy(el, loadData); },
    'add-sys-home': function () { openSystemForm(''); },
    'settings-item': function (el) { showSub(el.getAttribute('data-key')); },
    'adm-logout': function () {
      clearAdmin();
      renderAll();
      showView('home');
      toast('ออกจากโหมด admin แล้ว', 'success');
    },
    'adm-add': function (el) { FORM_OPENERS[el.getAttribute('data-kind')](''); },
    'adm-edit': function (el) { FORM_OPENERS[el.getAttribute('data-kind')](el.getAttribute('data-id')); },
    'adm-toggle': function (el) {
      var kind = el.getAttribute('data-kind'), id = el.getAttribute('data-id');
      runBusy(el, function () {
        return adminApi('toggleVisible', kind, id).then(function (snap) { applySnapshot(snap); toast('บันทึกเรียบร้อย', 'success', 1500); });
      });
    },
    'adm-up': function (el) { moveRow(el, 'up'); },
    'adm-down': function (el) { moveRow(el, 'down'); },
    'adm-del': function (el) {
      var kind = el.getAttribute('data-kind'), id = el.getAttribute('data-id');
      var it = findIn(state.admin ? state.admin[kind] : [], id);
      var o = it ? rowInfo(kind, it) : { title: 'รายการนี้' };
      var extra = (kind === 'banners' || kind === 'documents') ? '\nไฟล์ที่เกี่ยวข้องจะถูกย้ายไปถังขยะใน Drive' : '';
      confirmDialog('ยืนยันการลบ', 'ต้องการลบ "' + o.title + '" ใช่ไหม?\nลบแล้วจะไม่แสดงในระบบอีก' + extra, 'ลบ').then(function (ok) {
        if (!ok) return;
        runBusy(el, function () {
          return adminApi(DELETE_FN[kind], id).then(function (snap) { applySnapshot(snap); toast('ลบเรียบร้อย', 'success'); });
        });
      });
    },
    'send-notif': function (el) {
      var t = $('nfTitle').value.trim(), d = $('nfDetail').value.trim();
      if (!t) { toast('กรุณากรอกหัวข้อแจ้งเตือน', 'error'); return; }
      runBusy(el, function () {
        return adminApi('saveNotification', { title: t, detail: d }).then(function (snap) {
          $('nfTitle').value = ''; $('nfDetail').value = '';
          applySnapshot(snap);
          toast('ส่งแจ้งเตือนเรียบร้อย', 'success');
        });
      });
    },
    'stats-range': function (el) { state.statsDays = +el.getAttribute('data-days'); loadStats(); },
    'stats-reload': function () { loadStats(); }
  };
  function moveRow(el, dir) {
    var kind = el.getAttribute('data-kind'), id = el.getAttribute('data-id');
    runBusy(el, function () {
      return adminApi('moveItem', kind, id, dir).then(function (snap) { applySnapshot(snap); toast('เรียงลำดับเรียบร้อย', 'success', 1500); });
    });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    var fn = ACTIONS[el.getAttribute('data-act')];
    if (fn) fn(el, e);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList && e.target.classList.contains('slide')) {
      e.preventDefault();
      ACTIONS['banner-open'](e.target);
    }
  });

  // ===== ไอคอน SVG สำรอง (ใช้เมื่อฟอนต์ Material Icons โหลดไม่ได้ เช่น เครือข่ายบล็อก Google Fonts) =====
  // รูปแบบเส้นขอบ 24x24 เขียนเองทั้งหมด ไม่ใช้ emoji
  var SVG_PATHS = {
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    verified_user: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
    target: 'M12 5a7 7 0 100 14 7 7 0 000-14zM12 10a2 2 0 100 4 2 2 0 000-4zM12 2v3M12 19v3M2 12h3M19 12h3',
    car: 'M4 16v-4l2-5h12l2 5v4zM4 12h16M7 19v-3M17 19v-3',
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    cloud: 'M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.7-1A4.5 4.5 0 0117 18zM8 21l1-2M12 21l1-2M16 21l1-2',
    cloud_off: 'M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.7-1A4.5 4.5 0 0117 18zM4 4l16 16',
    person: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c0-4.5 3.5-7 8-7s8 2.5 8 7',
    person_search: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-6 7-6M18 13a3 3 0 100 6 3 3 0 000-6zM20.2 18.2L22 20',
    smoking: 'M3 15h13v4H3zM19 15v4M22 15v4M19 12c0-2 2-2 2-4',
    download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
    upload: 'M12 17V5M7 9l5-5 5 5M5 20h14',
    search: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L21 21',
    search_off: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L21 21M5 3l16 16',
    bell: 'M6 17v-6a6 6 0 0112 0v6l2 2H4zM10 21h4',
    settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
    add: 'M12 5v14M5 12h14',
    logout: 'M10 4H5v16h5M16 8l4 4-4 4M20 12H9',
    login: 'M14 4h5v16h-5M8 8l-4 4 4 4M4 12h11',
    key: 'M8 15a4 4 0 110-8 4 4 0 010 8zM11 11h10M18 11v4M21 11v3',
    folder: 'M3 6h6l2 2h10v11H3z',
    close: 'M6 6l12 12M18 6L6 18',
    chevron_right: 'M9 5l7 7-7 7',
    arrow_back: 'M20 12H5M11 6l-6 6 6 6',
    arrow_upward: 'M12 20V5M6 11l6-6 6 6',
    arrow_downward: 'M12 4v15M6 13l6 6 6-6',
    check: 'M5 12l5 5 9-10',
    edit: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
    delete: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
    refresh: 'M20 11a8 8 0 10-2 6M20 4v7h-7',
    visibility: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
    visibility_off: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6zM4 4l16 16',
    lock: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3',
    send: 'M3 12L21 4l-7 17-3-7z',
    save: 'M5 4h12l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 8.5v.5',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5',
    warning: 'M12 3l10 18H2zM12 10v5M12 18v.5',
    campaign: 'M4 10v4h3l8 4V6L7 10zM18 9a4 4 0 010 6',
    doc: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3',
    apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    carousel: 'M3 6h4v12H3zM9 5h6v14H9zM17 6h4v12h-4z',
    chart: 'M5 20V10M12 20V4M19 20v-7',
    inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
    box_empty: 'M4 4h16v16H4z',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
    map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
    pin: 'M12 21s-7-6.5-7-11a7 7 0 0114 0c0 4.5-7 11-7 11zM12 8a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
    calendar: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
    people: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.5 2.5-5.5 6-5.5s6 2 6 5.5M16 6a3 3 0 010 5M17 15c2.5.5 4 2.3 4 5',
    gavel: 'M5 21h9M8 17l8-8M12 5l7 7M10 7l5-4 6 6-4 5z',
    circle: 'M12 4a8 8 0 100 16 8 8 0 000-16z'
  };
  // ชื่อไอคอนของฟอนต์ -> ชื่อรูปใน SVG_PATHS (ตัวที่ไม่อยู่ในรายการใช้รูปวงกลมแทน)
  var SVG_ALIAS = {
    gps_fixed: 'target', directions_car: 'car', traffic: 'car', fire_truck: 'car',
    home_work: 'home', flood: 'cloud', smoking_rooms: 'smoking', file_download: 'download', upload_file: 'upload',
    notifications: 'bell', notifications_none: 'bell', notifications_active: 'bell', vpn_key: 'key', admin_panel_settings: 'key',
    folder_open: 'folder', folder_shared: 'folder', folder_zip: 'folder', error_outline: 'info', report: 'warning',
    emergency: 'warning', medical_services: 'warning', local_fire_department: 'warning',
    local_police: 'shield', security: 'shield', policy: 'shield', badge: 'person', fingerprint: 'person',
    description: 'doc', article: 'doc', assignment: 'doc', picture_as_pdf: 'doc', table_chart: 'doc', slideshow: 'doc',
    inventory_2: 'inbox', view_carousel: 'carousel', insights: 'chart', bar_chart: 'chart', check_box_outline_blank: 'box_empty',
    location_on: 'pin', calendar_month: 'calendar', groups: 'people'
  };
  // สร้างรหัส SVG ของไอคอนตามชื่อ (ใช้ได้กับทุกชื่อที่ผ่าน safeIcon)
  function iconSvg(name) {
    // ใช้ hasOwnProperty เท่านั้น กันชื่อพิเศษ เช่น constructor / __proto__
    var own = Object.prototype.hasOwnProperty;
    var key = own.call(SVG_PATHS, name) ? name : (own.call(SVG_ALIAS, name) ? SVG_ALIAS[name] : 'circle');
    var d = own.call(SVG_PATHS, key) ? SVG_PATHS[key] : SVG_PATHS.circle;
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  }
  // แปลงทุก .mi ที่ยังเป็นตัวอักษรให้เป็น SVG
  function convertIconsToSvg() {
    var list = document.querySelectorAll('.mi');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.firstElementChild && el.firstElementChild.tagName.toLowerCase() === 'svg') continue;
      var name = (el.textContent || '').trim();
      if (!name) continue;
      el.innerHTML = iconSvg(name);
    }
  }
  var svgObserver = null;
  function enableIconFallback() {
    var root = document.documentElement;
    root.classList.remove('icons-ready');
    root.classList.add('icons-fallback');
    convertIconsToSvg();
    // หน้าจอถูกวาดใหม่บ่อย (modal / รายการ) จึงคอยแปลงไอคอนที่เพิ่มใหม่ตลอด
    if (!svgObserver && window.MutationObserver) {
      var busy = false;
      svgObserver = new MutationObserver(function () {
        if (busy) return;
        busy = true;
        Promise.resolve().then(function () { try { convertIconsToSvg(); } finally { busy = false; } });
      });
      svgObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  // ===== ฟอนต์ไอคอน: โหลดเสร็จค่อยแสดง; ถ้าไม่ขึ้นใน 3 วินาทีใช้ SVG สำรองแทน =====
  function watchIconFont() {
    var root = document.documentElement;
    var settled = false;
    var ready = function () { if (settled) return; settled = true; root.classList.add('icons-ready'); };
    var fallback = function () { if (settled) return; settled = true; enableIconFallback(); };
    try {
      if (document.fonts && document.fonts.load) {
        document.fonts.load('24px "Material Icons"', 'home').then(function (faces) {
          // ไม่มีฟอนต์ที่โหลดได้เลย (ถูกบล็อก) -> ใช้ SVG ทันที
          if (faces && faces.length) ready(); else fallback();
        }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
    setTimeout(fallback, 3000);   // เกิน 3 วินาทียังไม่พร้อม ใช้ SVG สำรอง
  }

  // ===== เริ่มทำงาน =====
  function boot() {
    watchIconFont();
    state.token = ssGet(TOKEN_KEY) || '';
    var track = $('bannerTrack');
    var scrollTimer = null;
    track.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(updateBannerDots, 60);
    });
    track.addEventListener('pointerdown', function () { startBannerTimer(); });
    $('searchInput').addEventListener('input', debounce(renderSearchView, 250));
    $('docSearch').addEventListener('input', debounce(renderDocsView, 250));

    // แสดงข้อมูลจาก cache (localStorage) ทันที แล้วโหลดใหม่เบื้องหลังเพียงครั้งเดียวตอนเปิดแอป
    // (การสลับหน้ากลับมาหน้าแรกไม่ยิง getPublicData ซ้ำ จึงไม่ต้องมี throttle เพิ่ม)
    var cached = null;
    try { cached = JSON.parse(lsGet(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
    if (cached && cached.data && cached.data.systems) state.data = cached.data;
    state.configError = readApiConfig().error;
    renderAll();
    if (state.configError && !state.data) return;     // ยังไม่ตั้งค่า API_URL แสดงข้อความไทยแทน ไม่เรียกหลังบ้าน
    logEvent('open_app', '');
    loadData();
  }
  boot();
})();
