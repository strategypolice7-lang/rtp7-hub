/**
 * รวมระบบงาน ป. (ตำรวจภูธรภาค 7) - Code.gs  (หลังบ้านแบบ JSON API)
 * หน้าเว็บอยู่ที่ GitHub Pages ส่วนไฟล์นี้ทำหน้าที่เป็น API: doGet = ตรวจสถานะ, doPost = เรียกคำสั่ง
 * จัดการโดย admin (PIN เก็บใน Script Properties คีย์ ADMIN_PIN เท่านั้น ห้ามเขียนลงในโค้ด)
 *
 * วิธีเริ่มใช้: ตั้ง Script Property ADMIN_PIN แล้วเปิดไฟล์นี้ใน Apps Script Editor
 * กดเรียกใช้ setupDatabase() หนึ่งครั้ง (หรือเรียก API ครั้งแรก ระบบจะสร้างฐานข้อมูลให้อัตโนมัติ)
 */

const CONFIG = {
  VERSION: 'v2.1 (8 พ.ย. 69)',
  APP_NAME: 'รวมระบบงาน ป.',
  SS_ID: '',                               // ค่าใน ScriptProperties คีย์ SS_ID ชนะค่านี้เสมอ
  DB_NAME: 'รวมระบบงาน ป. - ฐานข้อมูล',
  FOLDER_NAME: 'รวมระบบงาน ป. - ไฟล์',
  TIMEZONE: 'Asia/Bangkok',
  CACHE_SECONDS: 60,                       // แคชข้อมูลสาธารณะ 60 วินาที
  TOKEN_SECONDS: 21600,                    // token admin อยู่ได้ 6 ชั่วโมง
  MAX_DOC_BYTES: 8 * 1024 * 1024,          // เอกสารอัปโหลดสูงสุด 8MB
  MAX_IMAGE_BYTES: 3 * 1024 * 1024,        // รูปแบนเนอร์ (หลังย่อฝั่ง client)
  MAX_LOG_ROWS: 150000,                    // เกินนี้ย้ายบันทึกเก่าไปแท็บ Logs_Archive (ไม่ลบทิ้ง)
  LOG_TRIM_ROWS: 10000,                    // จำนวนแถวเก่าสุดที่ย้ายต่อรอบ
  LOG_ARCHIVE_TAB: 'Logs_Archive',
  PIN_FAIL_LIMIT: 10,                      // ใส่ PIN ผิดเกินกี่ครั้งใน 10 นาทีถึงจะล็อกชั่วคราว
  LOG_MAX_PER_MIN: 120,                    // logEvent รับได้รวมทั้งระบบไม่เกินกี่ครั้งต่อนาที (กันถูกยิงรัว)
  MAX_BODY_CHARS: 12 * 1024 * 1024,        // ขนาดคำขอสูงสุด ~12MB (อัปโหลด base64 ไม่เกิน 8MB)
  MAX_ARGS: 10                             // จำนวนพารามิเตอร์ต่อคำสั่งสูงสุด
};

const CACHE_KEY_PUBLIC = 'PUBLIC_DATA_V1';

// โครงสร้างแท็บในชีต (ชื่อหัวตารางเป็นภาษาอังกฤษสั้นๆ สำหรับระบบ)
const SCHEMA = {
  systems:       { tab: 'Systems',       headers: ['id', 'name', 'desc', 'url', 'icon', 'color', 'category', 'visible', 'sortOrder'] },
  banners:       { tab: 'Banners',       headers: ['id', 'title', 'subtitle', 'linkUrl', 'color', 'imageFileId', 'visible', 'sortOrder'] },
  announcements: { tab: 'Announcements', headers: ['id', 'type', 'title', 'text', 'startDate', 'endDate', 'active', 'createdAt'] },
  notifications: { tab: 'Notifications', headers: ['id', 'title', 'detail', 'createdAt', 'visible'] },
  documents:     { tab: 'Documents',     headers: ['id', 'name', 'fileId', 'url', 'fileType', 'visible', 'sortOrder', 'createdAt'] },
  logs:          { tab: 'Logs',          headers: ['timestamp', 'event', 'target', 'device'] },
  settings:      { tab: 'Settings',      headers: ['key', 'value'] }
};

// ฟิลด์ที่ใช้เป็นสวิตช์ เปิด/ปิด ของแต่ละตาราง
const FLAG_FIELD = { systems: 'visible', banners: 'visible', documents: 'visible', notifications: 'visible', announcements: 'active' };
// ตารางที่เรียงลำดับได้
const MOVABLE_KEYS = ['systems', 'banners', 'documents'];

// ระบบเริ่มต้น 7 ระบบ (url เว้นว่างให้ admin ตั้งเอง)
const SEED_SYSTEMS = [
  ['ระบบอาวุธปืน', 'ทะเบียนและตรวจสอบอาวุธปืน', 'gps_fixed', '#D93025', 'กฎหมายอาวุธ'],
  ['จุดตรวจ ว.43', 'รายงานผลจุดตรวจ ว.43', 'directions_car', '#185FA5', 'จุดตรวจ'],
  ['ปิดล้อมตรวจค้น', 'รายงานการปิดล้อมตรวจค้น', 'home_work', '#7B3FB5', 'ปฏิบัติการ'],
  ['สาธารณภัย', 'รายงานสถานการณ์สาธารณภัย', 'flood', '#00838F', 'สาธารณภัย'],
  ['บุคคลพ้นโทษ', 'ติดตามบุคคลพ้นโทษ', 'person_search', '#E8710A', 'ติดตามบุคคล'],
  ['ป้องกันปราบปราม', 'รายงานงานป้องกันปราบปราม', 'shield', '#0F9D58', 'ป้องกันปราบปราม'],
  ['บุหรี่ไฟฟ้า/แก๊สหัวเราะ', 'รายงานการปราบปรามบุหรี่ไฟฟ้าและแก๊สหัวเราะ', 'smoking_rooms', '#C2185B', 'ปราบปราม']
];

// ---------------------------------------------------------------
// จุดเข้า API (doGet = ตรวจสถานะ, doPost = เรียกคำสั่ง)
// ---------------------------------------------------------------

