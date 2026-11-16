"""Split the Eval page (build 64) into Google Apps Script HTML files.

usage: python3 -I convert.py <index.html> <output dir>
Writes Index.html, Styles.html and JavaScript.html. Code.gs and appsscript.json are written by hand.
"""
import sys, pathlib

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
s = src.read_text(encoding='utf-8')

# the upload is wrapped in a published-artifact skeleton; keep only the real document
start = s.index('<!DOCTYPE html>')
end = s.index('</html>', start) + len('</html>')
doc = s[start:end]

def between(text, a, b, frm=0):
    i = text.index(a, frm) + len(a)
    j = text.index(b, i)
    return text[i:j], j

head_end = doc.index('</head>')
css, _ = between(doc[:head_end], '<style>', '</style>')
body, _ = between(doc, '<body>\n', '<script src="vendor/xlsx.full.min.js"></script>')
js, _ = between(doc, '<script src="vendor/xlsx.full.min.js"></script>\n<script>\n', '\n</script>\n</body>')

assert '<?' not in doc and '?>' not in doc, 'scriptlet markers would break the Apps Script template'

def rep(text, a, b):
    assert text.count(a) == 1, (a, text.count(a))
    return text.replace(a, b)

# 1. the two server routes now go through google.script.run (see serverFetch below)
js = rep(js, "const r = await fetch('api/check', { headers:{ 'x-eval-code': k } });",
             "const r = await serverFetch('api/check', { headers:{ 'x-eval-code': k } });")
js = rep(js, "res = await fetch(SERVER ? 'api/messages' : 'https://api.anthropic.com/v1/messages', {",
             "res = await (SERVER ? serverFetch : fetch)(SERVER ? 'api/messages' : 'https://api.anthropic.com/v1/messages', {")
# 2. Apps Script has no vendor/ folder; load the same library from a CDN
js = rep(js, "s.src = 'vendor/heic2any.min.js';",
             "s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';")
# 3. Apps Script always shows the page inside a frame; its frame allows downloads
js = rep(js, "  if(!framed){", "  if(!framed || GAS){")

bridge = r"""/* =====================================================================
   GOOGLE APPS SCRIPT BRIDGE
   This page is served by Apps Script, so the two server routes the app
   uses (api/check and api/messages) are answered by Code.gs through
   google.script.run. serverFetch returns just enough of a fetch()
   Response for the app's own code to read it unchanged.
   ===================================================================== */
const GAS = typeof google !== 'undefined' && !!(google.script && google.script.run);
function gasRun(fn, arg){
  return new Promise((resolve, reject)=>{
    google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](arg);
  });
}
async function serverFetch(path, opts){
  opts = opts || {};
  const code = (opts.headers && opts.headers['x-eval-code']) || '';
  let out;
  try{
    out = (path === 'api/check')
      ? await gasRun('checkCode', code)
      : await gasRun('callClaude', { code: code, body: opts.body || '' });
  }catch(e){
    // the app reads a thrown fetch as a dropped connection and offers to run again
    throw new TypeError('Apps Script call failed: ' + ((e && e.message) || e));
  }
  const status = Number(out && out.status) || 500;
  const text = String((out && out.body) || '');
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: { get: name => String(name).toLowerCase() === 'retry-after' ? ((out && out.retryAfter) || null) : null },
    text: async () => text,
    json: async () => JSON.parse(text)
  };
}

"""

index = """<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<script>window.EVAL_CONFIG = { server: true, open: <?!= open ?> };</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet">
<?!= include('Styles') ?>
</head>
<body>
""" + body + """<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<?!= include('JavaScript') ?>
</body>
</html>
"""

out.mkdir(parents=True, exist_ok=True)
(out / 'Index.html').write_text(index, encoding='utf-8')
(out / 'Styles.html').write_text('<style>' + css + '</style>\n', encoding='utf-8')
(out / 'JavaScript.html').write_text('<script>\n' + bridge + js + '\n</script>\n', encoding='utf-8')
print('ok', {f.name: f.stat().st_size for f in sorted(out.glob('*.html'))})
