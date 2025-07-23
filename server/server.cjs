// server/server.cjs
//
// Full-stack production server (HTTPS, single port 50443)
// • Express API   →  /api/*
// • React build   →  ./dist  (all other routes)
// • MSSQL backing store
// • TLS certs     →  ./certs/{mydomain.key,d466aacf3db3f299.crt,gd_bundle-g2-g1.crt}
//
// No RegExp-based routes are used anywhere.
//

require('dotenv').config();
const path        = require('path');
const fs          = require('fs');
const https       = require('https');
const express     = require('express');
const cors        = require('cors');
const compression = require('compression');
const sql         = require('mssql');

const app = express();

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

app.use(cors());                                 // SPA ↔ API
app.use(express.json({ limit: '100mb' }));       // large Excel payloads
app.use(compression());                          // gzip

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

const dbConfig = {
  user:     'SPOT_USER',          // ⬅ hard-coded credentials
  password: 'Marvik#72@',
  server:   '10.0.40.10',
  port:     1433,
  database: 'SART',
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000
  }
};

let pool;

sql.connect(dbConfig)
  .then(async p => {
    pool = p;
    console.log(`🚀 MSSQL connected → ${dbConfig.database}`);

    /* Investors ---------------------------------------------------- */
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID(N'dbo.Investors') AND type = 'U'
      )
      BEGIN
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
      END
    `);

    /* MonthlyRecords ----------------------------------------------- */
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID(N'dbo.MonthlyRecords') AND type = 'U'
      )
      BEGIN
        CREATE TABLE dbo.MonthlyRecords (
          RecordID  INT IDENTITY PRIMARY KEY,
          AsOfDate  DATE NOT NULL,
          Name      NVARCHAR(255) NOT NULL,
          Category  NVARCHAR(100) NULL,
          Shares    FLOAT NOT NULL
        );
      END
    `);

    console.log('✅ Tables ensured (Investors, MonthlyRecords)');
  })
  .catch(err => {
    console.error('❌ MSSQL connection failed:', err);
    process.exit(1);
  });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// fund-group = first two words, upper-cased
function getFundGroup(name) {
  const p = name.trim().split(' ').filter(Boolean);
  return ((p[0] || '') + (p[1] ? ' ' + p[1] : '')).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* API – Investors                                                     */
/* ------------------------------------------------------------------ */

app.post('/api/investors', async (req, res) => {
  const list = req.body;
  if (!Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ error: 'Non-empty array expected' });
  }

  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();

    for (const inv of list) {
      await new sql.Request(tx)
        .input('Name',          sql.NVarChar(255), inv.name)
        .input('Bought',        sql.Float,         inv.boughtOn18)
        .input('Sold',          sql.Float,         inv.soldOn25)
        .input('PercentEquity', sql.Float,         inv.percentToEquity)
        .input('Category',      sql.NVarChar(100), inv.category)
        .input('NetChange',     sql.Float,         inv.netChange)
        .input('FundGroup',     sql.NVarChar(100), inv.fundGroup)
        .input('StartPos',      sql.Float,         inv.startPosition ?? null)
        .input('EndPos',        sql.Float,         inv.endPosition   ?? null)
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
    console.error('POST /api/investors error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/investors', async (_, res) => {
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
    console.error('GET /api/investors error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/* API – Monthly uploads                                               */
/* ------------------------------------------------------------------ */

app.post('/api/monthly', async (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Non-empty array expected' });
  }

  const asOf = new Date(rows[0].date);
  if (Number.isNaN(asOf.getTime())) {
    return res.status(400).json({ error: 'Invalid date' });
  }

  try {
    await pool.request()
      .input('d', sql.Date, asOf)
      .query('DELETE FROM dbo.MonthlyRecords WHERE AsOfDate = @d');

    const tvp = new sql.Table('MonthlyRecords');
    tvp.columns.add('AsOfDate', sql.Date,          { nullable: false });
    tvp.columns.add('Name',     sql.NVarChar(255), { nullable: false });
    tvp.columns.add('Category', sql.NVarChar(100), { nullable: true  });
    tvp.columns.add('Shares',   sql.Float,         { nullable: false });

    rows.forEach(r =>
      tvp.rows.add(asOf, r.name, r.category ?? null, r.shares));

    await pool.request().bulk(tvp);
    res.json({ success: true, inserted: rows.length });
  } catch (e) {
    console.error('POST /api/monthly error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/monthly', async (_, res) => {
  try {
    const r = await pool.request().query(`
      SELECT AsOfDate, Name, Category, Shares
      FROM dbo.MonthlyRecords
      ORDER BY AsOfDate, Name;
    `);

    const map = Object.create(null);
    r.recordset.forEach(row => {
      const key = row.Name;
      if (!map[key]) {
        map[key] = {
          name          : key,
          category      : row.Category,
          description   : '',
          fundGroup     : getFundGroup(key),
          monthlyShares : {}
        };
      }
      map[key].monthlyShares[row.AsOfDate.toISOString().slice(0, 10)] = row.Shares;
    });

    res.json(Object.values(map));
  } catch (e) {
    console.error('GET /api/monthly error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/* Static SPA                                                          */
/* ------------------------------------------------------------------ */

const distDir   = path.join(__dirname, 'dist');
const indexHtml = path.join(distDir, 'index.html');

app.use(express.static(distDir));

// simple catch-all (no RegExp)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(indexHtml);
});

/* ------------------------------------------------------------------ */
/* HTTPS boot                                                          */
/* ------------------------------------------------------------------ */

const httpsOptions = {
  key : fs.readFileSync(path.join(__dirname, 'certs', 'mydomain.key'),           'utf8'),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'd466aacf3db3f299.crt'),   'utf8'),
  ca  : fs.readFileSync(path.join(__dirname, 'certs', 'gd_bundle-g2-g1.crt'),    'utf8')
};

const PORT = 50443;
const HOST = process.env.HOST || '0.0.0.0';

const start = () => {
  try {
    https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
      console.log(`🔒 HTTPS ready → https://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('❌ HTTPS start failed:', err);
    process.exit(1);
  }
};

start();