/** ตอบ JSON ทุกครั้ง (Date ถูกแปลงเป็นข้อความเหมือนที่เก็บในชีต) */
function jsonOut_(obj) {
  const text = JSON.stringify(obj, function (key, value) {
    const raw = this[key];                               // value ของ Date ถูก toJSON ไปแล้ว จึงต้องดูค่าดิบ
    if (Object.prototype.toString.call(raw) === '[object Date]') return cellText_(raw);
    return value;
  });
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** ตรวจสถานะระบบ (ping) — ไม่แตะฐานข้อมูล ไม่เสิร์ฟ HTML */
function doGet(e) {
  return jsonOut_({ ok: true, app: CONFIG.APP_NAME, version: CONFIG.VERSION });
}

/**
 * ตาราง whitelist ของคำสั่งที่เรียกได้ (ห้ามเรียกฟังก์ชันด้วยชื่อตรงๆ / eval)
 *   fn    = ฟังก์ชันที่จะเรียก
 *   admin = true → ต้องมี token admin เป็นพารามิเตอร์ตัวแรก (dispatch ตรวจก่อน และฟังก์ชันตรวจซ้ำภายในอีกชั้น)
 *   args  = จำนวนพารามิเตอร์สูงสุดที่รับ (ตรงกับ signature ของฟังก์ชัน)
 * ตัวสร้างเป็น Object.create(null) กันชื่ออย่าง __proto__ / constructor / toString
 */
const API_ACTIONS = (function () {
  const t = Object.create(null);
  t.getPublicData       = { fn: getPublicData,       admin: false, args: 0 };
  t.logEvent            = { fn: logEvent,            admin: false, args: 3 };
  t.verifyAdminPin      = { fn: verifyAdminPin,      admin: false, args: 1 };
  t.getAdminData        = { fn: getAdminData,        admin: true,  args: 1 };
  t.getStats            = { fn: getStats,            admin: true,  args: 2 };
  t.saveSystem          = { fn: saveSystem,          admin: true,  args: 2 };
  t.deleteSystem        = { fn: deleteSystem,        admin: true,  args: 2 };
  t.saveBanner          = { fn: saveBanner,          admin: true,  args: 2 };
  t.deleteBanner        = { fn: deleteBanner,        admin: true,  args: 2 };
  t.saveAnnouncement    = { fn: saveAnnouncement,    admin: true,  args: 2 };
  t.deleteAnnouncement  = { fn: deleteAnnouncement,  admin: true,  args: 2 };
  t.saveNotification    = { fn: saveNotification,    admin: true,  args: 2 };
  t.deleteNotification  = { fn: deleteNotification,  admin: true,  args: 2 };
  t.saveDocument        = { fn: saveDocument,        admin: true,  args: 2 };
  t.deleteDocument      = { fn: deleteDocument,      admin: true,  args: 2 };
  t.toggleVisible       = { fn: toggleVisible,       admin: true,  args: 3 };
  t.moveItem            = { fn: moveItem,            admin: true,  args: 4 };
  t.uploadImage         = { fn: uploadImage,         admin: true,  args: 4 };
  t.discardUpload       = { fn: discardUpload,       admin: true,  args: 2 };
  return t;
})();

/** ข้อความผิดพลาดที่ส่งให้หน้าเว็บ */
const MSG_SYSTEM_ERROR = 'เกิดข้อผิดพลาดของระบบ ลองใหม่อีกครั้ง';

/** สร้าง Error ที่ตั้งใจให้ผู้ใช้เห็นข้อความ (ติดธง isUser) — error อื่นทุกชนิดจะถูกแทนด้วยข้อความกลาง */
function userError_(message) {
  const e = new Error(message);
  e.isUser = true;
  return e;
}

/** ส่งต่อข้อความได้เฉพาะ error ที่สร้างจาก userError_ (isUser === true) ส่วนที่เหลือเป็นความผิดพลาดภายใน */
function isUserMessage_(err) {
  if (!err || err.isUser !== true) return false;
  const msg = String(err.message || '');
  if (!msg || msg.length > 300) return false;
  if (/[A-Za-z0-9_-]{25,}/.test(msg)) return false;      // กันหลุด: ข้อความที่มีรหัสยาวๆ (เช่น ID ไฟล์/ชีต) ไม่ส่งออก
  return true;
}

/** แปลง error เป็น payload ที่ปลอดภัย (ไม่ส่ง stack / ข้อความภายในออกไป) */
function errorPayload_(err) {
  const msg = String((err && err.message) || err || '');
  if (isUserMessage_(err)) return { ok: false, message: msg };
  Logger.log('ข้อผิดพลาดภายใน: ' + msg + (err && err.stack ? '\n' + err.stack : ''));
  return { ok: false, message: MSG_SYSTEM_ERROR };
}

/** อ่านและตรวจคำขอ {action, args} — ผิดรูปแบบโยน Error ภาษาไทย */
function parseRequest_(e) {
  const contents = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (!contents) throw userError_('ไม่พบข้อมูลคำขอ');
  const size = Math.max(contents.length, Number(e.postData.length) || 0);
  if (size > CONFIG.MAX_BODY_CHARS) throw userError_('ข้อมูลที่ส่งมาใหญ่เกินกำหนด');
  let req;
  try {
    req = JSON.parse(contents);
  } catch (err) {
    throw userError_('รูปแบบคำขอไม่ถูกต้อง');
  }
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw userError_('รูปแบบคำขอไม่ถูกต้อง');
  if (typeof req.action !== 'string' || !req.action || req.action.length > 64) throw userError_('ไม่รู้จักคำสั่ง');
  const args = req.args === undefined ? [] : req.args;
  if (!Array.isArray(args)) throw userError_('รูปแบบพารามิเตอร์ไม่ถูกต้อง');
  if (args.length > CONFIG.MAX_ARGS) throw userError_('พารามิเตอร์มากเกินกำหนด');
  return { action: req.action, args: args };
}

/** รับคำสั่งจากหน้าเว็บ: body = {action, args} ตอบ {ok:true,data} หรือ {ok:false,message} */
function doPost(e) {
  try {
    const req = parseRequest_(e);
    if (!Object.prototype.hasOwnProperty.call(API_ACTIONS, req.action)) throw userError_('ไม่รู้จักคำสั่ง');
    const entry = API_ACTIONS[req.action];
    if (req.args.length > entry.args) throw userError_('จำนวนพารามิเตอร์ไม่ถูกต้อง');
    try {
      ensureDatabase_();
    } catch (err) {
      Logger.log('สร้างฐานข้อมูลอัตโนมัติไม่สำเร็จ: ' + err);
    }
    if (entry.admin) requireAdmin_(req.args[0]);          // ชั้นที่ 1: ตรวจ token ก่อนเข้าฟังก์ชัน
    const data = entry.fn.apply(null, req.args);          // ชั้นที่ 2: ฟังก์ชัน admin ตรวจ token ซ้ำภายในเอง
    return jsonOut_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    return jsonOut_(errorPayload_(err));
  }
}

// ---------------------------------------------------------------
// ฐานข้อมูล (Spreadsheet + โฟลเดอร์ Drive)
// ---------------------------------------------------------------

/** รหัสชีต: ค่าใน property ชนะค่าใน CONFIG */
function getSsId_() {
  return PropertiesService.getScriptProperties().getProperty('SS_ID') || CONFIG.SS_ID || '';
}

var SS_CACHE_ = null;
/** เปิดสเปรดชีตฐานข้อมูล (จำไว้ในรอบการทำงานเดียวกัน) */
function getSs_() {
  if (SS_CACHE_) return SS_CACHE_;
  const id = getSsId_();
  if (!id) throw userError_('ยังไม่ได้สร้างฐานข้อมูล กรุณารัน setupDatabase');
  try {
    SS_CACHE_ = SpreadsheetApp.openById(id);
  } catch (err) {
    throw userError_('เปิดฐานข้อมูลไม่ได้ กรุณาตรวจสอบสิทธิ์หรือรหัสชีต');
  }
  return SS_CACHE_;
}

function getSheet_(key) {
  const def = SCHEMA[key];
  const sh = getSs_().getSheetByName(def.tab);
  if (!sh) throw userError_('ไม่พบแท็บ ' + def.tab + ' กรุณารัน setupDatabase');
  return sh;
}

/** ให้แน่ใจว่ามีฐานข้อมูลแล้ว ถ้ายังไม่มีให้สร้าง (กันชนด้วย LockService) */
function ensureDatabase_() {
  const props = PropertiesService.getScriptProperties();
  if (getSsId_() && props.getProperty('FOLDER_ID')) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (getSsId_() && props.getProperty('FOLDER_ID')) return;
    setupDatabase_();
  } finally {
    lock.releaseLock();
  }
}

