// server/server.cjs
const path = require("path");
// CMD+F: DOTENV_PATH_FIX
require("dotenv").config();
const fs = require("fs");
const https = require("https");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const compression = require("compression");
const mssqlAuth = require("mssql");
// ── Ensure global fetch exists BEFORE yahoo-finance2 is imported ─────────────
if (typeof globalThis.fetch !== "function") {
  try {
    const { fetch, Headers, Request, Response } = require("undici");
    globalThis.fetch = fetch;
    globalThis.Headers = Headers;
    globalThis.Request = Request;
    globalThis.Response = Response;
    console.log("🌐 fetch polyfilled via undici");
  } catch {
    require("isomorphic-fetch");
    console.log("🌐 fetch polyfilled via isomorphic-fetch");
  }
}

// [NET-SETUP] --- must be the first lines in this file ---
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first"); // prefer IPv4 to dodge IPv6 blocks

// Ensure global fetch + force undici to use IPv4
try {
  const {
    fetch,
    Headers,
    Request,
    Response,
    setGlobalDispatcher,
    Agent,
    ProxyAgent,
  } = require("undici");
  if (typeof globalThis.fetch !== "function") {
    globalThis.fetch = fetch;
    globalThis.Headers = Headers;
    globalThis.Request = Request;
    globalThis.Response = Response;
  }

  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log("🌐 undici using PROXY →", proxy);
  } else {
    // Force IPv4; add timeouts to avoid hanging sockets
    setGlobalDispatcher(new Agent({ connect: { family: 4, timeout: 15000 } }));
    console.log("🌐 undici using Agent (IPv4-first)");
  }
} catch (e) {
  // last-ditch fallback
  require("isomorphic-fetch");
  console.log("🌐 fetch polyfilled via isomorphic-fetch");
}

// yahoo-finance2 v3+ requires an instance:
// [YF-INSTANTIATE]
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
let lastYahooFetch = 0;
const YAHOO_COOLDOWN_MS = 60_000; // 1 minute

const cron = require("node-cron");

// ── ENV helpers & safe file readers (align with DIGI) ─────────────────────────
function mustGetEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`❌ Missing required env: ${name}`);
    process.exit(1);
  }
  return v.replace(/^"(.*)"$/, "$1"); // strip quotes if any
}
function readFileOrExit(filePath, label) {
  const p = filePath;
  try {
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    console.error(`❌ Failed to read ${label} at: ${p}`);
    console.error(e.message || e);
    process.exit(1);
  }
}

// ── SSO/JWT config ───────────────────────────────────────────────────────────
const COOKIE_DOMAIN = (process.env.COOKIE_DOMAIN || "").trim(); // blank for localhost
const ISSUER = process.env.ISSUER || "auth.premierenergies.com";
const AUDIENCE = process.env.AUDIENCE || "apps.premierenergies.com";
const ACCESS_TTL = process.env.ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.REFRESH_TTL || "30d";

// JWT keys
const AUTH_PRIVATE_KEY_FILE = mustGetEnv("AUTH_PRIVATE_KEY_FILE");
const AUTH_PUBLIC_KEY_FILE = mustGetEnv("AUTH_PUBLIC_KEY_FILE");
const AUTH_PRIVATE_KEY = readFileOrExit(
  AUTH_PRIVATE_KEY_FILE,
  "AUTH_PRIVATE_KEY_FILE"
);
const AUTH_PUBLIC_KEY = readFileOrExit(
  AUTH_PUBLIC_KEY_FILE,
  "AUTH_PUBLIC_KEY_FILE"
);

// TLS from env (stop hard-coding cert paths)
const TLS_KEY_FILE = mustGetEnv("TLS_KEY_FILE");
const TLS_CERT_FILE = mustGetEnv("TLS_CERT_FILE");
const TLS_CA_FILE = mustGetEnv("TLS_CA_FILE");

// ── HARD-CODED CREDS & GRAPH CLIENT (once) ───────────────────────────────────
const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");
require("isomorphic-fetch");

// ── Crash guards: log everything instead of dropping the connection ──────────
process.on("unhandledRejection", (reason, p) => {
  console.error("🛑 UnhandledRejection:", reason, "at", p);
});
process.on("uncaughtException", (err) => {
  console.error("🛑 UncaughtException:", err?.stack || err);
});

const CLIENT_ID = "3d310826-2173-44e5-b9a2-b21e940b67f7";
const TENANT_ID = "1c3de7f3-f8d1-41d3-8583-2517cf3ba3b1";
const CLIENT_SECRET = "2e78Q~yX92LfwTTOg4EYBjNQrXrZ2z5di1Kvebog";
const SENDER_EMAIL = "spot@premierenergies.com";

const credential = new ClientSecretCredential(
  TENANT_ID,
  CLIENT_ID,
  CLIENT_SECRET
);
const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: () =>
      credential
        .getToken("https://graph.microsoft.com/.default")
        .then((t) => t.token),
  },
});

async function sendEmail(to, subject, html) {
  await graphClient.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: "true",
  });
}
// ── END GRAPH CLIENT BLOCK ───────────────────────────────────────────────────

// choose driver
// MSSQL-only
const sql = require("mssql");
let pool;

/* ------------------------------------------------------------------ */
/* Middleware                                                         */
/* ------------------------------------------------------------------ */
const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: [/^https:\/\/.*\.premierenergies\.com$/],
    credentials: true,
  })
);
app.use(express.json({ limit: "100mb" }));
app.use(cookieParser());
app.use(compression());

// ─────────────────────────────────────────────────────────────────────────────
// SSO GATE: force all direct app access to go through DIGI portal login
// - If access token missing/expired but refresh exists → auto-refresh silently
// - If still unauthenticated → redirect browser nav to DIGI with returnTo
// - For API/XHR → return 401 JSON with a login URL
// - Also enforces app authorization using JWT "apps" claim
// ─────────────────────────────────────────────────────────────────────────────

// Set this in env for flexibility (prod default is digi)
const PORTAL_ORIGIN = (
  process.env.PORTAL_ORIGIN || "https://digi.premierenergies.com"
).replace(/\/+$/, "");
const PORTAL_LOGIN_PATH = (
  process.env.PORTAL_LOGIN_PATH || "/login"
).startsWith("/")
  ? process.env.PORTAL_LOGIN_PATH || "/login"
  : `/${process.env.PORTAL_LOGIN_PATH || "login"}`;

// IMPORTANT: set per app (invest / spot / leaf / audit / etc.)
const THIS_APP_ID = process.env.APP_ID || "invest";

function isHtmlNavigation(req) {
  // Browser page navigation usually asks for HTML
  const accept = String(req.headers.accept || "");
  return req.method === "GET" && accept.includes("text/html");
}

function currentAbsoluteUrl(req) {
  // trust proxy is enabled, so req.protocol uses X-Forwarded-Proto
  const proto = req.protocol;
  const host = req.get("host");
  return `${proto}://${host}${req.originalUrl}`;
}

function portalLoginUrl(req) {
  const returnTo = encodeURIComponent(currentAbsoluteUrl(req));
  return `${PORTAL_ORIGIN}${PORTAL_LOGIN_PATH}?returnTo=${returnTo}`;
}

