import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";

import { ensureParentDir, getConfig } from "./config.js";
import { readJsonIfExists, writeJson } from "./utils.js";

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest();
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(sha256(verifier));
  return { verifier, challenge };
}

function createLoopbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (error) {
        response.end("<h1>Authorization failed</h1><p>You can close this tab and return to the terminal.</p>");
        server.close();
        reject(new Error(`Google OAuth error: ${error}`));
        return;
      }

      response.end("<h1>Authorization complete</h1><p>You can close this tab and return to the terminal.</p>");
      server.close();
      resolve({ code, state });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to determine local OAuth callback port."));
        return;
      }

      resolve({
        port: address.port,
        awaitCode: new Promise((innerResolve, innerReject) => {
          server.removeAllListeners("request");
          server.on("request", (request, response) => {
            const requestUrl = new URL(request.url, "http://127.0.0.1");
            const code = requestUrl.searchParams.get("code");
            const state = requestUrl.searchParams.get("state");
            const error = requestUrl.searchParams.get("error");

            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            if (error) {
              response.end("<h1>Authorization failed</h1><p>You can close this tab and return to the terminal.</p>");
              server.close();
              innerReject(new Error(`Google OAuth error: ${error}`));
              return;
            }

            response.end("<h1>Authorization complete</h1><p>You can close this tab and return to the terminal.</p>");
            server.close();
            innerResolve({ code, state });
          });
        }),
      });
    });
  });
}

async function exchangeCodeForTokens(config, code, codeVerifier, redirectUri) {
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${details}`);
  }

  const tokens = await response.json();
  return {
    ...tokens,
    expiry_date: Date.now() + (tokens.expires_in * 1000),
  };
}

export async function getValidGoogleTokens(config) {
  const existing = readJsonIfExists(config.tokensPath, null);
  if (!existing?.refresh_token) {
    throw new Error(
      `Google OAuth tokens not found at ${config.tokensPath}. Run "npm run auth:google" first.`,
    );
  }

  const needsRefresh = !existing.access_token || !existing.expiry_date || existing.expiry_date < Date.now() + 60_000;
  if (!needsRefresh) {
    return existing;
  }

  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    refresh_token: existing.refresh_token,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google token refresh failed: ${response.status} ${details}`);
  }

  const refreshed = await response.json();
  const updated = {
    ...existing,
    ...refreshed,
    expiry_date: Date.now() + (refreshed.expires_in * 1000),
  };

  ensureParentDir(config.tokensPath);
  writeJson(config.tokensPath, updated);
  return updated;
}

async function authorize() {
  const config = getConfig();
  const oauth = await createLoopbackServer();
  const { verifier, challenge } = createPkcePair();
  const state = crypto.randomUUID();
  const redirectUri = `http://127.0.0.1:${oauth.port}`;

  const authUrl = new URL(GOOGLE_OAUTH_BASE);
  authUrl.searchParams.set("client_id", config.googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.googleScopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  console.log("Open this URL in your browser to connect Google Calendar:\n");
  console.log(authUrl.toString());
  console.log("");

  const callback = await oauth.awaitCode;
  if (callback.state !== state) {
    throw new Error("OAuth state mismatch. Aborting.");
  }

  const tokens = await exchangeCodeForTokens(config, callback.code, verifier, redirectUri);
  ensureParentDir(config.tokensPath);
  writeJson(config.tokensPath, tokens);

  console.log(`Saved Google OAuth tokens to ${config.tokensPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  authorize().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
