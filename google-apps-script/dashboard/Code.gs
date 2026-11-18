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
  ac.getRange(1, 1, 1, 3).setValues([['date', 'dev', 'event']]).setFontWeight('bold');
  ac.setFrozenRows(1);
  ss.getSheets().forEach(function (sh) {
    if (sh.getName() !== 'Users' && sh.getName() !== 'Activity' && ss.getSheets().length > 2) ss.deleteSheet(sh);
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
      upsertUser(dev, str(p.gov, 40), str(p.wil, 40));
      logActivity(dev, p.ev === 'plan' ? 'plan' : 'open');
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

function logActivity(dev, ev) {
  var day = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var cache = CacheService.getScriptCache(), k = 'a_' + day + '_' + dev + '_' + ev;
  if (cache.get(k)) return;
  sheet_('Activity').appendRow([day, dev, ev]);
  cache.put(k, '1', 21600);
}

/* ---------------- dashboard page ---------------- */

function doGet(e) {
  var q = (e && e.parameter) || {};
  var ok = !!q.t && q.t === key_();
  var data = ok ? dashboardData() : null;
  var html = HtmlService.createHtmlOutputFromFile('Dashboard').getContent();
  html = html.replace('/*DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
  return HtmlService.createHtmlOutput(html)
    .setTitle('Plan & Track · لوحة المعلمة')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function dashboardData() {
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var users = sheet_('Users').getDataRange().getValues().slice(1).filter(function (r) { return r[0]; });
  var act = sheet_('Activity').getDataRange().getValues().slice(1);
  var days = {};
  for (var i = 13; i >= 0; i--) days[shift(today, -i)] = {};
  act.forEach(function (a) {
    var d = a[0] instanceof Date ? Utilities.formatDate(a[0], TZ, 'yyyy-MM-dd') : String(a[0]);
    if (days[d]) days[d][a[1]] = 1;
  });
  return {
    today: today,
    daily: Object.keys(days).map(function (d) { return { d: d, n: Object.keys(days[d]).length }; }),
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
