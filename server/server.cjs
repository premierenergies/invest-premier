// server/server.cjs
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const mssqlAuth = require("mssql");

require("dotenv").config();

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

// choose driver
const DB_TYPE = process.env.DB_TYPE === "mysql" ? "mysql" : "mssql";

let mssql, mysql, sql, pool;
if (DB_TYPE === "mysql") {
  mysql = require("mssql");
} else {
  mssql = require("mssql");
  sql = mssql;
}

const app = express();

/* ------------------------------------------------------------------ */
/* Middleware                                                         */
/* ------------------------------------------------------------------ */
app.use(cors()); // SPA ↔ API
app.use(express.json({ limit: "100mb" })); // large Excel payloads
app.use(compression()); // gzip

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

// 1) Add this near the top, alongside your other DB configs:
const authDbConfig = {
  user: process.env.MSSQL_USER || "SPOT_USER",
  password: process.env.MSSQL_PASSWORD || "Marvik#72@",
  server: process.env.MSSQL_SERVER || "10.0.40.10",
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: "SPOT", // ← auth database
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000,
  },
};

const mysqlConfig = {
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "Singhcottage@1729",
  database: process.env.MYSQL_DB || "INVEST",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// ── ACCESS LIST & EMAIL NORMALISER ────────────────────────────────────────────
const ALLOWED = new Set([
  "aarnav.singh@premierenergies.com",
  "saluja@premierenergies.com",
  "vinay.rustagi@premierenergies.com",
  "nk.khandelwal@premierenergies.com",
  "neha.g@premierenergies.com",
  "krishankk@premierenergies.com"
]);

function normalise(userInput = "") {
  const raw = userInput.trim().toLowerCase();
  return raw.includes("@") ? raw : `${raw}@premierenergies.com`;
}
// ── END ACCESS LIST BLOCK ─────────────────────────────────────────────────────

/* ------------------------------------------------------------------ */
/* Initialize Pool & Ensure Tables                                    */
/* ------------------------------------------------------------------ */
async function initDb() {
  if (DB_TYPE === "mysql") {
    // MySQL
    pool = await mysql.createPool(mysqlConfig);
    console.log(`🚀 MySQL connected → ${mysqlConfig.database}`);

    // create tables if not exists
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS Investors (
        InvestorID    INT AUTO_INCREMENT PRIMARY KEY,
        Name          VARCHAR(255) NOT NULL UNIQUE,
        Bought        DOUBLE NOT NULL,
        Sold          DOUBLE NOT NULL,
        PercentEquity DOUBLE NOT NULL,
        Category      VARCHAR(100) NOT NULL,
        NetChange     DOUBLE NOT NULL,
        FundGroup     VARCHAR(100) NOT NULL,
        StartPosition DOUBLE NULL,
        EndPosition   DOUBLE NULL
      );
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS MonthlyRecords (
        RecordID  INT AUTO_INCREMENT PRIMARY KEY,
        AsOfDate  DATE       NOT NULL,
        Name      VARCHAR(255) NOT NULL,
        Category  VARCHAR(100) NULL,
        Shares    DOUBLE     NOT NULL
      );
    `);
    console.log("✅ MySQL tables ensured (Investors, MonthlyRecords)");
  } else {
    // MSSQL
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

  // 0) restrict to allowed users
  if (!ALLOWED.has(fullEmail)) {
    return res.status(403).json({ message: "Access denied: this dataset is restricted." });
  }

  let authPool;
  try {
    // 1) connect to SPOT for authentication
    authPool = new mssqlAuth.ConnectionPool(authDbConfig);
    await authPool.connect();

    // 2) verify employee record
    const empResult = await authPool
      .request()
      .input("email", mssqlAuth.NVarChar(256), fullEmail)
      .query(`
        SELECT EmpID 
          FROM EMP 
         WHERE EmpEmail = @email 
           AND ActiveFlag = 1
      `);

    if (!empResult.recordset.length) {
      await authPool.close();
      return res.status(404).json({ message: "No @premierenergies.com account found." });
    }

    // 3) generate OTP & expiry
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    // 4) upsert into Login table
    await authPool
      .request()
      .input("username", mssqlAuth.NVarChar(256), fullEmail)
      .input("otp", mssqlAuth.NVarChar(6), otp)
      .input("expiry", mssqlAuth.DateTime, expiry)
      .query(`
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
    const subject = "Your Investor Insights One‑Time Password";
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
      </div>`;
    await sendEmail(fullEmail, subject, html);

    return res.json({ message: "OTP sent successfully" });
  } catch (err) {
    if (authPool) await authPool.close();
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

  let authPool;
  try {
    // 1) fresh SPOT connection
    authPool = new mssqlAuth.ConnectionPool(authDbConfig);
    await authPool.connect();

    // 2) lookup OTP and expiry
    const lookupResult = await authPool
      .request()
      .input("username", mssqlAuth.NVarChar(256), fullEmail)
      .input("otp", mssqlAuth.NVarChar(6), otp)
      .query(`
        SELECT OTP_Expiry
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

    // close the auth pool and return success
    await authPool.close();
    return res.json({ message: "OTP verified" });
  } catch (err) {
    if (authPool) await authPool.close();
    console.error("verify-otp error", err);
    return res.status(500).json({ message: "Server error" });
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

  if (DB_TYPE === "mysql") {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const inv of list) {
        await conn.execute(
          `INSERT INTO Investors
            (Name,Bought,Sold,PercentEquity,Category,NetChange,FundGroup,StartPosition,EndPosition)
           VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             Bought        = VALUES(Bought),
             Sold          = VALUES(Sold),
             PercentEquity = VALUES(PercentEquity),
             Category      = VALUES(Category),
             NetChange     = VALUES(NetChange),
             FundGroup     = VALUES(FundGroup),
             StartPosition = VALUES(StartPosition),
             EndPosition   = VALUES(EndPosition);
          `,
          [
            inv.name,
            inv.boughtOn18,
            inv.soldOn25,
            inv.percentToEquity,
            inv.category,
            inv.netChange,
            inv.fundGroup,
            inv.startPosition ?? null,
            inv.endPosition ?? null,
          ]
        );
      }
      await conn.commit();
      res.json({ success: true, upserted: list.length });
    } catch (e) {
      await conn.rollback();
      console.error("POST /api/investors [MySQL] error:", e);
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
  } else {
    const tx = new sql.Transaction(pool);
    try {
      await tx.begin();
      for (const inv of list) {
        await new sql.Request(tx)
          .input("Name", sql.NVarChar(255), inv.name)
          .input("Bought", sql.Float, inv.boughtOn18)
          .input("Sold", sql.Float, inv.soldOn25)
          .input("PercentEquity", sql.Float, inv.percentToEquity)
          .input("Category", sql.NVarChar(100), inv.category)
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
  }
});

app.get("/api/investors", async (_, res) => {
  try {
    if (DB_TYPE === "mysql") {
      const [rows] = await pool.execute(`
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
        FROM Investors
        ORDER BY Name;
      `);
      res.json(rows);
    } else {
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
    }
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
  const asOf = new Date(rows[0].date);
  if (isNaN(asOf)) {
    return res.status(400).json({ error: "Invalid date" });
  }

  try {
    if (DB_TYPE === "mysql") {
      // delete existing
      await pool.execute(`DELETE FROM MonthlyRecords WHERE AsOfDate = ?`, [
        asOf,
      ]);
      // insert all via single multi-row
      const vals = rows.map((r) => [
        asOf,
        r.name,
        r.category ?? null,
        r.shares,
      ]);
      await pool.query(
        `INSERT INTO MonthlyRecords (AsOfDate,Name,Category,Shares)
         VALUES ?
        `,
        [vals]
      );
      res.json({ success: true, inserted: rows.length });
    } else {
      await pool
        .request()
        .input("d", sql.Date, asOf)
        .query("DELETE FROM dbo.MonthlyRecords WHERE AsOfDate = @d");

      const tvp = new sql.Table("MonthlyRecords");
      tvp.columns.add("AsOfDate", sql.Date, { nullable: false });
      tvp.columns.add("Name", sql.NVarChar(255), { nullable: false });
      tvp.columns.add("Category", sql.NVarChar(100), { nullable: true });
      tvp.columns.add("Shares", sql.Float, { nullable: false });

      rows.forEach((r) =>
        tvp.rows.add(asOf, r.name, r.category ?? null, r.shares)
      );

      await pool.request().bulk(tvp);
      res.json({ success: true, inserted: rows.length });
    }
  } catch (e) {
    console.error("POST /api/monthly error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/monthly", async (_, res) => {
  try {
    let data;
    if (DB_TYPE === "mysql") {
      const [rows] = await pool.execute(`
        SELECT AsOfDate, Name, Category, Shares
        FROM MonthlyRecords
        ORDER BY AsOfDate, Name;
      `);
      data = rows;
    } else {
      const r = await pool.request().query(`
        SELECT AsOfDate, Name, Category, Shares
        FROM dbo.MonthlyRecords
        ORDER BY AsOfDate, Name;
      `);
      data = r.recordset;
    }

    const map = Object.create(null);
    data.forEach((row) => {
      const key = row.Name;
      if (!map[key]) {
        map[key] = {
          name: key,
          category: row.Category,
          description: "",
          fundGroup: getFundGroup(key),
          monthlyShares: {},
        };
      }
      // ensure ISO date string
      const d =
        row.AsOfDate instanceof Date
          ? row.AsOfDate.toISOString().slice(0, 10)
          : row.AsOfDate;
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
  key: fs.readFileSync(path.join(__dirname, "certs", "mydomain.key"), "utf8"),
  cert: fs.readFileSync(
    path.join(__dirname, "certs", "d466aacf3db3f299.crt"),
    "utf8"
  ),
  ca: fs.readFileSync(
    path.join(__dirname, "certs", "gd_bundle-g2-g1.crt"),
    "utf8"
  ),
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