// Netlify Function: transcribe
//
// This runs on Netlify's servers, never in the browser. It is the only
// place the Anthropic API key is used. The browser (writing-marker.html)
// calls this function at /.netlify/functions/transcribe instead of calling
// api.anthropic.com directly, so the key is never present in any page the
// student, teacher, or anyone else's browser can see or view-source.
//
// The API key comes from the Netlify environment variable ANTHROPIC_API_KEY
// (set in the Netlify dashboard — see the setup instructions provided
// alongside this file). It is never hard-coded here.

exports.handler = async function (event) {
  // Only accept POST requests.
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'The server is missing its ANTHROPIC_API_KEY environment variable. Add it in Netlify: Site settings > Environment variables.'
      })
    };
  }

  // Parse the request body sent by the browser. It should only ever contain
  // the page images + the transcription prompt as an Anthropic "content"
  // array — the model name and token limit are fixed here on the server,
  // not taken from the browser, so a modified/compromised client can't
  // change which model runs or spend more than intended.
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body' })
    };
  }

  const content = payload.content;
  if (!Array.isArray(content) || content.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing "content" (page images + prompt) in request' })
    };
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: content }]
      })
    });

    const text = await upstream.text();
    // Pass Anthropic's response (and status code) straight through — the
    // browser's existing parsing code already knows how to read this shape,
    // so nothing on the client needs to change except the URL it calls.
    return {
      statusCode: upstream.status,
      headers: { 'Content-Type': 'application/json' },
      body: text
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Could not reach the AI service: ' + ((err && err.message) || err) })
    };
  }
};
