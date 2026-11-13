/**
 * Eval — the Writing Grader served by Google Apps Script.
 *
 * Replaces the website's server: the page asks this script (through
 * google.script.run) to check an access code and to send a paper to Claude.
 * The Claude API key stays here, in Script properties, and never reaches
 * the browser.
 *
 * Script properties (Project Settings → Script properties):
 *   ANTHROPIC_API_KEY  required. The Claude API key from console.anthropic.com.
 *   ACCESS_CODES       the codes teachers type on the home screen, separated by
 *                      commas, e.g. "maths-dept-7, eng-team-3".
 *   OPEN               "true" lets anyone use the site without a code. Leave it
 *                      out unless you mean it: every visitor spends your credit.
 *   DAILY_LIMIT        in open mode, the most Claude calls per day for the whole
 *                      site (default 500).
 */

/** Models the page may ask for; anything else gets the everyday model. */
const ALLOWED_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-sonnet-4-6'];
const DEFAULT_MODEL = 'claude-sonnet-5';
/** Room for Claude to think before it answers, so replies are not cut short.
    Only the tokens actually used are charged. */
const MAX_TOKENS = 8000;

function doGet() {
  const page = HtmlService.createTemplateFromFile('Index');
  page.open = isOpen_();
  return page.evaluate()
    .setTitle('Eval')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Pastes another HTML file of this project into Index.html. */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Called by the page when a teacher saves an access code. */
function checkCode(code) {
  return { status: codeOk_(code) ? 200 : 401, body: '' };
}

/**
 * Called by the page for every Claude request (reading handwriting, proposing
 * a mark). req.body is the JSON the page would have sent to the Messages API;
 * the model and size limit are decided here, not by the page.
 * Returns {status, body, retryAfter} — the page turns this back into a response.
 */
function callClaude(req) {
  req = req || {};
  if (!codeOk_(req.code)) return reply_(401, { error: 'access code not accepted' });

  const key = props_().getProperty('ANTHROPIC_API_KEY');
  if (!key) return reply_(500, { error: 'ANTHROPIC_API_KEY is not set in Script properties' });

  let body;
  try { body = JSON.parse(req.body); } catch (e) { return reply_(400, { error: 'bad request' }); }
  if (!body || !Array.isArray(body.messages) || !body.messages.length) {
    return reply_(400, { error: 'bad request' });
  }
  if (isOpen_() && !countToday_()) return reply_(429, { error: 'daily limit reached' });

  const payload = {
    model: ALLOWED_MODELS.indexOf(body.model) >= 0 ? body.model : DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    messages: body.messages
  };

  let res;
  try {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    return reply_(502, { error: 'could not reach Claude: ' + ((e && e.message) || e) });
  }
  const headers = res.getHeaders();
  return {
    status: res.getResponseCode(),
    body: res.getContentText(),
    retryAfter: headers['retry-after'] || headers['Retry-After'] || null
  };
}

/* ---------- helpers ---------- */

function props_() {
  return PropertiesService.getScriptProperties();
}

function isOpen_() {
  return String(props_().getProperty('OPEN') || '').trim().toLowerCase() === 'true';
}

function codeOk_(code) {
  if (isOpen_()) return true;
  const given = String(code || '').trim();
  if (!given) return false;
  const codes = String(props_().getProperty('ACCESS_CODES') || '')
    .split(',').map(function (c) { return c.trim(); }).filter(String);
  return codes.indexOf(given) >= 0;
}

/** Open mode only: counts today's calls for the whole site; false once the limit is reached. */
function countToday_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = props_();
    const today = Utilities.formatDate(new Date(), 'Etc/UTC', 'yyyy-MM-dd');
    const used = p.getProperty('COUNT_DAY') === today ? Number(p.getProperty('COUNT_N') || 0) : 0;
    const limit = Number(p.getProperty('DAILY_LIMIT') || 500);
    if (used >= limit) return false;
    p.setProperties({ COUNT_DAY: today, COUNT_N: String(used + 1) });
    return true;
  } finally {
    lock.releaseLock();
  }
}

function reply_(status, obj) {
  return { status: status, body: JSON.stringify(obj), retryAfter: null };
}
