// server/server.cjs
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const sql     = require('mssql');

const app = express();

// Allow large JSON bodies (Excel uploads)
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// SQL Server connection config
const dbConfig = {
  user: "SPOT_USER",
  password: "Premier#3801",
  server: "10.0.40.10",
  port: 1433,
  database: "SART",
  options: {
    trustServerCertificate: true,
    encrypt: false,
    connectionTimeout: 60000,
  },
};

let pool;
// Connect & ensure tables exist
sql.connect(dbConfig)
  .then(async p => {
    pool = p;
    console.log(`🚀 Connected to ${dbConfig.database}`);

    // — Investors table
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID(N'[dbo].[Investors]') AND type = 'U'
      )
      BEGIN
        CREATE TABLE dbo.Investors (
          InvestorID    INT IDENTITY PRIMARY KEY,
          Name           NVARCHAR(255)   NOT NULL UNIQUE,
          Bought         FLOAT           NOT NULL,
          Sold           FLOAT           NOT NULL,
          PercentEquity  FLOAT           NOT NULL,
          Category       NVARCHAR(100)   NOT NULL,
          NetChange      FLOAT           NOT NULL,
          FundGroup      NVARCHAR(100)   NOT NULL,
          StartPosition  FLOAT           NULL,
          EndPosition    FLOAT           NULL
        );
      END
    `);

    // — MonthlyRecords table
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID(N'[dbo].[MonthlyRecords]') AND type = 'U'
      )
      BEGIN
        CREATE TABLE dbo.MonthlyRecords (
          RecordID   INT IDENTITY PRIMARY KEY,
          AsOfDate   DATE            NOT NULL,
          Name       NVARCHAR(255)   NOT NULL,
          Category   NVARCHAR(100)   NULL,
          Shares     FLOAT           NOT NULL
        );
      END
    `);

    console.log('✅ Tables ready: Investors & MonthlyRecords');
  })
  .catch(err => {
    console.error('DB Connection Failed:', err);
    process.exit(1);
  });

// Helper to derive fundGroup (first two words uppercase)
function getFundGroup(name) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0] + ' ' + words[1]).toUpperCase();
  }
  return words[0].toUpperCase();
}

// — upsert legacy investors —
app.post('/api/investors', async (req, res) => {
  const investors = req.body;
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    for (const inv of investors) {
      const rq = new sql.Request(tx);
      await rq
        .input('Name',          sql.NVarChar(255), inv.name)
        .input('Bought',        sql.Float,          inv.boughtOn18)
        .input('Sold',          sql.Float,          inv.soldOn25)
        .input('PercentEquity', sql.Float,          inv.percentToEquity)
        .input('Category',      sql.NVarChar(100),  inv.category)
        .input('NetChange',     sql.Float,          inv.netChange)
        .input('FundGroup',     sql.NVarChar(100),  inv.fundGroup)
        .input('StartPos',      sql.Float,          inv.startPosition || null)
        .input('EndPos',        sql.Float,          inv.endPosition || null)
        .query(`
          MERGE INTO dbo.Investors AS T
          USING (SELECT @Name AS Name) AS S
            ON T.Name = S.Name
          WHEN MATCHED THEN 
            UPDATE SET
              Bought        = @Bought,
              Sold          = @Sold,
              PercentEquity = @PercentEquity,
              Category      = @Category,
              NetChange     = @NetChange,
              FundGroup     = @FundGroup,
              StartPosition = @StartPos,
              EndPosition   = @EndPos
          WHEN NOT MATCHED THEN
            INSERT (Name, Bought, Sold, PercentEquity, Category, NetChange, FundGroup, StartPosition, EndPosition)
            VALUES (@Name, @Bought, @Sold, @PercentEquity, @Category, @NetChange, @FundGroup, @StartPos, @EndPos);
        `);
    }
    await tx.commit();
    res.json({ success: true });
  } catch (e) {
    await tx.rollback();
    console.error('POST /api/investors error:', e);
    res.status(500).json({ error: e.message });
  }
});

// — fetch all investors —
app.get('/api/investors', async (_, res) => {
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
    console.error('GET /api/investors error:', e);
    res.status(500).json({ error: e.message });
  }
});

// — bulk insert monthly file rows —
app.post('/api/monthly', async (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Expected non-empty array of {date,name,category,shares}' });
  }

  // all rows share the same date
  const date = new Date(rows[0].date);
  if (isNaN(date.getTime())) {
    return res.status(400).json({ error: 'Invalid date in first row' });
  }

  try {
    // delete any existing for that date
    await pool.request()
      .input('AsOfDate', sql.Date, date)
      .query('DELETE FROM dbo.MonthlyRecords WHERE AsOfDate = @AsOfDate');

    // prepare a Table-Valued Parameter for bulk insert
    const tvp = new sql.Table('MonthlyRecords');
    tvp.columns.add('AsOfDate', sql.Date,          { nullable: false });
    tvp.columns.add('Name',     sql.NVarChar(255), { nullable: false });
    tvp.columns.add('Category', sql.NVarChar(100), { nullable: true  });
    tvp.columns.add('Shares',   sql.Float,         { nullable: false });

    for (const r of rows) {
      tvp.rows.add(date, r.name, r.category || null, r.shares);
    }

    await pool.request().bulk(tvp);
    res.json({ success: true, inserted: rows.length });
  } catch (e) {
    console.error('POST /api/monthly error:', e);
    res.status(500).json({ error: e.message });
  }
});

// — fetch pivoted monthly data for frontend —
app.get('/api/monthly', async (_, res) => {
  try {
    const result = await pool.request().query(`
      SELECT AsOfDate, Name, Category, Shares
      FROM dbo.MonthlyRecords
      ORDER BY AsOfDate, Name;
    `);

    // pivot rows into one object per Name
    const map = {};
    for (const r of result.recordset) {
      const nm = r.Name;
      if (!map[nm]) {
        map[nm] = {
          name: nm,
          category: r.Category,
          description: '',
          fundGroup: getFundGroup(nm),
          monthlyShares: {}
        };
      }
      const key = r.AsOfDate.toISOString().slice(0,10);
      map[nm].monthlyShares[key] = r.Shares;
    }

    res.json(Object.values(map));
  } catch (e) {
    console.error('GET /api/monthly error:', e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`));