/** กดเรียกใช้จาก Editor ได้ — สร้างฐานข้อมูลและโฟลเดอร์ (ทำซ้ำได้ ไม่ทับข้อมูลเดิม) */
function setupDatabase() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return setupDatabase_();
  } finally {
    lock.releaseLock();
  }
}

/** ลบคอลัมน์ที่เกินจำนวนที่ใช้จริง (คืนจำนวนที่ลบ) */
function trimExtraColumns_(sh, cols) {
  const extra = sh.getMaxColumns() - cols;
  if (extra > 0) sh.deleteColumns(cols + 1, extra);
  return Math.max(extra, 0);
}

/** กดเรียกใช้จาก Editor ได้ — ลบคอลัมน์ส่วนเกินของทุกแท็บในฐานข้อมูลที่สร้างไปแล้ว */
function trimDatabaseColumns() {
  const ss = getSs_();
  const targets = Object.keys(SCHEMA).map(function (key) {
    return { tab: SCHEMA[key].tab, cols: SCHEMA[key].headers.length };
  });
  targets.push({ tab: CONFIG.LOG_ARCHIVE_TAB, cols: SCHEMA.logs.headers.length });
  targets.forEach(function (t) {
    try {
      const sh = ss.getSheetByName(t.tab);
      if (!sh) {
        Logger.log('แท็บ ' + t.tab + ': ไม่พบ ข้าม');
        return;
      }
      const removed = trimExtraColumns_(sh, t.cols);
      Logger.log('แท็บ ' + t.tab + ': ลบ ' + removed + ' คอลัมน์ (เหลือ ' + sh.getMaxColumns() + ')');
    } catch (err) {
      Logger.log('แท็บ ' + t.tab + ': ไม่สำเร็จ ' + err);
    }
  });
}

function setupDatabase_() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  let created = false;
  const existingId = getSsId_();

  if (existingId) {
    try {
      ss = SpreadsheetApp.openById(existingId);
    } catch (err) {
      throw userError_('เปิดฐานข้อมูลเดิมไม่ได้ (' + existingId + ') กรุณาตรวจสอบสิทธิ์');
    }
  } else {
    ss = SpreadsheetApp.create(CONFIG.DB_NAME);
    ss.setSpreadsheetLocale('th');                 // ตั้งภาษาไทยทันทีที่สร้างไฟล์ใหม่
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
    props.setProperty('SS_ID', ss.getId());
    created = true;
  }
  SS_CACHE_ = ss;

  const defaultSheet = created ? ss.getSheets()[0] : null;
  const newTabs = [];
  Object.keys(SCHEMA).forEach(function (key, index) {
    const def = SCHEMA[key];
    let sh = ss.getSheetByName(def.tab);
    if (sh) return;
    if (defaultSheet && index === 0) {
      sh = defaultSheet;
      sh.setName(def.tab);
    } else {
      sh = ss.insertSheet(def.tab);
    }
    const n = def.headers.length;
    // เก็บทุกเซลล์เป็นข้อความล้วน กันสูตร/วันที่ถูกแปลงเอง
    sh.getRange(1, 1, sh.getMaxRows(), n).setNumberFormat('@');
    sh.getRange(1, 1, 1, n).setValues([def.headers])
      .setBackground('#185FA5').setFontColor('#FFFFFF').setFontWeight('bold');
    sh.setFrozenRows(1);
    trimExtraColumns_(sh, n);                      // ลบคอลัมน์ส่วนเกิน ประหยัดโควตา 10 ล้านเซลล์
    newTabs.push(key);
  });

  // ใส่ข้อมูลเริ่มต้นเฉพาะแท็บที่เพิ่งสร้าง
  if (newTabs.indexOf('systems') >= 0) {
    const rows = SEED_SYSTEMS.map(function (s, i) {
      return writeValuesFor_('systems', {
        id: Utilities.getUuid().slice(0, 8), name: s[0], desc: s[1], url: '', icon: s[2],
        color: s[3], category: s[4], visible: true, sortOrder: i + 1
      });
    });
    const shSys = getSheet_('systems');
    shSys.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  if (newTabs.indexOf('settings') >= 0) {
    const shSet = getSheet_('settings');
    shSet.getRange(2, 1, 2, 2).setValues([['schemaVersion', '1'], ['createdAt', nowText_()]]);
  }

  // โฟลเดอร์เก็บไฟล์
  let folder = null;
  const folderId = props.getProperty('FOLDER_ID');
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); } catch (err) { folder = null; }
  }
  if (!folder) {
    folder = DriveApp.createFolder(CONFIG.FOLDER_NAME);
    props.setProperty('FOLDER_ID', folder.getId());
  }

  Logger.log('=== ตั้งค่าฐานข้อมูล "' + CONFIG.APP_NAME + '" เรียบร้อย ===');
  Logger.log(created ? 'สร้างสเปรดชีตใหม่แล้ว' : 'ใช้สเปรดชีตเดิม');
  Logger.log('แท็บที่เพิ่งสร้าง: ' + (newTabs.length ? newTabs.join(', ') : '(ไม่มี ครบอยู่แล้ว)'));
  Logger.log('ลิงค์ชีต: ' + ss.getUrl());
  Logger.log('โฟลเดอร์ไฟล์: ' + folder.getUrl());
  return { spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), folderId: folder.getId(), newTabs: newTabs };
}

