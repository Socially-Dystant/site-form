const express = require('express');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB = path.join(__dirname, 'store.json');

app.use(express.json());
app.use(express.static('public'));

function readDB() {
  if (!fs.existsSync(DB)) return {};
  return JSON.parse(fs.readFileSync(DB, 'utf8') || '{}');
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

app.post('/api/save', (req, res) => {
  const token = uuid().slice(0, 8);
  const db = readDB();
  db[token] = {
    data: req.body,
    savedAt: new Date().toISOString()
  };
  writeDB(db);
  res.json({ token });
});

app.get('/api/load/:token', (req, res) => {
  const db = readDB();
  res.json(db[req.params.token]?.data || null);
});

// -----------------------------
// Salesforce submission proxy
//
// The browser never talks to Salesforce directly (avoids exposing OAuth
// credentials client-side and avoids needing a CORS whitelist entry in
// Salesforce). Instead it POSTs here, and this server obtains a Client
// Credentials access token and forwards the request to NrenAssessmentApi.
//
// Requires these environment variables to be set on the host (Render, etc.):
//   SF_LOGIN_URL     e.g. https://renergy.my.salesforce.com
//   SF_CLIENT_ID     Consumer Key from the Connected App
//   SF_CLIENT_SECRET Consumer Secret from the Connected App
// -----------------------------
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://renergy.my.salesforce.com';
const SF_CLIENT_ID = process.env.SF_CLIENT_ID;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const SF_REST_PATH = '/services/apexrest/NrenAssessmentApi/v1/save';

// Simple in-memory token cache. Client Credentials responses don't reliably
// include expires_in, so refresh conservatively rather than trusting a long TTL.
let cachedToken = null; // { accessToken, instanceUrl, expiresAt }
const TOKEN_TTL_MS = 15 * 60 * 1000;

async function getSalesforceAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken;
  }

  if (!SF_CLIENT_ID || !SF_CLIENT_SECRET) {
    throw new Error('Server is missing SF_CLIENT_ID / SF_CLIENT_SECRET configuration.');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
  });

  const tokenRes = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const tokenData = await tokenRes.json().catch(() => null);

  if (!tokenRes.ok || !tokenData || !tokenData.access_token) {
    const detail = (tokenData && (tokenData.error_description || tokenData.error)) || tokenRes.status;
    throw new Error(`Salesforce token request failed: ${detail}`);
  }

  cachedToken = {
    accessToken: tokenData.access_token,
    instanceUrl: tokenData.instance_url || SF_LOGIN_URL,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };

  return cachedToken;
}

app.post('/api/submit-assessment', async (req, res) => {
  try {
    const token = await getSalesforceAccessToken();

    const sfRes = await fetch(`${token.instanceUrl}${SF_REST_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.accessToken}`,
      },
      body: JSON.stringify(req.body),
    });

    const sfData = await sfRes.json().catch(() => null);

    if (!sfRes.ok || !sfData || sfData.success !== true) {
      // The cached token may have been revoked or the org config changed;
      // drop it so the next attempt fetches a fresh one instead of retrying
      // with a bad token indefinitely.
      if (sfRes.status === 401) {
        cachedToken = null;
      }
      res.status(sfRes.status || 502).json(
        sfData || { success: false, message: 'Salesforce submission failed.' }
      );
      return;
    }

    res.json(sfData);
  } catch (err) {
    console.error('submit-assessment error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
