// server/server.cjs
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const cors = require("cors");
const compression = require("compression");

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
  mysql = require("mysql2/promise");
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

// Helper to send mail via Graph
async function sendEmail(toEmail, subject, htmlContent) {
  const message = {
    subject,
    body: { contentType: "HTML", content: htmlContent },
    toRecipients: [{ emailAddress: { address: toEmail } }],
  };
  await graphClient
    .api(`/users/${process.env.SENDER_EMAIL}/sendMail`)
    .post({ message, saveToSentItems: "true" });
}

// 2) Send OTP
app.post("/api/send-otp", async (req, res) => {
  const { email } = req.body;
  const fullEmail = `${email}@premierenergies.com`;

  try {
    // 2a) connect to auth DB
    await mssql.connect(authDbConfig);

    // 2b) ensure active user
    const emp = await mssql.query`
      SELECT EmpID FROM EMP
       WHERE EmpEmail = ${fullEmail} AND ActiveFlag = 1
    `;
    if (!emp.recordset.length) {
      return res.status(404).json({
        message: "No registered @premierenergies.com account found.",
      });
    }

    // 2c) generate & upsert OTP
    const LEmpID = emp.recordset[0].EmpID;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await mssql.query`
      MERGE Login AS tgt
      USING (SELECT ${fullEmail} AS Username) AS src
        ON tgt.Username=src.Username
      WHEN MATCHED THEN 
        UPDATE SET OTP=${otp}, OTP_Expiry=${expiry}
      WHEN NOT MATCHED THEN
        INSERT(Username,OTP,OTP_Expiry,LEmpID)
        VALUES(${fullEmail},${otp},${expiry},${LEmpID});
    `;

    // 2d) send email
    const html = `
      <p>Your one‑time login code is:</p>
      <h2>${otp}</h2>
      <p>Expires in 5 minutes.</p>
    `;
    await sendEmail(fullEmail, "Your Login OTP", html);

    res.json({ message: "OTP sent" });
  } catch (e) {
    console.error("send-otp error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// 3) Verify OTP
app.post("/api/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  const fullEmail = `${email}@premierenergies.com`;

  try {
    await mssql.connect(authDbConfig);
    const lookup = await mssql.query`
      SELECT LEmpID,OTP_Expiry FROM Login
       WHERE Username=${fullEmail} AND OTP=${otp}
    `;
    if (!lookup.recordset.length) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    const { LEmpID, OTP_Expiry } = lookup.recordset[0];
    if (new Date() > OTP_Expiry) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // you could establish a session here, or simply return success
    // e.g. req.session.empID = LEmpID;
    res.json({ message: "OTP verified", empID: LEmpID });
  } catch (e) {
    console.error("verify-otp error", e);
    res.status(500).json({ message: "Server error" });
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