// ---------------------------------------------------------------
// ตัวช่วยอ่าน/เขียนชีต (แบบ batch)
// ---------------------------------------------------------------

function nowText_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function todayText_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/** วันที่ย้อนหลัง n วัน (รูปแบบ yyyy-MM-dd เขตเวลาไทย) */
function dayText_(daysAgo) {
  return Utilities.formatDate(new Date(Date.now() - daysAgo * 86400000), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  return String(v);
}

function toBool_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

/** ข้อความที่ขึ้นต้นด้วย = + - @ (อาจถูกตีเป็นสูตร) ให้เติม ' นำหน้า ตอนอ่านกลับจะตัดออกหนึ่งตัว */
var FORMULA_LEAD_ = /^'*[=+\-@]/;
var FORMULA_ESCAPED_ = /^'+[=+\-@]/;

function serialize_(v) {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && FORMULA_LEAD_.test(v)) return "'" + v;   // เฉพาะข้อความ ตัวเลข/วันที่ไม่โดน
  return String(v);
}

/** ตัด ' ที่ระบบเติมไว้ออก (คู่กับ serialize_) */
function unescapeCell_(t) {
  return FORMULA_ESCAPED_.test(t) ? t.slice(1) : t;
}

/** แปลง object เป็นแถวค่าตามลำดับหัวตาราง */
function writeValuesFor_(key, obj) {
  return SCHEMA[key].headers.map(function (h) { return serialize_(obj[h]); });
}

/** อ่านทั้งตารางครั้งเดียว คืนเป็น array ของ object (มี _row = เลขแถวในชีต) */
function readTable_(key) {
  const def = SCHEMA[key];
  const sh = getSheet_(key);
  if (sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const head = values[0].map(cellText_);
  const idx = def.headers.map(function (h) { return head.indexOf(h); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const o = { _row: i + 1 };
    for (let j = 0; j < def.headers.length; j++) {
      o[def.headers[j]] = idx[j] >= 0 ? unescapeCell_(cellText_(values[i][idx[j]])) : '';
    }
    if (!o[def.headers[0]]) continue;
    if (o.visible !== undefined) o.visible = toBool_(o.visible);
    if (o.active !== undefined) o.active = toBool_(o.active);
    if (o.sortOrder !== undefined) o.sortOrder = Number(o.sortOrder) || 0;
    if (o.startDate) o.startDate = o.startDate.slice(0, 10);
    if (o.endDate) o.endDate = o.endDate.slice(0, 10);
    rows.push(o);
  }
  return rows;
}

function writeRow_(key, rowNumber, obj) {
  const sh = getSheet_(key);
  const n = SCHEMA[key].headers.length;
  const range = sh.getRange(rowNumber, 1, 1, n);
  range.setNumberFormat('@');
  range.setValues([writeValuesFor_(key, obj)]);
}

function appendRow_(key, obj) {
  const sh = getSheet_(key);
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  writeRow_(key, row, obj);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function newId_(rows) {
  let id;
  do {
    id = Utilities.getUuid().slice(0, 8);
  } while (rows.some(function (r) { return r.id === id; }));
  return id;
}

function clearCache_() {
  try { CacheService.getScriptCache().remove(CACHE_KEY_PUBLIC); } catch (err) { /* ไม่เป็นไร */ }
}

function nextSortOrder_(rows) {
  let max = 0;
  rows.forEach(function (r) { if (r.sortOrder > max) max = r.sortOrder; });
  return max + 1;
}

function bySort_(a, b) {
  return (a.sortOrder - b.sortOrder) || (a._row - b._row);
}

function byCreatedDesc_(a, b) {
  return a.createdAt < b.createdAt ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
}

/** เพิ่มหรือแก้ไขแถว: buildFn(existing, rows) คืน object ใหม่ที่จะเขียน */
function upsert_(key, id, buildFn) {
  return withLock_(function () {
    const rows = readTable_(key);
    let existing = null;
    if (id) {
      existing = rows.filter(function (r) { return r.id === id; })[0] || null;
      if (!existing) throw userError_('ไม่พบรายการที่จะแก้ไข (อาจถูกลบไปแล้ว)');
    }
    const obj = buildFn(existing, rows);
    if (existing) {
      obj.id = existing.id;
      writeRow_(key, existing._row, obj);
    } else {
      obj.id = newId_(rows);
      appendRow_(key, obj);
    }
    clearCache_();
    return obj;
  });
}

/** ลบแถวตาม id คืนข้อมูลที่ถูกลบ */
function removeRow_(key, id) {
  return withLock_(function () {
    const rows = readTable_(key);
    const target = rows.filter(function (r) { return r.id === id; })[0];
    if (!target) throw userError_('ไม่พบรายการที่จะลบ (อาจถูกลบไปแล้ว)');
    getSheet_(key).deleteRow(target._row);
    clearCache_();
    return target;
  });
}

// ---------------------------------------------------------------
// ตรวจสอบข้อมูลที่รับเข้ามา
// ---------------------------------------------------------------

function cleanText_(v, max, label, required) {
  const s = (v === null || v === undefined) ? '' :
    String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (required && !s) throw userError_('กรุณากรอก' + label);
  if (s.length > max) throw userError_(label + 'ยาวเกินไป (ไม่เกิน ' + max + ' ตัวอักษร)');
  return s;
}

function cleanUrl_(v, label, required) {
  const s = cleanText_(v, 2000, label, required);
  if (!s) return '';
  if (!/^https:\/\/[^\s<>"']+$/i.test(s)) throw userError_(label + 'ต้องขึ้นต้นด้วย https:// และห้ามมีช่องว่าง');
  return s;
}

function cleanColor_(v) {
  const s = String(v || '');
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#185FA5';
}

function cleanIcon_(v) {
  const s = String(v || '');
  return /^[a-z0-9_]{1,40}$/.test(s) ? s : 'apps';
}

function cleanDate_(v, label) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw userError_(label + 'ไม่ถูกต้อง');
  return s;
}

function cleanFileId_(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(s)) throw userError_('รหัสไฟล์ไม่ถูกต้อง');
  return s;
}

function cleanId_(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^[A-Za-z0-9-]{1,40}$/.test(s)) throw userError_('รหัสรายการไม่ถูกต้อง');
  return s;
}

// ---------------------------------------------------------------
// API สาธารณะ (ผู้ใช้ทั่วไป)
// ---------------------------------------------------------------

/** ข้อมูลหน้าแรกทั้งหมด (เฉพาะที่แสดงได้) — แคช 60 วินาที */
function getPublicData() {
  ensureDatabase_();
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY_PUBLIC);
  if (hit) {
    try { return JSON.parse(hit); } catch (err) { /* อ่านใหม่ */ }
  }
  const data = buildPublicData_();
  try { cache.put(CACHE_KEY_PUBLIC, JSON.stringify(data), CONFIG.CACHE_SECONDS); } catch (err) { /* ข้อมูลใหญ่เกิน ข้ามแคช */ }
  return data;
}

function docDownloadUrl_(d) {
  return d.fileId ? 'https://drive.google.com/uc?export=download&id=' + d.fileId : d.url;
}

function isInRange_(a, today) {
  return (!a.startDate || a.startDate <= today) && (!a.endDate || a.endDate >= today);
}

function buildPublicData_() {
  const today = todayText_();

  const systems = readTable_('systems').filter(function (r) { return r.visible; }).sort(bySort_)
    .map(function (r) {
      return { id: r.id, name: r.name, desc: r.desc, url: r.url, icon: r.icon, color: r.color, category: r.category };
    });

  const banners = readTable_('banners').filter(function (r) { return r.visible; }).sort(bySort_)
    .map(function (r) {
      return { id: r.id, title: r.title, subtitle: r.subtitle, linkUrl: r.linkUrl, color: r.color, imageFileId: r.imageFileId };
    });

  const live = readTable_('announcements').filter(function (a) { return a.active && isInRange_(a, today); });
  const ticker = live.filter(function (a) { return a.type === 'ticker'; })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; })
    .map(function (a) { return a.text; });
  const popups = live.filter(function (a) { return a.type === 'popup'; }).sort(byCreatedDesc_);
  const popup = popups.length ? { id: popups[0].id, title: popups[0].title, text: popups[0].text } : null;

  const notifications = readTable_('notifications').filter(function (n) { return n.visible; })
    .sort(byCreatedDesc_).slice(0, 30)
    .map(function (n) { return { id: n.id, title: n.title, detail: n.detail, createdAt: n.createdAt }; });

  const documents = readTable_('documents').filter(function (d) { return d.visible; }).sort(bySort_)
    .map(function (d) {
      return { id: d.id, name: d.name, fileType: d.fileType, url: docDownloadUrl_(d), createdAt: d.createdAt };
    });

  return {
    version: CONFIG.VERSION,
    appName: CONFIG.APP_NAME,
    systems: systems,
    banners: banners,
    ticker: ticker,
    popup: popup,
    notifications: notifications,
    documents: documents
  };
}