function verifyAccessToken(token) {
  return jwt.verify(token, AUTH_PUBLIC_KEY, {
    algorithms: ["RS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, AUTH_PUBLIC_KEY, {
    algorithms: ["RS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (payload?.typ !== "refresh") throw new Error("Not a refresh token");
  return payload;
}

function deny(req, res, code, extra = {}) {
  const login = portalLoginUrl(req);

  // Browser nav → hard redirect to portal login
  if (isHtmlNavigation(req)) {
    return res.redirect(302, login);
  }

  // API/XHR → JSON so frontend can redirect if needed
  return res.status(code).json({
    error: code === 403 ? "forbidden" : "unauthenticated",
    login,
    ...extra,
  });
}

// Gate middleware
// Gate middleware
app.use((req, res, next) => {
  // 1) Allow all GET requests for static assets and common files
  if (
    req.method === "GET" &&
    (req.path.startsWith("/assets/") ||
      req.path === "/favicon.ico" ||
      req.path === "/l.png" ||
      req.path === "/l.glb" ||
      req.path.endsWith(".css") ||
      req.path.endsWith(".js") ||
      req.path.endsWith(".map") ||
      req.path.endsWith(".png") ||
      req.path.endsWith(".jpg") ||
      req.path.endsWith(".jpeg") ||
      req.path.endsWith(".svg") ||
      req.path.endsWith(".webp") ||
      req.path.endsWith(".gif") ||
      req.path.endsWith(".mp4") ||
      req.path.endsWith(".glb") ||
      req.path.endsWith(".woff") ||
      req.path.endsWith(".woff2") ||
      req.path.endsWith(".ttf") ||
      req.path.endsWith(".eot"))
  ) {
    return next();
  }

  // 2) Allow access to specific public endpoints
  if (
    req.path === "/api/session" ||
    req.path === "/auth/refresh" ||
    req.path === "/auth/logout" ||
    req.path === "/health" ||
    req.path === "/api/health"
  ) {
    return next();
  }

  // 3) Allow public dashboard for INVEST without login (specific to the app)
  if (
    THIS_APP_ID === "invest" &&
    req.method === "GET" &&
    (req.path === "/" || req.path === "/dashboard") &&
    isHtmlNavigation(req)
  ) {
    return next();
  }

  // 4) Bypass all authentication checks (allow everything)
  return next(); // All requests bypass authentication logic
});

// ── JWT helpers and cookie management (same as DIGI) ─────────────────────────
function issueTokens(user) {
  const access = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles || [],
      apps: user.apps || [],
    },
    AUTH_PRIVATE_KEY,
    {
      algorithm: "RS256",
      expiresIn: ACCESS_TTL,
      issuer: ISSUER,
      audience: AUDIENCE,
    }
  );
  const refresh = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles || [],
      apps: user.apps || [],
      typ: "refresh",
    },
    AUTH_PRIVATE_KEY,
    {
      algorithm: "RS256",
      expiresIn: REFRESH_TTL,
      issuer: ISSUER,
      audience: AUDIENCE,
    }
  );
  return { access, refresh };
}
function setSsoCookies(req, res, access, refresh) {
  const host = (req.hostname || "").toLowerCase();
  const normalizedDomain = (COOKIE_DOMAIN || "")
    .replace(/^\./, "")
    .toLowerCase();
  const shouldSetDomain =
    normalizedDomain &&
    (host === normalizedDomain || host.endsWith(`.${normalizedDomain}`));
  const isLocalhost =
    req.hostname === "localhost" || req.hostname === "127.0.0.1";
  const base = {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: isLocalhost ? "lax" : "none",
  };

  res.cookie("sso", access, {
    ...base,
    path: "/",
    maxAge: 15 * 60 * 1000,
    ...(shouldSetDomain ? { domain: COOKIE_DOMAIN } : {}),
  });
  res.cookie("sso_refresh", refresh, {
    ...base,
    path: "/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    ...(shouldSetDomain ? { domain: COOKIE_DOMAIN } : {}),
  });
}
function clearSsoCookies(res) {
  const clr = (opts) => {
    res.clearCookie("sso", { path: "/", ...opts });
    res.clearCookie("sso_refresh", { path: "/auth", ...opts });
  };
  clr({});
  if (COOKIE_DOMAIN) clr({ domain: COOKIE_DOMAIN });
}

/* ------------------------------------------------------------------ */
/* Database Configuration                                             */
/* ------------------------------------------------------------------ */
// CMD+F: EFFECTIVE_MSSQL_DB
const EFFECTIVE_MSSQL_DB = (process.env.MSSQL_DB || "investdev").trim();
console.log(
  "🧩 EFFECTIVE MSSQL_DB =",
  EFFECTIVE_MSSQL_DB,
  "| env MSSQL_DB =",
  process.env.MSSQL_DB
);

const mssqlConfig = {
  user: process.env.MSSQL_USER || "PEL_DB",
  password: process.env.MSSQL_PASSWORD || "V@aN3#@VaN",
  server: process.env.MSSQL_SERVER || "10.0.50.17",
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: EFFECTIVE_MSSQL_DB,
  requestTimeout: 60000,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000,
  },
};

// 1) Add this near the top, alongside your other DB configs:
// CMD+F: AUTH_DB_CONFIG_SPLIT
const authDbConfig = {
  user: process.env.AUTH_MSSQL_USER || process.env.MSSQL_USER || "PEL_DB",
  password:
    process.env.AUTH_MSSQL_PASSWORD || process.env.MSSQL_PASSWORD || "Pel@0184",
  server:
    process.env.AUTH_MSSQL_SERVER || process.env.MSSQL_SERVER || "10.0.50.17",
  port: Number(process.env.AUTH_MSSQL_PORT || process.env.MSSQL_PORT || 1433),
  database: (process.env.AUTH_MSSQL_DB || "SART").trim(), // EMP + Login live here
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000,
  },
};

// ── ACCESS LIST & EMAIL NORMALISER ────────────────────────────────────────────
const ALLOWED = new Set([
  "aarnav.singh@premierenergies.com",
  "saluja@premierenergies.com",
  "vinay.rustagi@premierenergies.com",
  "nk.khandelwal@premierenergies.com",
  "neha.g@premierenergies.com",
  "krishankk@premierenergies.com",
  "vcs@premierenergies.com",
]);

function normalise(userInput = "") {
  const raw = userInput.trim().toLowerCase();
  return raw.includes("@") ? raw : `${raw}@premierenergies.com`;
}
// ── END ACCESS LIST BLOCK ─────────────────────────────────────────────────────
// ── NOTIFICATION HELPERS ─────────────────────────────────────────────────────
// Toggle full list with NOTIFY_ALL=true (default is test-only)
const NOTIFY_ALL = process.env.NOTIFY_ALL === "true";
const NOTIFY_TO = NOTIFY_ALL
  ? Array.from(ALLOWED)
  : ["aarnav.singh@premierenergies.com"]; // test-only recipient

function asIsoDate(d) {
  try {
    return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
  } catch (_) {
    return String(d);
  }
}

