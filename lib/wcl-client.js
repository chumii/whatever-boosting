const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const API_URL   = "https://www.warcraftlogs.com/api/v2/client";

let tokenCache = { token: null, expiresAt: 0 };

async function fetchToken() {
  const { WCL_CLIENT_ID, WCL_CLIENT_SECRET } = process.env;
  if (!WCL_CLIENT_ID || !WCL_CLIENT_SECRET) {
    throw new Error("Missing WCL_CLIENT_ID or WCL_CLIENT_SECRET env vars");
  }

  const credentials = Buffer.from(`${WCL_CLIENT_ID}:${WCL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WCL token fetch failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    // shave 60 s off to refresh slightly before actual expiry
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  console.log("[wcl] fetched new token");
  return tokenCache.token;
}

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  return fetchToken();
}

export async function wclQuery(query, variables = {}) {
  let token = await getToken();

  const doRequest = async (t) =>
    fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

  let res = await doRequest(token);

  if (res.status === 401) {
    // token was invalidated server-side – refresh once and retry
    tokenCache = { token: null, expiresAt: 0 };
    token = await getToken();
    res = await doRequest(token);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WCL API error (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}