/** บันทึกการใช้งาน (ไม่เก็บชื่อผู้ใช้/IP) event = open_app | open_system | download_doc | view_notification */
function logEvent(event, target, device) {
  const allowed = ['open_app', 'open_system', 'download_doc', 'view_notification'];
  if (allowed.indexOf(event) < 0) return false;
  const dev = device === 'desktop' ? 'desktop' : 'mobile';
  const tgt = String(target || '').replace(/[^\w\-฀-๿ .]/g, '').slice(0, 60);
  if (!allowLogRate_()) return false;                    // endpoint นี้ไม่ต้อง login จึงจำกัดจำนวนครั้งต่อนาที
  const sh = getSheet_('logs');
  sh.appendRow([nowText_(), event, tgt, dev]);           // เขียนครั้งเดียวต่อการเรียก ไม่ต้องล็อก
  if (sh.getLastRow() > CONFIG.MAX_LOG_ROWS) archiveOldLogs_(sh);   // ย้ายเฉพาะตอนเกินเกณฑ์
  return true;
}

/**
 * นับจำนวน logEvent รวมทั้งระบบต่อ "นาที" ด้วย CacheService (ไม่ล็อก ยอมคลาดเคลื่อนเล็กน้อยได้)
 * คืน true = ยังไม่เกินเกณฑ์ให้เขียนได้, false = เกินแล้วให้ข้าม
 */
function allowLogRate_() {
  try {
    const cache = CacheService.getScriptCache();
    const key = 'LOG_RATE_' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMddHHmm');
    const count = Number(cache.get(key) || 0);
    if (count >= CONFIG.LOG_MAX_PER_MIN) return false;
    cache.put(key, String(count + 1), 120);
    return true;
  } catch (err) {
    return true;                                         // แคชมีปัญหาไม่ควรทำให้บันทึกการใช้งานหยุด
  }
}

/** ย้ายบันทึกเก่าสุดไปแท็บ Logs_Archive (ไม่ลบทิ้ง) — ล็อกเฉพาะขั้นตอนนี้ */
function archiveOldLogs_(sh) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;                       // คนอื่นกำลังย้ายอยู่ ข้ามไป รอบหน้าค่อยทำ
  try {
    if (sh.getLastRow() <= CONFIG.MAX_LOG_ROWS) return;  // เช็กซ้ำหลังได้ล็อก
    const n = CONFIG.LOG_TRIM_ROWS;
    const cols = SCHEMA.logs.headers.length;
    const ss = getSs_();
    let arch = ss.getSheetByName(CONFIG.LOG_ARCHIVE_TAB);
    if (!arch) {
      arch = ss.insertSheet(CONFIG.LOG_ARCHIVE_TAB);
      arch.getRange(1, 1, arch.getMaxRows(), cols).setNumberFormat('@');
      arch.getRange(1, 1, 1, cols).setValues([SCHEMA.logs.headers])
        .setBackground('#185FA5').setFontColor('#FFFFFF').setFontWeight('bold');
      arch.setFrozenRows(1);
      if (arch.getMaxColumns() > cols) arch.deleteColumns(cols + 1, arch.getMaxColumns() - cols);
    }
    const values = sh.getRange(2, 1, n, cols).getValues();   // อ่านครั้งเดียว
    const start = Math.max(arch.getLastRow(), 1) + 1;
    const need = start + n - 1;
    if (need > arch.getMaxRows()) arch.insertRowsAfter(arch.getMaxRows(), need - arch.getMaxRows());
    const dest = arch.getRange(start, 1, n, cols);
    dest.setNumberFormat('@');
    dest.setValues(values);                                  // เขียนครั้งเดียว
    sh.deleteRows(2, n);                                     // ลบจากชีตหลักหลังคัดลอกสำเร็จเท่านั้น
  } catch (err) {
    Logger.log('ย้ายบันทึกเก่าไม่สำเร็จ: ' + err);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// Admin: ยืนยันตัวตนด้วย PIN
// ---------------------------------------------------------------

/** อ่าน PIN จาก Script Properties เท่านั้น (ไม่มีค่าเริ่มต้นในโค้ด) ถ้ายังไม่ตั้งคืนข้อความว่าง */
function getAdminPin_() {
  return String(PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '');
}

/** เทียบข้อความแบบ constant-time: วนเทียบทุกตัวอักษรเสมอ ไม่หยุดทันทีที่ต่าง */
function safeEqual_(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** ตรวจ PIN ถ้าถูกคืน token (อายุ 6 ชั่วโมง) — ล็อกทั้งขั้นตอน กันยิงพร้อมกันแล้วตัวนับผิดไม่เพิ่ม */
function verifyAdminPin(pin) {
  const adminPin = getAdminPin_();
  if (!adminPin) throw userError_('ยังไม่ได้ตั้งรหัส admin ใน Script Properties');   // ล็อกไว้ ไม่เปิดโล่ง
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    Logger.log('verifyAdminPin รอล็อกไม่ได้: ' + err);
    throw userError_('ระบบกำลังไม่ว่าง กรุณารอสักครู่แล้วลองใหม่');
  }
  try {
    const cache = CacheService.getScriptCache();
    const fails = Number(cache.get('PIN_FAILS') || 0);
    if (fails >= CONFIG.PIN_FAIL_LIMIT) {
      throw userError_('ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่');
    }
    Utilities.sleep(500);                                // หน่วงเล็กน้อย กันเดา PIN
    if (!safeEqual_(String(pin || '').slice(0, 200), adminPin)) {   // ตัดความยาว กันส่ง PIN ยาวผิดปกติมาให้วนเทียบนาน
      cache.put('PIN_FAILS', String(fails + 1), 600);
      throw userError_('รหัส PIN ไม่ถูกต้อง');
    }
    cache.remove('PIN_FAILS');                           // ใส่ถูกแล้ว ล้างตัวนับผิด
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('ADMIN_' + token, '1', CONFIG.TOKEN_SECONDS);
    return { token: token };
  } finally {
    lock.releaseLock();                                  // ปล่อยล็อกเสมอ แม้เกิด error
  }
}

/** ตรวจ token ที่ server ทุกครั้งที่เรียกฟังก์ชัน admin */
function requireAdmin_(token) {
  if (!token || typeof token !== 'string' || token.length > 100 ||
      !CacheService.getScriptCache().get('ADMIN_' + token)) {
    throw userError_('TOKEN_EXPIRED');
  }
}

function stripRow_(o) {
  const c = {};
  Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; });
  return c;
}

