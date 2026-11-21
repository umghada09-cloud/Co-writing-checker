/**
 * Plan & Track — anonymous usage counter and teacher dashboard.
 *
 * The planner sends only: a random device id, the governorate and the wilayat.
 * No names, no progress.
 *
 * Files in this project:
 *   Code.gs         (this file)
 *   Dashboard.html  (the dashboard page)
 *
 * One-time setup:
 *   1. Run setup() from the editor (choose it in the function menu, click Run).
 *      It creates a Google Sheet called "Plan & Track – Users" in your Drive.
 *   2. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *   3. Run showLinks() and copy the two links from the log.
 */

var TZ = 'Asia/Muscat';
var COLS = ['dev', 'gov', 'wil', 'firstSeen', 'lastActive'];

var PLACES = {
  'مسقط': ['مسقط', 'مطرح', 'بوشر', 'السيب', 'العامرات', 'قريات'],
  'ظفار': ['صلالة', 'طاقة', 'مرباط', 'رخيوت', 'ثمريت', 'ضلكوت', 'المزيونة', 'مقشن', 'شليم وجزر الحلانيات', 'سدح'],
  'مسندم': ['خصب', 'دبا', 'بخا', 'مدحاء'],
  'البريمي': ['البريمي', 'محضة', 'السنينة'],
  'الداخلية': ['نزوى', 'بهلا', 'منح', 'الحمراء', 'أدم', 'إزكي', 'سمائل', 'بدبد', 'الجبل الأخضر'],
  'شمال الباطنة': ['صحار', 'شناص', 'لوى', 'صحم', 'الخابورة', 'السويق'],
  'جنوب الباطنة': ['الرستاق', 'العوابي', 'نخل', 'وادي المعاول', 'بركاء', 'المصنعة'],
  'جنوب الشرقية': ['صور', 'الكامل والوافي', 'جعلان بني بو حسن', 'جعلان بني بو علي', 'مصيرة'],
  'شمال الشرقية': ['إبراء', 'المضيبي', 'بدية', 'القابل', 'وادي بني خالد', 'دماء والطائيين', 'سناو'],
  'الظاهرة': ['عبري', 'ينقل', 'ضنك'],
  'الوسطى': ['هيماء', 'محوت', 'الدقم', 'الجازر']
};

/** Keeps only real governorate and wilayat names; anything else is stored as "not chosen". */
function cleanPlace(gov, wil) {
  if (!PLACES.hasOwnProperty(gov)) return ['', ''];
  return [gov, PLACES[gov].indexOf(wil) >= 0 ? wil : ''];
}

/* ---------------- setup ---------------- */

function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('Plan & Track – Users');
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('TEACHER_KEY')) props.setProperty('TEACHER_KEY', randomKey(24));

  var us = ss.getSheetByName('Users') || ss.insertSheet('Users');
  us.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
  us.setFrozenRows(1);
  var ac = ss.getSheetByName('Activity') || ss.insertSheet('Activity');
  ac.getRange(1, 1, 1, 2).setValues([['date', 'dev']]).setFontWeight('bold');
  ac.setFrozenRows(1);
  var su = ss.getSheetByName('Summary') || ss.insertSheet('Summary', 0);
  su.getRange('A1:B3').setValues([
    ['إجمالي المستخدمين', '=COUNTA(Users!A2:A)'],
    ['نشطون اليوم', '=COUNTIF(Activity!A2:A, TEXT(TODAY(), "yyyy-mm-dd"))+COUNTIF(Activity!A2:A, TODAY())'],
    ['نشطون آخر 7 أيام', '=COUNTIF(Users!E2:E, ">="&(TODAY()-6))']
  ]);
  su.getRange('A5').setFormula('=QUERY(Users!A:B, "select B, count(A) where A is not null group by B order by count(A) desc label B \'المحافظة\', count(A) \'عدد المستخدمين\'", 1)');
  su.getRange('A1:A3').setFontWeight('bold');
  su.setRightToLeft(true);
  ss.getSheets().forEach(function (sh) {
    if (['Users', 'Activity', 'Summary'].indexOf(sh.getName()) < 0 && ss.getSheets().length > 3) ss.deleteSheet(sh);
  });
  Logger.log('Data sheet: ' + ss.getUrl());
  Logger.log('Next: Deploy → New deployment → Web app, then run showLinks().');
}

function showLinks() {
  var url = ScriptApp.getService().getUrl();
  if (!url) { Logger.log('Deploy the web app first (Deploy → New deployment → Web app).'); return; }
  Logger.log('1) Paste this into the planner, on the line that starts with var API=\n' + url);
  Logger.log('2) Your private dashboard link (keep it to yourself):\n' + url + '?t=' + key_());
}

/** Makes a new dashboard key, so an old dashboard link stops working. */
function resetDashboardKey() {
  PropertiesService.getScriptProperties().setProperty('TEACHER_KEY', randomKey(24));
  showLinks();
}

