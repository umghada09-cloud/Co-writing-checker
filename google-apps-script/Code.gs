/**
 * Ghada's Finals Tracker — Google Apps Script web app.
 *
 * Files in this project:
 *   Code.gs     (this file)
 *   Index.html  (the tracker page, pasted unchanged)
 *
 * Progress is saved to your Google account (Script Properties),
 * so ticking a task on your phone also shows on your laptop.
 */

var KEY = 'ghada-tracker';
var CHUNK = 3000; // characters per stored piece (Properties limit is 9 KB per value)

function doGet() {
  var html = HtmlService.createHtmlOutputFromFile('Index').getContent();

  // Hand the last cloud-saved progress to the page before the app starts,
  // and send every new save back to Google.
  var saved = loadState();
  var shim =
    '<script>(function(){' +
    'var cloud=' + JSON.stringify(saved || null).replace(/</g, '\\u003c') + ';' +
    'try{var loc=JSON.parse(localStorage.getItem("' + KEY + '")||"null");' +
    'if(cloud&&(!loc||(cloud.savedAt||0)>(loc.savedAt||0)))localStorage.setItem("' + KEY + '",JSON.stringify(cloud));}catch(e){}' +
    'var set=Storage.prototype.setItem,t=null;' +
    'Storage.prototype.setItem=function(k,v){set.apply(this,arguments);' +
    'if(k==="' + KEY + '"){clearTimeout(t);t=setTimeout(function(){' +
    'google.script.run.withFailureHandler(function(e){console.warn("Cloud save failed",e);}).saveState(v);},1500);}};' +
    '})();</script>';

  html = html.replace('<script id="app">', shim + '<script id="app">');

  return HtmlService.createHtmlOutput(html)
    .setTitle('Ghada’s Finals Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Called from the page whenever progress changes. */
function saveState(json) {
  var obj = JSON.parse(json); // reject anything that isn't valid JSON
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var old = loadState();
    if (old && (old.savedAt || 0) > (obj.savedAt || 0)) return 'older-ignored';
    var prevN = Number(props.getProperty(KEY + '_n') || 0);
    var parts = {};
    var n = Math.ceil(json.length / CHUNK);
    for (var i = 0; i < n; i++) parts[KEY + '_' + i] = json.substr(i * CHUNK, CHUNK);
    parts[KEY + '_n'] = String(n);
    props.setProperties(parts, false);
    // remove leftover pieces from a longer earlier save
    for (var j = n; j < prevN; j++) props.deleteProperty(KEY + '_' + j);
    return 'saved';
  } finally {
    lock.releaseLock();
  }
}

function loadState() {
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty(KEY + '_n') || 0);
  if (!n) return null;
  var s = '';
  for (var i = 0; i < n; i++) s += props.getProperty(KEY + '_' + i) || '';
  try { return JSON.parse(s); } catch (e) { return null; }
}

/** Run this from the editor if you ever want to wipe saved progress. */
function resetProgress() {
  PropertiesService.getScriptProperties().deleteAllProperties();
}