/** ข้อมูลทุกรายการ (รวมที่ซ่อน) สำหรับหน้าจัดการ */
function adminSnapshot_() {
  return {
    systems: readTable_('systems').sort(bySort_).map(stripRow_),
    banners: readTable_('banners').sort(bySort_).map(stripRow_),
    announcements: readTable_('announcements').sort(byCreatedDesc_).map(stripRow_),
    notifications: readTable_('notifications').sort(byCreatedDesc_).slice(0, 200).map(stripRow_),
    documents: readTable_('documents').sort(bySort_).map(stripRow_)
  };
}

function getAdminData(token) {
  requireAdmin_(token);
  return adminSnapshot_();
}

// ---------------------------------------------------------------
// Admin: ระบบ
// ---------------------------------------------------------------

function saveSystem(token, data) {
  requireAdmin_(token);
  data = data || {};
  const clean = {
    name: cleanText_(data.name, 60, 'ชื่อระบบ', true),
    desc: cleanText_(data.desc, 120, 'คำอธิบาย', false),
    url: cleanUrl_(data.url, 'ลิงค์ระบบ', false),
    icon: cleanIcon_(data.icon),
    color: cleanColor_(data.color),
    category: cleanText_(data.category, 40, 'หมวดหมู่', false),
    visible: cleanBool_(data.visible)
  };
  upsert_('systems', cleanId_(data.id), function (existing, rows) {
    clean.sortOrder = existing ? existing.sortOrder : nextSortOrder_(rows);
    return clean;
  });
  return adminSnapshot_();
}

function deleteSystem(token, id) {
  requireAdmin_(token);
  removeRow_('systems', cleanId_(id));
  return adminSnapshot_();
}

function cleanBool_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

// ---------------------------------------------------------------
// Admin: แบนเนอร์
// ---------------------------------------------------------------

function saveBanner(token, data) {
  requireAdmin_(token);
  data = data || {};
  const clean = {
    title: cleanText_(data.title, 60, 'หัวข้อแบนเนอร์', true),
    subtitle: cleanText_(data.subtitle, 120, 'ข้อความรอง', false),
    linkUrl: cleanUrl_(data.linkUrl, 'ลิงค์แบนเนอร์', false),
    color: cleanColor_(data.color),
    imageFileId: cleanFileId_(data.imageFileId),
    visible: cleanBool_(data.visible)
  };
  let oldImage = '';
  upsert_('banners', cleanId_(data.id), function (existing, rows) {
    clean.sortOrder = existing ? existing.sortOrder : nextSortOrder_(rows);
    if (existing) oldImage = existing.imageFileId;
    return clean;
  });
  if (oldImage && oldImage !== clean.imageFileId) trashIfOurs_(oldImage);   // รูปเดิมที่ไม่ใช้แล้วย้ายลงถังขยะ
  return adminSnapshot_();
}

function deleteBanner(token, id) {
  requireAdmin_(token);
  const removed = removeRow_('banners', cleanId_(id));
  if (removed.imageFileId) trashIfOurs_(removed.imageFileId);
  return adminSnapshot_();
}

// ---------------------------------------------------------------
// Admin: ประกาศ (ข้อความวิ่ง / popup)
// ---------------------------------------------------------------