/* ---------------- receiving data from the planner ---------------- */

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var dev = cleanId(p.dev);
    if (!dev) return out('bad');
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var place = cleanPlace(String(p.gov || '').trim(), String(p.wil || '').trim());
      upsertUser(dev, place[0], place[1]);
      logActivity(dev);
    } finally {
      lock.releaseLock();
    }
    return out('ok');
  } catch (err) {
    return out('error');
  }
}

/** Lets the planner also count users when it is opened from Google Apps Script. */
function logEvent(ev, dev, gov, wil) {
  doPost({ postData: { contents: JSON.stringify({ ev: ev, dev: dev, gov: gov, wil: wil }) } });
}

function upsertUser(dev, gov, wil) {
  var sh = sheet_('Users'), now = new Date();
  var found = sh.getRange('A:A').createTextFinder(dev).matchEntireCell(true).findNext();
  if (found && found.getRow() > 1) {
    var r = found.getRow();
    if (gov) sh.getRange(r, 2, 1, 2).setValues([[gov, wil]]);
    sh.getRange(r, 5).setValue(now);
  } else {
    sh.appendRow([dev, gov, wil, now, now]);
  }
}

/** One row per device per day: "this device used the planner on this date". */
function logActivity(dev) {
  var day = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var cache = CacheService.getScriptCache(), k = 'a_' + day + '_' + dev;
  if (cache.get(k)) return;
  var sh = sheet_('Activity');
  var hits = sh.getRange('B:B').createTextFinder(dev).matchEntireCell(true).findAll();
  var already = hits.some(function (c) {
    var v = sh.getRange(c.getRow(), 1).getValue();
    return (v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v)) === day;
  });
  if (!already) sh.appendRow([day, dev]);
  cache.put(k, '1', 21600);
}

/* ---------------- dashboard page ---------------- */

function doGet(e) {
  var q = (e && e.parameter) || {};
  // ignore spaces and invisible characters that phones add when a link is copied
  var t = String(q.t || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  var ok = !!t && t === key_();
  var data = ok ? dashboardData() : null;
  var html = HtmlService.createHtmlOutputFromFile('Dashboard').getContent();
  html = html.replace('/*DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
  return HtmlService.createHtmlOutput(html)
    .setTitle('Plan & Track · لوحة المعلمة')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Called from the locked page when the teacher types her key (works even when a link loses its key). */
function getDashboardData(key) {
  var t = String(key || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return t && t === key_() ? dashboardData() : null;
}

function dashboardData() {
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var users = sheet_('Users').getDataRange().getValues().slice(1).filter(function (r) { return r[0]; });
  var act = sheet_('Activity').getDataRange().getValues().slice(1);
  var dayOf = function (v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').slice(0, 10); };

  // which days each device used the planner (from Activity), plus its first day (from Users)
  var seen = {}, first = {};
  users.forEach(function (r) { first[r[0]] = dayOf(r[3]); seen[r[0]] = {}; seen[r[0]][dayOf(r[3])] = 1; });
  act.forEach(function (a) {
    var d = dayOf(a[0]), dev = a[1];
    if (!dev || !d) return;
    (seen[dev] = seen[dev] || {})[d] = 1;
    if (!first[dev] || d < first[dev]) first[dev] = d;
  });

  var devs = Object.keys(seen), dist = { one: 0, two: 0, more: 0 }, eligible = 0, continuing = 0;
  devs.forEach(function (dev) {
    var n = Object.keys(seen[dev]).length;
    if (n >= 3) dist.more++; else if (n === 2) dist.two++; else dist.one++;
    if (first[dev] < today) { eligible++; if (n >= 2) continuing++; }
  });

  var daily = [];
  for (var i = 13; i >= 0; i--) {
    var d = shift(today, -i), n = 0, ret = 0;
    devs.forEach(function (dev) { if (seen[dev][d]) { n++; if (first[dev] < d) ret++; } });
    daily.push({ d: d, n: n, ret: ret });
  }
  return {
    today: today,
    daily: daily,
    retention: { continuing: continuing, eligible: eligible, dist: dist },
    users: users.map(function (r) { return { gov: r[1], wil: r[2], first: fmt(r[3]), last: fmt(r[4]) }; })
  };
}

/* ---------------- helpers ---------------- */

function sheet_(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first.');
  return SpreadsheetApp.openById(id).getSheetByName(name);
}
function key_() { return PropertiesService.getScriptProperties().getProperty('TEACHER_KEY') || ''; }
function out(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }
function str(v, n) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  return /^[=+\-@]/.test(s) ? "'" + s : s; // never let text become a spreadsheet formula
}
function cleanId(v) { v = String(v || ''); return /^[A-Za-z0-9_-]{4,40}$/.test(v) ? v : ''; }
function fmt(d) { return d instanceof Date ? Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm") : String(d || ''); }
function shift(day, n) { var d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function randomKey(n) {
  var c = 'abcdefghijkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}