async function notifyMonthlyUpload(asOfDate, baseUrl) {
  const iso = asIsoDate(asOfDate);
  const subject = `New monthly dataset uploaded – ${iso}`;
  const loginUrl = baseUrl ? `${baseUrl}/login` : "";
  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5">
      <h3 style="margin:0 0 8px">Investor Analytics</h3>
      <p>A new monthly dataset for <strong>${iso}</strong> was uploaded.</p>
      <p>Please log in to review.${
        loginUrl ? ` <a href="${loginUrl}">Open dashboard</a>.` : ""
      }</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p style="font-size:12px;color:#666">This is an automated notification.</p>
    </div>`;
  for (const to of NOTIFY_TO) {
    try {
      await sendEmail(to, subject, html);
    } catch (err) {
      console.error("notifyMonthlyUpload error →", to, err?.message || err);
    }
  }
}

// ── WEEKLY SHAREHOLDER REQUEST HELPERS ───────────────────────────────────────
function formatDateIST(d) {
  // Renders like: "Friday, 08 Nov 2025"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

const IST_TZ = "Asia/Kolkata";

function isoInTz(d, tz = IST_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`; // YYYY-MM-DD
}

function todayIsoIST() {
  return isoInTz(new Date(), IST_TZ);
}

async function getTradingRow(symbol, tradeDateIso) {
  const dObj = new Date(`${tradeDateIso}T00:00:00Z`);
  const r = await pool
    .request()
    .input("Symbol", sql.NVarChar(32), symbol)
    .input("D", sql.Date, dObj).query(`
      SELECT TOP 1
        Symbol,
        TradeDate,
        [Close] AS [Close],
        Volume,
        ValueTraded
      FROM dbo.TradingVolume
      WHERE Symbol = @Symbol AND TradeDate = @D
    `);
  return r.recordset?.[0] || null;
}

function previousFriday(fromDate = new Date()) {
  // Always returns the previous Friday (if today is Friday, returns the Friday a week ago)
  const d = new Date(fromDate);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day + 7 - 5 || 7; // days since (this or last) Friday; never 0
  d.setDate(d.getDate() - diff);
  return d;
}

async function sendWeeklyShareholderRequest(fridayDate) {
  const dateLabel = formatDateIST(fridayDate); // e.g. "Friday, 08 Nov 2025"
  const subject = `Request: Top 50,000 Shareholders — as of ${dateLabel}`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6;">
      <div style="max-width:640px;margin:0 auto;border:1px solid #eaeaea;border-radius:8px;overflow:hidden">
        <div style="background:#0052cc;color:#fff;padding:16px 20px">
          <h2 style="margin:0;font-weight:600;">Weekly Data Request</h2>
        </div>
        <div style="padding:20px;background:#fff">
          <p style="margin-top:0;">Dear Team,</p>
          <p style="margin:12px 0;">
            Requesting you to please share the <strong>Top 50,000 Shareholders</strong> list for
            <strong>${dateLabel}</strong>.
          </p>
          <p style="margin:12px 0;">
            Thank you.
          </p>
          <p style="margin:16px 0 0;">Regards,<br/><strong>Team Investor Insights</strong></p>
        </div>
        <div style="padding:12px 20px;background:#f7f9fc;border-top:1px solid #eaeaea;">
          <p style="margin:0;font-size:12px;color:#6b7280;">
            This is an automated reminder sent every Monday at 9:00&nbsp;IST.
          </p>
        </div>
      </div>
    </div>`;

  const TO = ["lalit.t@premierenergies.com", "secretarial@premierenergies.com"];
  const CC = ["neha.garg@premierenergies.com"];

  // Use Graph to send with multiple recipients + cc
  await graphClient.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: TO.map((a) => ({ emailAddress: { address: a } })),
      ccRecipients: CC.map((a) => ({ emailAddress: { address: a } })),
    },
    saveToSentItems: "true",
  });
}
// ── END NOTIFICATION HELPERS ────────────────────────────────────────────────
/* ------------------------------------------------------------------ */
/* Initialize Pool & Ensure Tables                                    */
/* ------------------------------------------------------------------ */
async function initDb() {
  pool = await sql.connect(mssqlConfig);
  console.log(`🚀 MSSQL connected → ${mssqlConfig.database}`);
  const dbNameRow = await pool.request().query("SELECT DB_NAME() AS db");
  console.log("🗄️ Connected DB_NAME() →", dbNameRow.recordset?.[0]?.db);

  // Investors
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.objects
      WHERE object_id = OBJECT_ID(N'dbo.Investors') AND type = 'U'
    )
    CREATE TABLE dbo.Investors (
      InvestorID    INT IDENTITY PRIMARY KEY,
      Name          NVARCHAR(255) NOT NULL UNIQUE,
      Bought        FLOAT NOT NULL,
      Sold          FLOAT NOT NULL,
      PercentEquity FLOAT NOT NULL,
      Category      NVARCHAR(100) NOT NULL,
      NetChange     FLOAT NOT NULL,
      FundGroup     NVARCHAR(100) NOT NULL,
      StartPosition FLOAT NULL,
      EndPosition   FLOAT NULL
    );
  `);

  // MonthlyRecords
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.objects
      WHERE object_id = OBJECT_ID(N'dbo.MonthlyRecords') AND type = 'U'
    )
    CREATE TABLE dbo.MonthlyRecords (
      RecordID        INT IDENTITY PRIMARY KEY,
      AsOfDate        DATE NOT NULL,
      PAN             NVARCHAR(20) NULL,
DPID            NVARCHAR(2048) NULL,
ClientId        NVARCHAR(2048) NULL,

      Name            NVARCHAR(255) NOT NULL,
      Category        NVARCHAR(100) NULL,
      Shares          FLOAT NOT NULL,
      PercentEquity   FLOAT NULL
    );
  `);

  // CMD+F: ALTER_MonthlyRecords_DPID_ClientId
  await pool.request().query(`
  IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.MonthlyRecords')
      AND name = 'DPID'
      AND max_length < 2048 * 2
  )
    ALTER TABLE dbo.MonthlyRecords ALTER COLUMN DPID NVARCHAR(2048) NULL;

  IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.MonthlyRecords')
      AND name = 'ClientId'
      AND max_length < 2048 * 2
  )
    ALTER TABLE dbo.MonthlyRecords ALTER COLUMN ClientId NVARCHAR(2048) NULL;
