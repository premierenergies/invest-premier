// server/server.cjs
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const mssql = require("mssql");            // only MSSQL now
const mssqlAuth = require("mssql");        // auth uses MSSQL

// ── HARD‑CODED CREDS & GRAPH CLIENT (once) ───────────────────────────────────
const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");
require("isomorphic-fetch");

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

const app = express();

/* ------------------------------------------------------------------ */
/* Middleware                                                         */
/* ------------------------------------------------------------------ */
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(compression());

/* ------------------------------------------------------------------ */
/* Database Configuration                                             */
/* ------------------------------------------------------------------ */
const mssqlConfig = {
  user: process.env.MSSQL_USER || "SPOT_USER",
  password: process.env.MSSQL_PASSWORD || "Marvik#72@",
  server: process.env.MSSQL_SERVER || "10.0.40.10",
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: process.env.MSSQL_DB || "SART",
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000,
  },
};

// // MySQL is no longer used:
// // const mysql = require("mysql2/promise");
// // const mysqlConfig = { /* ... */ };

/* ------------------------------------------------------------------ */
/* Auth DB Configuration                                              */
/* ------------------------------------------------------------------ */
const authDbConfig = {
  user: process.env.MSSQL_USER || "SPOT_USER",
  password: process.env.MSSQL_PASSWORD || "Marvik#72@",
  server: process.env.MSSQL_SERVER || "10.0.40.10",
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: "SPOT",
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
]);

function normalise(userInput = "") {
  const raw = userInput.trim().toLowerCase();
  return raw.includes("@") ? raw : `${raw}@premierenergies.com`;
}
// ── END ACCESS LIST BLOCK ─────────────────────────────────────────────────────