function saveAnnouncement(token, data) {
  requireAdmin_(token);
  data = data || {};
  const type = data.type === 'popup' ? 'popup' : 'ticker';
  const clean = {
    type: type,
    title: type === 'popup' ? cleanText_(data.title, 80, 'หัวข้อประกาศ', true) : cleanText_(data.title, 80, 'หัวข้อ', false),
    text: cleanText_(data.text, type === 'popup' ? 1000 : 300, 'ข้อความ', true),
    startDate: cleanDate_(data.startDate, 'วันเริ่ม'),
    endDate: cleanDate_(data.endDate, 'วันสิ้นสุด'),
    active: cleanBool_(data.active)
  };
  if (clean.startDate && clean.endDate && clean.endDate < clean.startDate) {
    throw userError_('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  }
  upsert_('announcements', cleanId_(data.id), function (existing) {
    clean.createdAt = existing ? existing.createdAt : nowText_();
    return clean;
  });
  return adminSnapshot_();
}

function deleteAnnouncement(token, id) {
  requireAdmin_(token);
  removeRow_('announcements', cleanId_(id));
  return adminSnapshot_();
}

// ---------------------------------------------------------------
// Admin: แจ้งเตือนกระดิ่ง
// ---------------------------------------------------------------

function saveNotification(token, data) {
  requireAdmin_(token);
  data = data || {};
  const clean = {
    title: cleanText_(data.title, 80, 'หัวข้อแจ้งเตือน', true),
    detail: cleanText_(data.detail, 1000, 'รายละเอียด', false),
    createdAt: nowText_(),
    visible: true
  };
  upsert_('notifications', '', function () { return clean; });   // ส่งใหม่เสมอ (ไม่มีการแก้)
  return adminSnapshot_();
}

function deleteNotification(token, id) {
  requireAdmin_(token);
  removeRow_('notifications', cleanId_(id));
  return adminSnapshot_();
}

// ---------------------------------------------------------------
// Admin: เอกสาร + ไฟล์
// ---------------------------------------------------------------

const DOC_MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

function getFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw userError_('ยังไม่ได้สร้างโฟลเดอร์เก็บไฟล์ กรุณารัน setupDatabase');
  try {
    return DriveApp.getFolderById(id);
  } catch (err) {
    throw userError_('เปิดโฟลเดอร์เก็บไฟล์ไม่ได้ กรุณาตรวจสอบสิทธิ์');
  }
}

/** ย้ายไฟล์ลงถังขยะ เฉพาะไฟล์ที่อยู่ในโฟลเดอร์ของระบบเรา (ไม่ลบถาวร) */
function trashIfOurs_(fileId) {
  try {
    const folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
    const file = DriveApp.getFileById(fileId);
    const parents = file.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) {
        file.setTrashed(true);
        return true;
      }
    }
  } catch (err) {
    Logger.log('ย้ายไฟล์ลงถังขยะไม่สำเร็จ: ' + err);
  }
  return false;
}

/** ถอดข้อมูลรูป base64 → บันทึกลง Drive แล้วคืน {fileId, shareWarning} */
function storeFile_(base64, fileName, mime, maxBytes, filePrefix) {
  const raw = String(base64 || '');
  if (!raw) throw userError_('ไม่พบข้อมูลไฟล์');
  if (raw.length > Math.ceil(maxBytes * 4 / 3) + 100) {
    throw userError_('ไฟล์ใหญ่เกินกำหนด (สูงสุด ' + Math.round(maxBytes / 1048576) + 'MB)');
  }
  let bytes;
  try {
    bytes = Utilities.base64Decode(raw);
  } catch (err) {
    throw userError_('ข้อมูลไฟล์ไม่ถูกต้อง');
  }
  if (bytes.length > maxBytes) throw userError_('ไฟล์ใหญ่เกินกำหนด (สูงสุด ' + Math.round(maxBytes / 1048576) + 'MB)');
  if (!bytes.length) throw userError_('ไฟล์ว่างเปล่า');
  const safeName = (filePrefix || '') + String(fileName || 'file').replace(/[\\\/:*?"<>|\u0000-\u001F]/g, '_').slice(0, 100);
  const file = getFolder_().createFile(Utilities.newBlob(bytes, mime, safeName));
  const fileId = file.getId();
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    Logger.log('แชร์ไฟล์สาธารณะไม่สำเร็จ (' + fileId + '): ' + err);   // นโยบายองค์กรอาจห้ามแชร์ — ไม่ล้มทั้งงาน
    return { fileId: fileId, shareWarning: true };
  }
  return { fileId: fileId, shareWarning: false };
}

/** ยกเลิกไฟล์ที่อัปโหลดแล้วแต่บันทึกต่อไม่สำเร็จ — ย้ายลงถังขยะเฉพาะไฟล์ในโฟลเดอร์ระบบ */
function discardUpload(token, fileId) {
  requireAdmin_(token);
  const id = cleanFileId_(fileId);
  return id ? trashIfOurs_(id) : false;
}

/** อัปโหลดรูป (ย่อมาจาก client แล้ว) → คืน {fileId, shareWarning} */
function uploadImage(token, base64, mime, name) {
  requireAdmin_(token);
  const allowed = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!allowed[mime]) throw userError_('รองรับเฉพาะรูป JPG, PNG, WEBP');
  const baseName = String(name || 'banner').replace(/\.[A-Za-z0-9]+$/, '');
  return storeFile_(base64, baseName + '.' + allowed[mime], mime, CONFIG.MAX_IMAGE_BYTES, 'banner_');
}

/** แปลงลิงค์ไฟล์ Google Drive เป็นลิงค์ดาวน์โหลดตรง (ลิงค์อื่นคงเดิม) */
function normalizeDocUrl_(url) {
  const m = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/) ||
            url.match(/^https:\/\/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})/);
  return m ? 'https://drive.google.com/uc?export=download&id=' + m[1] : url;
}