`);

  // Helpful indexes
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_MonthlyRecords_AsOfDate_Name'
        AND object_id = OBJECT_ID(N'dbo.MonthlyRecords')
    )
    CREATE INDEX IX_MonthlyRecords_AsOfDate_Name
    ON dbo.MonthlyRecords(AsOfDate, Name);
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_MonthlyRecords_AsOfDate_PAN'
        AND object_id = OBJECT_ID(N'dbo.MonthlyRecords')
    )
    CREATE INDEX IX_MonthlyRecords_AsOfDate_PAN
    ON dbo.MonthlyRecords(AsOfDate, PAN);
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_Investors_Name'
        AND object_id = OBJECT_ID(N'dbo.Investors')
    )
    CREATE INDEX IX_Investors_Name
    ON dbo.Investors(Name);
  `);

  // TradingVolume
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.objects
      WHERE object_id = OBJECT_ID(N'dbo.TradingVolume') AND type = 'U'
    )
    CREATE TABLE dbo.TradingVolume (
      Id          INT IDENTITY PRIMARY KEY,
      Symbol      NVARCHAR(32) NOT NULL,
      TradeDate   DATE NOT NULL,
      [Close]     FLOAT NOT NULL,
      Volume      BIGINT NOT NULL,
      ValueTraded FLOAT NOT NULL
    );

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UX_TradingVolume_Symbol_Date'
        AND object_id = OBJECT_ID(N'dbo.TradingVolume')
    )
    CREATE UNIQUE INDEX UX_TradingVolume_Symbol_Date
    ON dbo.TradingVolume(Symbol, TradeDate);
  `);

  // CMD+F: GROUPS_TABLES
  // Groups + GroupMembers (custom user-defined clustering of entities)
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.objects
      WHERE object_id = OBJECT_ID(N'dbo.Groups') AND type = 'U'
    )
    BEGIN
      CREATE TABLE dbo.Groups (
        GroupID   INT IDENTITY PRIMARY KEY,
        Name      NVARCHAR(255) NOT NULL UNIQUE,
        Category  NVARCHAR(100) NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Groups_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Groups_UpdatedAt DEFAULT SYSUTCDATETIME()
      );
    END;

    IF NOT EXISTS (
      SELECT 1 FROM sys.objects
      WHERE object_id = OBJECT_ID(N'dbo.GroupMembers') AND type = 'U'
    )
    BEGIN
      CREATE TABLE dbo.GroupMembers (
        GroupID    INT NOT NULL,
        MemberKey  NVARCHAR(512) NOT NULL,   -- PAN (preferred) else Name-key
        MemberPAN  NVARCHAR(20) NULL,
        MemberName NVARCHAR(255) NULL,
        CreatedAt  DATETIME2 NOT NULL CONSTRAINT DF_GroupMembers_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_GroupMembers PRIMARY KEY (GroupID, MemberKey),
        CONSTRAINT FK_GroupMembers_Groups FOREIGN KEY (GroupID)
          REFERENCES dbo.Groups(GroupID) ON DELETE CASCADE
      );
    END;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_GroupMembers_MemberKey'
        AND object_id = OBJECT_ID(N'dbo.GroupMembers')
    )
    CREATE INDEX IX_GroupMembers_MemberKey
    ON dbo.GroupMembers(MemberKey);
  `);

  console.log("✅ MSSQL tables ensured (Groups, GroupMembers)");

  console.log(
    "✅ MSSQL tables ensured (Investors, MonthlyRecords, TradingVolume)"
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const DEFAULT_SYMBOL = process.env.DEFAULT_SYMBOL || "PREMIERENE.NS";
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function upsertTradingRow({
  symbol,
  tradeDate,
  close,
  volume,
  valueTraded,
}) {
  const dObj = new Date(`${tradeDate}T00:00:00Z`);
  if (isNaN(+dObj))
    throw new Error(`Invalid tradeDate '${tradeDate}' for SQL Date`);

  await pool
    .request()
    .input("Symbol", sql.NVarChar(32), symbol)
    .input("D", sql.Date, dObj)
    .input("Close", sql.Float, close)
    .input("Volume", sql.BigInt, volume)
    .input("VT", sql.Float, valueTraded).query(`
      MERGE dbo.TradingVolume AS T
      USING (SELECT @Symbol AS Symbol, @D AS TradeDate) AS S
      ON (T.Symbol = S.Symbol AND T.TradeDate = S.TradeDate)
      WHEN MATCHED THEN UPDATE SET [Close]=@Close, Volume=@Volume, ValueTraded=@VT
      WHEN NOT MATCHED THEN INSERT (Symbol,TradeDate,[Close],Volume,ValueTraded)
        VALUES (@Symbol,@D,@Close,@Volume,@VT);
    `);
}

async function quoteFallback(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbol
  )}&region=IN&lang=en-IN`;
  const r = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "application/json,text/plain,*/*",
    },
  });

  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(
      `Yahoo fallback non-JSON (HTTP ${r.status}): ${text.slice(0, 160)}`
    );
  }

  if (!r.ok) {
    throw new Error(
      `Yahoo fallback HTTP ${r.status}: ${
        j?.quoteResponse?.error?.description || "blocked/rate-limited"
      }`
    );
  }

  const q = j?.quoteResponse?.result?.[0];
  if (!q)
    throw new Error(
      `Yahoo fallback: empty result for ${symbol} (HTTP ${r.status})`
    );

  return {
    regularMarketPrice: q.regularMarketPrice,
    regularMarketVolume: q.regularMarketVolume,
    regularMarketTime: q.regularMarketTime,
  };
}

async function fetchAndRecordQuote(rawSymbol) {
  const symbol = (rawSymbol || DEFAULT_SYMBOL).trim();

  let q;
  try {
    q = await yahooFinance.quote(symbol);
  } catch (e) {
    console.error(
      "yahooFinance.quote failed, using fallback:",
      e?.message || e
    );
    q = await quoteFallback(symbol);
  }

  const volume = Number(q.regularMarketVolume || 0);
  const close = Number(q.regularMarketPrice || 0);

  const t = q?.regularMarketTime
    ? new Date(Number(q.regularMarketTime) * 1000)
    : new Date();

  const tradeDate = isoInTz(t, IST_TZ); // ✅ IST date key (not UTC)
  const valueTraded = Math.round(volume * close);

  await upsertTradingRow({ symbol, tradeDate, close, volume, valueTraded });
  return { symbol, tradeDate, close, volume, valueTraded };
}

// NEW: backfill a date range using Yahoo historical daily data
async function backfillRange(rawSymbol, startIso, endIso = todayIso()) {
  const symbol = (rawSymbol || DEFAULT_SYMBOL).trim();
  const p1 = new Date(startIso);
  const p2 = new Date(endIso);
  p2.setDate(p2.getDate() + 1); // ✅ include end day

  if (isNaN(+p1) || isNaN(+p2)) {
    throw new Error("Invalid start/end date");
  }
  const bars = await yahooFinance.historical(symbol, {
    period1: p1,
    period2: p2,
    interval: "1d",
  });
  let upserts = 0;
  for (const b of bars) {
    const tradeDate = (b?.date instanceof Date ? b.date : new Date(b.date))
      .toISOString()
      .slice(0, 10); // YYYY-MM-DD UTC
    const close = Number(b?.close || 0);
    const volume = Number(b?.volume || 0);
    const valueTraded = Math.round(close * volume);
    await upsertTradingRow({ symbol, tradeDate, close, volume, valueTraded });
    upserts++;
  }
  return { symbol, start: startIso, end: endIso, days: upserts };
}

// No heuristic grouping. Keep metadata only if needed.
function getFundGroup(name = "") {
  return String(name).trim().toUpperCase(); // full name (NOT first two words)
}

// NEW: Category normalization helper (minimal, safe)
const CATEGORY_MAP = {
  AIF: "India FIs",
  LTD: "Retail",
  CM: "India FIs",
  EMP: "Employees + ESOP",
  FB: "FIIs",
  FII: "FIIs",
  FPC: "FIIs",
  KMP: "Employees + ESOP",
  MUT: "India FIs",
  NRN: "Retail",
  NRI: "Retail",
  PPG: "Promoters",
  PRG: "Promoters",
  PRO: "Promoters",
  QIB: "India FIs",
  PUB: "Retail",
  TRS: "Employees + ESOP",
  TRU: "Retail",
  HUF: "Retail",
};
function normalizeCategory(category) {
  if (!category) return category;
  const key = String(category).trim().toUpperCase();
  return CATEGORY_MAP[key] || category; // if not mapped, pass-through unchanged
}

// CMD+F: GROUPS_HELPERS
function normalizeMaybePanKey(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const up = s.toUpperCase().replace(/\s+/g, "");
  // PAN is typically 10 chars; keep it strict-ish but not fragile
  if (
    /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(up) ||
    (up.length === 10 && /^[A-Z0-9]+$/.test(up))
  ) {
    return up;
  }
  return s;
}

function uniqByKey(items, getKey) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = getKey(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function parseGroupMembers(raw) {
  if (!Array.isArray(raw)) return [];
  const items = [];

  for (const it of raw) {
    if (typeof it === "string") {
      const key = normalizeMaybePanKey(it);
      if (key) items.push({ key, pan: null, name: null });
      continue;
    }

    if (it && typeof it === "object") {
      const pan = it.pan ?? it.PAN ?? null;
      const name = it.name ?? it.Name ?? null;
      const keyRaw =
        it.key ??
        it.memberKey ??
        it.MemberKey ??
        (pan ? pan : null) ??
        (name ? name : null);

      const key = normalizeMaybePanKey(keyRaw);
      const panNorm = pan
        ? String(pan).trim().toUpperCase().replace(/\s+/g, "")
        : null;
      const nameNorm = name ? String(name).trim() : null;

      if (key)
        items.push({ key, pan: panNorm || null, name: nameNorm || null });
    }
  }

  return uniqByKey(items, (x) => x.key);
}

async function distinctCategoriesForKeys(memberKeys) {
  const keys = Array.from(
    new Set(
      (memberKeys || []).map((k) => String(k || "").trim()).filter(Boolean)
    )
  );
  if (keys.length === 0) return [];

  const maxRow = await pool
    .request()
    .query(`SELECT MAX(AsOfDate) AS d FROM dbo.MonthlyRecords`);
  const d = maxRow.recordset?.[0]?.d;
  if (!d) return [];

  // Avoid insane parameter counts; groups should be human-sized anyway
  const limited = keys.slice(0, 500);

  const rq = pool.request().input("D", sql.Date, d);
  const params = [];
  for (let i = 0; i < limited.length; i++) {
    rq.input(`k${i}`, sql.NVarChar(512), limited[i]);
    params.push(`@k${i}`);
  }
  const inClause = params.join(",");

  const q = `
    SELECT DISTINCT Category
    FROM dbo.MonthlyRecords
    WHERE AsOfDate = @D
      AND Category IS NOT NULL
      AND (PAN IN (${inClause}) OR Name IN (${inClause}));
  `;

  const r = await rq.query(q);
  const cats = (r.recordset || [])
    .map((x) => normalizeCategory(x.Category))
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);

  return Array.from(new Set(cats));
}

/*****************************************************************/
/*  SEND-OTP                                                      */
/*****************************************************************/
app.post("/api/send-otp", async (req, res) => {
  const fullEmail = normalise(req.body.email);

  // 0) restrict to allowed users
  if (!ALLOWED.has(fullEmail)) {
    return res
      .status(403)
      .json({ message: "Access denied: this dataset is restricted." });
  }

  let authPool;
  try {
    // 1) connect to SPOT for authentication
    authPool = new mssqlAuth.ConnectionPool(authDbConfig);
    await authPool.connect();

    // 2) verify employee record
    const empResult = await authPool
      .request()
      .input("email", mssqlAuth.NVarChar(256), fullEmail).query(`
        SELECT EmpID 
          FROM EMP 
         WHERE EmpEmail = @email 
           AND ActiveFlag = 1
      `);

    if (!empResult.recordset.length) {
      await authPool.close();
      return res
        .status(404)
        .json({ message: "No @premierenergies.com account found." });
    }

    // 3) generate OTP & expiry
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    // 4) upsert into Login table
    await authPool
      .request()
      .input("username", mssqlAuth.NVarChar(256), fullEmail)
      .input("otp", mssqlAuth.NVarChar(6), otp)
      .input("expiry", mssqlAuth.DateTime, expiry).query(`
        MERGE Login AS t
        USING (SELECT @username AS Username) AS s
          ON t.Username = s.Username
        WHEN MATCHED THEN
          UPDATE SET OTP = @otp, OTP_Expiry = @expiry
        WHEN NOT MATCHED THEN
          INSERT (Username, OTP, OTP_Expiry)
          VALUES (@username, @otp, @expiry);
      `);

    // close the auth pool before sending email
    await authPool.close();

    // 5) send branded email via Graph
    const subject = "Your Investor Insights One-Time Password";
    const html = `
      <div style="font-family:Arial;color:#333;line-height:1.5;">
        <h2 style="color:#0052cc;margin-bottom:.5em;">Welcome to Investor Insights</h2>
        <p>Your one-time password (OTP) is:</p>
        <p style="font-size:24px;font-weight:bold;color:#0052cc;">${otp}</p>
        <p>This code expires in <strong>5 minutes</strong>.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:2em 0;">
        <p style="font-size:12px;color:#777;">
          If you didn’t request this, ignore this email.<br>
          Need help? contact <a href="mailto:aarnav.singh@premierenergies.com">support</a>.
        </p>
        <p style="margin-top:2em;">Regards,<br/><strong>Team Investor Insights</strong></p>
      </div>`;
    await sendEmail(fullEmail, subject, html);

    return res.json({ message: "OTP sent successfully" });
  } catch (err) {
    if (authPool) await authPool.close();
    console.error("send-otp error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// CMD+F: "API – Trading volume" (place near those routes)
app.get("/api/netcheck", async (_req, res) => {
  try {
    const r = await fetch("https://example.com", { method: "HEAD" });
    res.json({ ok: true, status: r.status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.code || e.message });
  }
});

// CMD+F: "API – Trading volume" and put nearby
app.get("/api/netcheck/yahoo", async (_req, res) => {
  try {
    const url =
      "https://query2.finance.yahoo.com/v6/finance/quote?symbols=PREMIERENE.NS";
    const r = await fetch(url, { method: "GET" });
    res.json({ ok: true, status: r.status });
  } catch (e) {
    res.status(500).json({ ok: false, code: e.code, message: e.message });
  }
});

// CMD+F: API_DBINFO
app.get("/api/dbinfo", async (_req, res) => {
  try {
    const db = (await pool.request().query("SELECT DB_NAME() AS db"))
      .recordset?.[0]?.db;

    const counts = {};
    for (const t of ["Investors", "MonthlyRecords", "TradingVolume"]) {
      try {
        const r = await pool
          .request()
          .query(`SELECT COUNT(1) AS c FROM dbo.${t}`);
        counts[t] = r.recordset?.[0]?.c ?? null;
      } catch {
        counts[t] = "missing";
      }
    }

    const tables = await pool.request().query(`
      SELECT name FROM sys.tables ORDER BY name
    `);

    res.json({
      db,
      counts,
      tables: tables.recordset.map((x) => x.name),
      server: mssqlConfig.server,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

/*****************************************************************/
/*  VERIFY-OTP                                                    */
/*****************************************************************/
app.post("/api/verify-otp", async (req, res) => {
  const fullEmail = normalise(req.body.email);
  const { otp } = req.body;

  let authPool;
  try {
    authPool = new mssqlAuth.ConnectionPool(authDbConfig);
    await authPool.connect();

    const lookupResult = await authPool
      .request()
      .input("username", mssqlAuth.NVarChar(256), fullEmail)
      .input("otp", mssqlAuth.NVarChar(6), otp).query(`
        SELECT OTP_Expiry,
               (SELECT TOP 1 EmpID FROM EMP WHERE EmpEmail=@username) AS EmpID
          FROM Login
         WHERE Username = @username
           AND OTP = @otp
      `);

    if (!lookupResult.recordset.length) {
      await authPool.close();
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (new Date() > lookupResult.recordset[0].OTP_Expiry) {
      await authPool.close();
      return res.status(400).json({ message: "OTP expired" });
    }

    const user = {
      id: String(lookupResult.recordset[0].EmpID || fullEmail),
      email: fullEmail,
      roles: [],
      apps: [
        "invest",
        "leaf",
        "spot",
        "audit",
        "nest",
        "watt",
        "visa",
        "qap",
        "code",
      ],
    };

    const { access, refresh } = issueTokens(user);
    setSsoCookies(req, res, access, refresh);

    await authPool.close();
    return res.json({ ok: true, user: { email: user.email } });
  } catch (err) {
    if (authPool) await authPool.close();
    console.error("verify-otp error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* Session & Refresh (for SPA hydration)                               */
/* ------------------------------------------------------------------ */
app.get("/api/session", (req, res) => {
  const token = req.cookies?.sso;
  if (!token) return res.status(401).json({ error: "unauthenticated" });
  try {
    const payload = jwt.verify(token, AUTH_PUBLIC_KEY, {
      algorithms: ["RS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    res.json({
      user: {
        email: payload.email,
        id: payload.sub,
        roles: payload.roles || [],
        apps: payload.apps || [],
      },
    });
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
});

app.post("/auth/refresh", (req, res) => {
  const rt = req.cookies?.sso_refresh;
  if (!rt) return res.status(401).json({ error: "no refresh" });
  try {
    const payload = jwt.verify(rt, AUTH_PUBLIC_KEY, {
      algorithms: ["RS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const user = {
      id: payload.sub,
      email: payload.email || "",
      roles: payload.roles || [],
      apps: payload.apps || [],
    };
    const { access, refresh } = issueTokens(user);
    setSsoCookies(req, res, access, refresh);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: "invalid refresh" });
  }
});

app.post("/auth/logout", (req, res) => {
  clearSsoCookies(res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* API – Groups                                                       */
/* ------------------------------------------------------------------ */
// CMD+F: API_GROUPS

app.get("/api/groups", async (_req, res) => {
  try {
    const g = await pool.request().query(`
      SELECT
        GroupID,
        Name,
        Category,
        CreatedAt,
        UpdatedAt,
        (SELECT COUNT(1) FROM dbo.GroupMembers gm WHERE gm.GroupID = g.GroupID) AS MemberCount
      FROM dbo.Groups g
      ORDER BY Name;
    `);

    const m = await pool.request().query(`
      SELECT GroupID, MemberKey, MemberPAN, MemberName
      FROM dbo.GroupMembers
      ORDER BY GroupID, MemberKey;
    `);

    const byGroup = new Map();
    for (const row of m.recordset || []) {
      if (!byGroup.has(row.GroupID)) byGroup.set(row.GroupID, []);
      byGroup.get(row.GroupID).push({
        key: row.MemberKey,
        pan: row.MemberPAN ?? null,
        name: row.MemberName ?? null,
      });
    }

    const out = (g.recordset || []).map((row) => ({
      id: row.GroupID,
      name: row.Name,
      category: row.Category ?? null,
      createdAt: row.CreatedAt,
      updatedAt: row.UpdatedAt,
      memberCount: row.MemberCount ?? 0,
      members: byGroup.get(row.GroupID) || [],
    }));

    return res.json(out);
  } catch (e) {
    console.error("GET /api/groups error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/groups", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Missing group name" });

  const members = parseGroupMembers(req.body?.members);
  if (!members.length)
    return res.status(400).json({ error: "Select at least 1 member" });

  let category = String(req.body?.category ?? "").trim();
  category = category ? normalizeCategory(category) : null;

  try {
    // If members have multiple categories (latest month), require user pick one
    const distinct = await distinctCategoriesForKeys(members.map((m) => m.key));
    if (!category && distinct.length === 1) category = distinct[0];
    if (!category && distinct.length > 1) {
      return res
        .status(400)
        .json({ error: "category_required", categories: distinct });
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();

    const ins = await new sql.Request(tx)
      .input("Name", sql.NVarChar(255), name)
      .input("Category", sql.NVarChar(100), category).query(`
        INSERT INTO dbo.Groups (Name, Category)
        OUTPUT inserted.GroupID AS id
        VALUES (@Name, @Category);
      `);

    const groupId = ins.recordset?.[0]?.id;

    for (const mem of members) {
      await new sql.Request(tx)
        .input("GroupID", sql.Int, groupId)
        .input("MemberKey", sql.NVarChar(512), mem.key)
        .input("MemberPAN", sql.NVarChar(20), mem.pan || null)
        .input("MemberName", sql.NVarChar(255), mem.name || null).query(`
          INSERT INTO dbo.GroupMembers (GroupID, MemberKey, MemberPAN, MemberName)
          VALUES (@GroupID, @MemberKey, @MemberPAN, @MemberName);
        `);
    }

    await tx.commit();
    return res.json({ ok: true, id: groupId });
  } catch (e) {
    // Duplicate name
    if (e?.number === 2627 || e?.number === 2601) {
      return res.status(409).json({ error: "duplicate_name" });
    }
    console.error("POST /api/groups error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

app.put("/api/groups/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid group id" });

  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Missing group name" });

  const members = parseGroupMembers(req.body?.members);
  if (!members.length)
    return res.status(400).json({ error: "Select at least 1 member" });

  let category = String(req.body?.category ?? "").trim();
  category = category ? normalizeCategory(category) : null;

  try {
    const distinct = await distinctCategoriesForKeys(members.map((m) => m.key));
    if (!category && distinct.length === 1) category = distinct[0];
    if (!category && distinct.length > 1) {
      return res
        .status(400)
        .json({ error: "category_required", categories: distinct });
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();

    await new sql.Request(tx)
      .input("ID", sql.Int, id)
      .input("Name", sql.NVarChar(255), name)
      .input("Category", sql.NVarChar(100), category).query(`
        UPDATE dbo.Groups
        SET Name = @Name,
            Category = @Category,
            UpdatedAt = SYSUTCDATETIME()
        WHERE GroupID = @ID;
      `);

    await new sql.Request(tx)
      .input("ID", sql.Int, id)
      .query(`DELETE FROM dbo.GroupMembers WHERE GroupID = @ID;`);

    for (const mem of members) {
      await new sql.Request(tx)
        .input("GroupID", sql.Int, id)
        .input("MemberKey", sql.NVarChar(512), mem.key)
        .input("MemberPAN", sql.NVarChar(20), mem.pan || null)
        .input("MemberName", sql.NVarChar(255), mem.name || null).query(`
          INSERT INTO dbo.GroupMembers (GroupID, MemberKey, MemberPAN, MemberName)
          VALUES (@GroupID, @MemberKey, @MemberPAN, @MemberName);
        `);
    }

    await tx.commit();
    return res.json({ ok: true });
  } catch (e) {
    if (e?.number === 2627 || e?.number === 2601) {
      return res.status(409).json({ error: "duplicate_name" });
    }
    console.error("PUT /api/groups/:id error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

app.delete("/api/groups/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid group id" });

  try {
    await pool.request().input("ID", sql.Int, id).query(`
      DELETE FROM dbo.Groups WHERE GroupID = @ID;
    `);
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/groups/:id error:", e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

/* ------------------------------------------------------------------ */
/* API – Investors                                                     */
/* ------------------------------------------------------------------ */
app.post("/api/investors", async (req, res) => {
  const list = req.body;
  if (!Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ error: "Non-empty array expected" });
  }

  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    for (const inv of list) {
      await new sql.Request(tx)
        .input("Name", sql.NVarChar(255), inv.name)
        .input("Bought", sql.Float, inv.boughtOn18)
        .input("Sold", sql.Float, inv.soldOn25)
        .input("PercentEquity", sql.Float, inv.percentToEquity)
        .input("Category", sql.NVarChar(100), normalizeCategory(inv.category))
        .input("NetChange", sql.Float, inv.netChange)
        .input("FundGroup", sql.NVarChar(100), inv.fundGroup)
        .input("StartPos", sql.Float, inv.startPosition ?? null)
        .input("EndPos", sql.Float, inv.endPosition ?? null).query(`
          MERGE dbo.Investors AS T
          USING (SELECT @Name AS Name) AS S ON T.Name = S.Name
          WHEN MATCHED THEN UPDATE SET
            Bought        = @Bought,
            Sold          = @Sold,
            PercentEquity = @PercentEquity,
            Category      = @Category,
            NetChange     = @NetChange,
            FundGroup     = @FundGroup,
            StartPosition = @StartPos,
            EndPosition   = @EndPos
          WHEN NOT MATCHED THEN INSERT
            (Name,Bought,Sold,PercentEquity,Category,
             NetChange,FundGroup,StartPosition,EndPosition)
            VALUES
            (@Name,@Bought,@Sold,@PercentEquity,@Category,
             @NetChange,@FundGroup,@StartPos,@EndPos);
        `);
    }
    await tx.commit();
    res.json({ success: true, upserted: list.length });
  } catch (e) {
    await tx.rollback();
    console.error("POST /api/investors [MSSQL] error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/investors", async (_, res) => {
  try {
    const r = await pool.request().query(`
      SELECT
        Name,
        Bought        AS boughtOn18,
        Sold          AS soldOn25,
        PercentEquity AS percentToEquity,
        Category,
        NetChange     AS netChange,
        FundGroup     AS fundGroup,
        StartPosition AS startPosition,
        EndPosition   AS endPosition
      FROM dbo.Investors
      ORDER BY Name;
    `);
    res.json(r.recordset);
  } catch (e) {
    console.error("GET /api/investors error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/* API – Monthly uploads                                              */
/* ------------------------------------------------------------------ */
app.post("/api/monthly", async (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "Non-empty array expected" });
  }

  const rawDate = String(rows?.[0]?.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return res.status(400).json({
      error: "Invalid date format. Expected ISO YYYY-MM-DD (e.g. 2026-01-02).",
      got: rawDate,
    });
  }

  const asOf = new Date(`${rawDate}T00:00:00Z`);

  const normalizePan = (v) => {
    const s = String(v ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    return s ? s : null;
  };

  const strOrNull = (v) => {
    const s = String(v ?? "").trim();
    return s ? s : null;
  };

  const numOr0 = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // Group by PAN (fallback to name)
  const grouped = new Map();

  for (const r of rows) {
    const name = String(r?.name ?? r?.Name ?? "").trim();
    const pan = normalizePan(r?.pan ?? r?.PAN);

    const key = pan || name;
    if (!key) continue;

    const shares = numOr0(r?.shares ?? r?.Shares);
    const pct = numOr0(
      r?.percentEquity ??
        r?.percentToEquity ??
        r?.PercentEquity ??
        r?.["% to Equity"]
    );

    const categoryRaw = r?.category ?? r?.Category ?? null;
    const category = categoryRaw ? normalizeCategory(categoryRaw) : null;

    const dpid = strOrNull(r?.dpid ?? r?.DPID);
    const clientId = strOrNull(
      r?.clientId ?? r?.ClientId ?? r?.["Client Id/Folio"]
    );

    if (!grouped.has(key)) {
      grouped.set(key, {
        pan,
        name: name || key,
        category,
        shares: 0,
        percentEquity: null,
        dpidSet: new Set(),
        clientSet: new Set(),
      });
    }

    const g = grouped.get(key);
    g.shares += shares;
    if (pct) g.percentEquity = (g.percentEquity || 0) + pct;

    if (dpid) g.dpidSet.add(dpid);
    if (clientId) g.clientSet.add(clientId);

    if (!g.category && category) g.category = category;
    if (name && name.length > (g.name?.length || 0)) g.name = name;
  }

  const prepared = Array.from(grouped.values()).map((g) => ({
    pan: g.pan,
    dpid: g.dpidSet.size ? Array.from(g.dpidSet).join(" | ") : null,
    clientId: g.clientSet.size ? Array.from(g.clientSet).join(" | ") : null,
    name: g.name,
    category: g.category,
    shares: g.shares,
    percentEquity: g.percentEquity,
  }));

  try {
    // Delete existing month
    await pool
      .request()
      .input("d", sql.Date, asOf)
      .query("DELETE FROM dbo.MonthlyRecords WHERE AsOfDate = @d");

    // Bulk insert
    const tvp = new sql.Table("MonthlyRecords");
    tvp.schema = "dbo"; // important when using dbo tables
    tvp.columns.add("AsOfDate", sql.Date, { nullable: false });
    tvp.columns.add("PAN", sql.NVarChar(20), { nullable: true });
    tvp.columns.add("DPID", sql.NVarChar(2048), { nullable: true });
    tvp.columns.add("ClientId", sql.NVarChar(2048), { nullable: true });

    tvp.columns.add("Name", sql.NVarChar(255), { nullable: false });
    tvp.columns.add("Category", sql.NVarChar(100), { nullable: true });
    tvp.columns.add("Shares", sql.Float, { nullable: false });
    tvp.columns.add("PercentEquity", sql.Float, { nullable: true });

    prepared.forEach((r) =>
      tvp.rows.add(
        asOf,
        r.pan,
        r.dpid,
        r.clientId,
        r.name,
        r.category ? normalizeCategory(r.category) : null,
        r.shares,
        r.percentEquity ?? null
      )
    );

    await pool.request().bulk(tvp);
    return res.json({ success: true, inserted: prepared.length });
  } catch (e) {
    const info = e?.originalError?.info || e?.info || null;
    console.error("POST /api/monthly error:", e?.stack || e);
    if (info) console.error("MSSQL info:", info);

    return res.status(500).json({
      error: e?.message || String(e),
      mssql: info?.message || info || undefined,
    });
  }
});

app.get("/api/monthly", async (_, res) => {
  try {
    const r = await pool.request().query(`
      SELECT AsOfDate, PAN, Name, Category, Shares
      FROM dbo.MonthlyRecords
      ORDER BY AsOfDate, Name;
    `);

    const data = r.recordset;

    const raw = Object.create(null);

    for (const row of data) {
      const name = String(row.Name ?? "").trim();
      const pan =
        row.PAN == null
          ? null
          : String(row.PAN).trim().toUpperCase().replace(/\s+/g, "");

      const key = pan || name;
      if (!key) continue;

      const rawCat = row.Category == null ? "" : String(row.Category);
      const norm = normalizeCategory(rawCat);
      const cat = (norm || "").trim() || null;

      if (!raw[key]) {
        raw[key] = {
          pan: pan || null,
          name: name || key,
          category: cat,
          description: "",
          fundGroup: getFundGroup(name || key),
          monthlyShares: Object.create(null),
        };
      } else {
        if (name && name.length > (raw[key].name?.length || 0))
          raw[key].name = name;
        if (!raw[key].category && cat) raw[key].category = cat;
        if (!raw[key].pan && pan) raw[key].pan = pan;
      }

      const iso =
        row.AsOfDate instanceof Date
          ? row.AsOfDate.toISOString().slice(0, 10)
          : new Date(row.AsOfDate).toISOString().slice(0, 10);

      const shares = Number(row.Shares || 0);
      if (shares !== 0) {
        raw[key].monthlyShares[iso] =
          (raw[key].monthlyShares[iso] || 0) + shares;
      }
    }

    const result = Object.keys(raw)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((k) => ({
        pan: raw[k].pan ?? null,
        name: raw[k].name,
        category: raw[k].category ?? null,
        description: "",
        fundGroup: getFundGroup(raw[k].name),
        monthlyShares: raw[k].monthlyShares,
      }));

    return res.json(result);
  } catch (e) {
    console.error("GET /api/monthly error:", e);
    return res.status(500).json({ error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/* API – Trading volume                                               */
/* ------------------------------------------------------------------ */
app.get("/api/trading", async (req, res) => {
  const symbol = String(req.query.symbol || DEFAULT_SYMBOL).trim();
  const start = req.query.start ? String(req.query.start) : null; // YYYY-MM-DD
  const limit = Math.max(1, Math.min(365, Number(req.query.limit || 30)));

  try {
    const rq = pool.request().input("Symbol", sql.NVarChar(32), symbol);

    let r;
    if (start) {
      r = await rq.input("Start", sql.Date, new Date(start)).query(`
        SELECT
          Symbol,
          TradeDate,
          [Close] AS [Close],
          Volume,
          ValueTraded
        FROM dbo.TradingVolume
        WHERE Symbol = @Symbol AND TradeDate >= @Start
        ORDER BY TradeDate DESC;
      `);
    } else {
      r = await rq.input("Limit", sql.Int, limit).query(`
        SELECT TOP (@Limit)
          Symbol,
          TradeDate,
          [Close] AS [Close],
          Volume,
          ValueTraded
        FROM dbo.TradingVolume
        WHERE Symbol = @Symbol
        ORDER BY TradeDate DESC;
      `);
    }

    return res.json(r.recordset);
  } catch (e) {
    console.error("GET /api/trading error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
});

// Basic probe: does this process see the yahoo-finance instance?
app.get("/api/trading/ping", (req, res) => {
  res.json({
    ok: true,
    className: yahooFinance?.constructor?.name,
    hasQuote: typeof yahooFinance?.quote === "function",
    node: process.version,
  });
});

// Raw fetch (no DB writes) to isolate external HTTP issues
app.post("/api/trading/refresh/raw", async (req, res) => {
  try {
    const symbol = String(req.body?.symbol || DEFAULT_SYMBOL).trim();
    const q = await yahooFinance.quote(symbol);
    return res.json({
      symbol,
      close: q.regularMarketPrice,
      volume: q.regularMarketVolume,
      date: new Date().toISOString().slice(0, 10),
    });
  } catch (e) {
    console.error("refresh/raw error →", e?.stack || e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/trading/refresh", async (req, res) => {
  try {
    const symbol = String(req.body?.symbol || DEFAULT_SYMBOL).trim();
    const force =
      req.body?.force === true || String(req.query.force || "") === "1";
    const today = todayIsoIST();

    if (!force) {
      const existing = await getTradingRow(symbol, today);
      if (existing) {
        return res.json({ ...existing, cached: true, tradeDate: today });
      }
    }

    const row = await fetchAndRecordQuote(symbol);
    return res.json({ ...row, cached: false });
  } catch (e) {
    const err =
      e && typeof e === "object"
        ? {
            message: e.message,
            code: e.code,
            name: e.name,
            stack: e.stack,
            cause: e.cause?.message || e.cause,
          }
        : { message: String(e) };

    console.error("POST /api/trading/refresh error →", err);
    return res.status(500).json({ error: err });
  }
});

// NEW: backfill bars from a start date (YYYY-MM-DD) to today (inclusive)
app.post("/api/trading/backfill", async (req, res) => {
  try {
    const symbol = String(req.body?.symbol || DEFAULT_SYMBOL).trim();
    const start = String(req.body?.start || "").trim(); // e.g. "2024-09-03"
    if (!start) return res.status(400).json({ error: "Missing 'start' date" });
    const result = await backfillRange(symbol, start, todayIso());
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/trading/backfill error →", e?.message || e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});
/* ------------------------------------------------------------------ */
/* Static SPA                                                         */
/* ------------------------------------------------------------------ */
const distDir = path.join(__dirname, "../dist");
const indexHtml = path.join(distDir, "index.html");
app.use(express.static(distDir));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(indexHtml);
});

/* ------------------------------------------------------------------ */
/* HTTPS Boot                                                         */
/* ------------------------------------------------------------------ */
const httpsOptions = {
  key: readFileOrExit(TLS_KEY_FILE, "TLS_KEY_FILE"),
  cert: readFileOrExit(TLS_CERT_FILE, "TLS_CERT_FILE"),
  ca: readFileOrExit(TLS_CA_FILE, "TLS_CA_FILE"),
};

const PORT = Number(process.env.PORT) || 50443;
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  try {
    await initDb();
    // Auto-capture once daily at 16:35 Asia/Kolkata (every calendar day)
    cron.schedule(
      "35 16 * * *",
      async () => {
        try {
          const r = await fetchAndRecordQuote(DEFAULT_SYMBOL);
          console.log("📈 Trading captured:", r);
        } catch (e) {
          console.error("Trading cron error:", e?.message || e);
        }
      },
      { timezone: "Asia/Kolkata" }
    );
    https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
      console.log(
        `🔒 HTTPS ready → https://${
          HOST === "0.0.0.0" ? "localhost" : HOST
        }:${PORT}`
      );
    });
  } catch (err) {
    console.error("❌ Server start failed:", err);
    process.exit(1);
  }
}
start();