/* ------------------------------------------------------------------ */
/* Initialize Pool & Ensure Tables                                    */
/* ------------------------------------------------------------------ */
let pool;
async function initDb() {
  // only MSSQL branch retained:
  pool = await mssql.connect(mssqlConfig);
  console.log(`🚀 MSSQL connected → ${mssqlConfig.database}`);

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

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.objects
      WHERE object_id = OBJECT_ID(N'dbo.MonthlyRecords') AND type = 'U'
    )
    CREATE TABLE dbo.MonthlyRecords (
      RecordID  INT IDENTITY PRIMARY KEY,
      AsOfDate  DATE NOT NULL,
      Name      NVARCHAR(255) NOT NULL,
      Category  NVARCHAR(100) NULL,
      Shares    FLOAT NOT NULL
    );
  `);

  console.log("✅ MSSQL tables ensured (Investors, MonthlyRecords)");
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function getFundGroup(name) {
  const p = name.trim().split(" ").filter(Boolean);
  return ((p[0] || "") + (p[1] ? " " + p[1] : "")).toUpperCase();
}

/*****************************************************************/
/*  SEND‑OTP                                                      */
/*****************************************************************/
app.post("/api/send-otp", async (req, res) => {
  const fullEmail = normalise(req.body.email);

  if (!ALLOWED.has(fullEmail)) {
    return res
      .status(403)
      .json({ message: "Access denied: this dataset is restricted." });
  }

  try {
    await mssqlAuth.connect(authDbConfig);

    const emp = await mssqlAuth.query`
      SELECT EmpID FROM EMP
      WHERE EmpEmail = ${fullEmail} AND ActiveFlag = 1
    `;
    if (!emp.recordset.length) {
      return res.status(404).json({
        message: "No @premierenergies.com account found.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await mssqlAuth.query`
      MERGE Login AS t
      USING (SELECT ${fullEmail} AS U) AS s
        ON t.Username = s.U
      WHEN MATCHED THEN
        UPDATE SET OTP = ${otp}, OTP_Expiry = ${expiry}
      WHEN NOT MATCHED THEN
        INSERT (Username,OTP,OTP_Expiry)
        VALUES (${fullEmail},${otp},${expiry});
    `;

    const subject = "Your Investor Insights One‑Time Password";
    const html = `
      <div style="font-family:Arial;color:#333;line-height:1.5;">
        <h2 style="color:#0052cc;margin-bottom:.5em;">Welcome to Investor Insights</h2>
        <p>Your one‑time password (OTP) is:</p>
        <p style="font-size:24px;font-weight:bold;color:#0052cc;">${otp}</p>
        <p>This code expires in <strong>5 minutes</strong>.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:2em 0;">
        <p style="font-size:12px;color:#777;">
          If you didn’t request this, ignore this email.<br>
          Need help? contact <a href="mailto:aarnav.singh@premierenergies.com">support</a>.
        </p>
        <p style="margin-top:2em;">Regards,<br/><strong>Team Investor Insights</strong></p>
      </div>
    `;
    await sendEmail(fullEmail, subject, html);

    return res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("send-otp error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/*****************************************************************/
/*  VERIFY‑OTP                                                    */
/*****************************************************************/
app.post("/api/verify-otp", async (req, res) => {
  const fullEmail = normalise(req.body.email);
  const { otp } = req.body;

  try {
    await mssqlAuth.connect(authDbConfig);
    const lookup = await mssqlAuth.query`
      SELECT OTP_Expiry FROM Login
      WHERE Username = ${fullEmail} AND OTP = ${otp}
    `;
    if (!lookup.recordset.length) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (new Date() > lookup.recordset[0].OTP_Expiry) {
      return res.status(400).json({ message: "OTP expired" });
    }
    return res.json({ message: "OTP verified" });
  } catch (err) {
    console.error("verify-otp error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ── LOGOUT ───────────────────────────────────────────────────────────────
app.post("/api/logout", (req, res) => {
  res.json({ message: "Logged out" });
});

/* ------------------------------------------------------------------ */
/* API – Investors                                                     */
/* ------------------------------------------------------------------ */
app.post("/api/investors", async (req, res) => {
  const list = req.body;
  if (!Array.isArray(list) || !list.length) {
    return res.status(400).json({ error: "Non-empty array expected" });
  }

  // only MSSQL branch:
  const tx = new mssql.Transaction(pool);
  try {
    await tx.begin();
    for (const inv of list) {
      await new mssql.Request(tx)
        .input("Name", mssql.NVarChar(255), inv.name)
        .input("Bought", mssql.Float, inv.boughtOn18)
        .input("Sold", mssql.Float, inv.soldOn25)
        .input("PercentEquity", mssql.Float, inv.percentToEquity)
        .input("Category", mssql.NVarChar(100), inv.category)
        .input("NetChange", mssql.Float, inv.netChange)
        .input("FundGroup", mssql.NVarChar(100), inv.fundGroup)
        .input("StartPos", mssql.Float, inv.startPosition ?? null)
        .input("EndPos", mssql.Float, inv.endPosition ?? null)
        .query(`
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
    console.error("POST /api/investors error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/investors", async (_, res) => {
  try {
    const result = await pool.request().query(`
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
    res.json(result.recordset);
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
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: "Non-empty array expected" });
  }
  const asOf = new Date(rows[0].date);
  if (isNaN(asOf)) {
    return res.status(400).json({ error: "Invalid date" });
  }

  try {
    await pool.request()
      .input("d", mssql.Date, asOf)
      .query("DELETE FROM dbo.MonthlyRecords WHERE AsOfDate = @d");

    const tvp = new mssql.Table("MonthlyRecords");
    tvp.columns.add("AsOfDate", mssql.Date, { nullable: false });
    tvp.columns.add("Name", mssql.NVarChar(255), { nullable: false });
    tvp.columns.add("Category", mssql.NVarChar(100), { nullable: true });
    tvp.columns.add("Shares", mssql.Float, { nullable: false });

    rows.forEach(r => tvp.rows.add(asOf, r.name, r.category ?? null, r.shares));

    await pool.request().bulk(tvp);
    res.json({ success: true, inserted: rows.length });
  } catch (e) {
    console.error("POST /api/monthly error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/monthly", async (_, res) => {
  try {
    const result = await pool.request().query(`
      SELECT AsOfDate, Name, Category, Shares
      FROM dbo.MonthlyRecords
      ORDER BY AsOfDate, Name;
    `);
    const data = result.recordset;
    const map = Object.create(null);
    data.forEach(row => {
      const key = row.Name;
      if (!map[key]) {
        map[key] = {
          name: key,
          category: row.Category,
          description: "",
          fundGroup: getFundGroup(key),
          monthlyShares: {}
        };
      }
      const d = row.AsOfDate.toISOString().slice(0, 10);
      map[key].monthlyShares[d] = row.Shares;
    });
    res.json(Object.values(map));
  } catch (e) {
    console.error("GET /api/monthly error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/* Static SPA                                                         */
/* ------------------------------------------------------------------ */
const distDir = path.join(__dirname, "dist");
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
  key: fs.readFileSync(path.join(__dirname, "certs/mydomain.key"), "utf8"),
  cert: fs.readFileSync(path.join(__dirname, "certs/d466aacf3db3f299.crt"), "utf8"),
  ca: fs.readFileSync(path.join(__dirname, "certs/gd_bundle-g2-g1.crt"), "utf8"),
};

const PORT = Number(process.env.PORT) || 50443;
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  try {
    await initDb();
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