function guessTypeFromUrl_(url) {
  const m = url.split(/[?#]/)[0].match(/\.([A-Za-z0-9]{2,5})$/);
  const ext = m ? m[1].toLowerCase() : '';
  return DOC_MIME[ext] ? ext : 'link';
}

/** เพิ่ม/แก้เอกสาร: {id?, name, visible, url?, base64?, fileName?} */
function saveDocument(token, data) {
  requireAdmin_(token);
  data = data || {};
  const id = cleanId_(data.id);
  const name = cleanText_(data.name, 100, 'ชื่อเอกสาร', true);
  const visible = cleanBool_(data.visible);

  if (id) {
    // แก้ไข: เปลี่ยนชื่อ/สถานะ (และลิงค์ถ้าเป็นเอกสารแบบลิงค์)
    let newUrl = null;
    upsert_('documents', id, function (existing) {
      const obj = {
        name: name, fileId: existing.fileId, url: existing.url, fileType: existing.fileType,
        visible: visible, sortOrder: existing.sortOrder, createdAt: existing.createdAt
      };
      if (!existing.fileId && data.url) {
        newUrl = normalizeDocUrl_(cleanUrl_(data.url, 'ลิงค์เอกสาร', true));
        obj.url = newUrl;
        obj.fileType = guessTypeFromUrl_(newUrl);
      }
      return obj;
    });
    return adminSnapshot_();
  }

  // เพิ่มใหม่
  let fileId = '';
  let shareWarning = false;
  let url = '';
  let fileType = 'link';
  if (data.base64) {
    const fileName = cleanText_(data.fileName, 100, 'ชื่อไฟล์', true);
    const m = fileName.match(/\.([A-Za-z0-9]{2,5})$/);
    const ext = m ? m[1].toLowerCase() : '';
    if (!DOC_MIME[ext]) throw userError_('ไม่รองรับไฟล์ชนิดนี้ (รองรับ PDF, Word, Excel, PowerPoint, CSV, TXT, ZIP, รูปภาพ)');
    const stored = storeFile_(data.base64, fileName, DOC_MIME[ext], CONFIG.MAX_DOC_BYTES, '');
    fileId = stored.fileId;
    shareWarning = stored.shareWarning;
    fileType = ext;
  } else {
    url = normalizeDocUrl_(cleanUrl_(data.url, 'ลิงค์เอกสาร', true));
    fileType = guessTypeFromUrl_(url);
  }
  try {
    upsert_('documents', '', function (existing, rows) {
      return {
        name: name, fileId: fileId, url: url, fileType: fileType, visible: visible,
        sortOrder: nextSortOrder_(rows), createdAt: nowText_()
      };
    });
  } catch (err) {
    if (fileId) trashIfOurs_(fileId);                // บันทึกแถวไม่สำเร็จ ไม่ทิ้งไฟล์ค้าง
    throw err;
  }
  const snap = adminSnapshot_();
  if (shareWarning) snap.shareWarning = true;        // ให้ client เตือนว่าแชร์สาธารณะไม่ได้
  return snap;
}

function deleteDocument(token, id) {
  requireAdmin_(token);
  const removed = removeRow_('documents', cleanId_(id));
  if (removed.fileId) trashIfOurs_(removed.fileId);
  return adminSnapshot_();
}

// ---------------------------------------------------------------
// Admin: เปิด/ซ่อน และ เรียงลำดับ
// ---------------------------------------------------------------

function toggleVisible(token, sheetKey, id) {
  requireAdmin_(token);
  const flag = FLAG_FIELD[sheetKey];
  if (!flag) throw userError_('ชนิดรายการไม่ถูกต้อง');
  const cleanedId = cleanId_(id);
  withLock_(function () {
    const rows = readTable_(sheetKey);
    const target = rows.filter(function (r) { return r.id === cleanedId; })[0];
    if (!target) throw userError_('ไม่พบรายการ (อาจถูกลบไปแล้ว)');
    const col = SCHEMA[sheetKey].headers.indexOf(flag) + 1;
    getSheet_(sheetKey).getRange(target._row, col).setValue(target[flag] ? 'FALSE' : 'TRUE');
    clearCache_();
  });
  return adminSnapshot_();
}

/** เลื่อนรายการขึ้น/ลง dir = 'up' | 'down' */
function moveItem(token, sheetKey, id, dir) {
  requireAdmin_(token);
  if (MOVABLE_KEYS.indexOf(sheetKey) < 0) throw userError_('ชนิดรายการไม่ถูกต้อง');
  if (dir !== 'up' && dir !== 'down') throw userError_('ทิศทางไม่ถูกต้อง');
  const cleanedId = cleanId_(id);
  withLock_(function () {
    const rows = readTable_(sheetKey).sort(bySort_);
    const pos = rows.map(function (r) { return r.id; }).indexOf(cleanedId);
    if (pos < 0) throw userError_('ไม่พบรายการ (อาจถูกลบไปแล้ว)');
    const swapWith = dir === 'up' ? pos - 1 : pos + 1;
    if (swapWith < 0 || swapWith >= rows.length) return;       // อยู่ปลายสุดแล้ว
    const tmp = rows[pos];
    rows[pos] = rows[swapWith];
    rows[swapWith] = tmp;
    // เขียนคอลัมน์ sortOrder ทั้งคอลัมน์ในครั้งเดียว
    const sh = getSheet_(sheetKey);
    const col = SCHEMA[sheetKey].headers.indexOf('sortOrder') + 1;
    const last = sh.getLastRow();
    const colRange = sh.getRange(2, col, last - 1, 1);
    const colValues = colRange.getValues();
    rows.forEach(function (r, i) { colValues[r._row - 2][0] = String(i + 1); });
    colRange.setNumberFormat('@');
    colRange.setValues(colValues);
    clearCache_();
  });
  return adminSnapshot_();
}

// ---------------------------------------------------------------
// Admin: สถิติการใช้งาน (คำนวณฝั่ง server ส่งกลับเป็นตัวเลขสรุป)
// ---------------------------------------------------------------

function topList_(map, nameOf, limit) {
  return Object.keys(map)
    .map(function (k) { return { id: k, name: nameOf(k), count: map[k] }; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, limit);
}

function getStats(token, days) {
  requireAdmin_(token);
  days = [7, 30, 90].indexOf(Number(days)) >= 0 ? Number(days) : 30;
  const span = Math.max(days, 30);
  const today = todayText_();
  const day7 = dayText_(6);
  const day30 = dayText_(29);
  const rangeStart = dayText_(days - 1);
  const cutoff = dayText_(span - 1) + ' 00:00:00';

  const sh = getSheet_('logs');
  const result = { days: days, today: 0, d7: 0, d30: 0, downloads30: 0, mobile: 0, desktop: 0 };
  const sysMap = {};
  const docMap = {};

  // อ่านย้อนจากท้ายชีตทีละก้อน หยุดเมื่อเจอข้อมูลที่เก่ากว่าช่วงที่ต้องใช้
  const CHUNK = 5000;
  const HARD_LIMIT = CONFIG.MAX_LOG_ROWS + CONFIG.LOG_TRIM_ROWS;   // ต้องมากกว่าจำนวนแถวสูงสุดของ Logs
  let end = sh.getLastRow();
  let scanned = 0;
  let finished = false;
  while (end >= 2 && !finished && scanned < HARD_LIMIT) {
    const start = Math.max(2, end - CHUNK + 1);
    const values = sh.getRange(start, 1, end - start + 1, 4).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      const ts = cellText_(values[i][0]);
      if (ts < cutoff) { finished = true; break; }
      const day = ts.slice(0, 10);
      const ev = cellText_(values[i][1]);
      const target = cellText_(values[i][2]);
      if (ev === 'open_app') {
        if (day === today) result.today++;
        if (day >= day7) result.d7++;
        if (day >= day30) result.d30++;
        if (day >= rangeStart) {
          if (cellText_(values[i][3]) === 'desktop') result.desktop++; else result.mobile++;
        }
      } else if (ev === 'download_doc') {
        if (day >= day30) result.downloads30++;
        if (day >= rangeStart) docMap[target] = (docMap[target] || 0) + 1;
      } else if (ev === 'open_system') {
        if (day >= rangeStart) sysMap[target] = (sysMap[target] || 0) + 1;
      }
    }
    scanned += values.length;
    end = start - 1;
  }

  const sysNames = {};
  readTable_('systems').forEach(function (s) { sysNames[s.id] = s.name; });
  const docNames = {};
  readTable_('documents').forEach(function (d) { docNames[d.id] = d.name; });
  result.topSystems = topList_(sysMap, function (k) { return sysNames[k] || '(ระบบที่ถูกลบแล้ว)'; }, 10);
  result.topDocs = topList_(docMap, function (k) { return docNames[k] || '(เอกสารที่ถูกลบแล้ว)'; }, 10);
  return result;
}
