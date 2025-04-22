const express = require("express");
const cors = require("cors");
const { connectDB, sql } = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());

connectDB();

// Root Route - Prints "Hello Magnum"
app.get("/", (req, res) => {
  res.send("Hello Magnum");
});

app.get("/api/test-db", async (req, res) => {
  try {
    const pool = await sql.connect();
    console.log("✅ Database connected successfully on Vercel!"); // ✅ Logs in the console instead
    const result = await pool.request().query(`
      WITH Punches AS (
    SELECT USRID, 
           FORMAT(SRVDT, 'yyyy-MM-dd') AS PunchDate,  -- Only Date
           FORMAT(SRVDT, 'HH:mm:ss') AS PunchTime,    -- Only Time
           DEVUID
    FROM BioStar2_ac.dbo.T_LG202502
    WHERE DEVUID IN (547239461, 939342251, 546203817, 538167579, 541654478, 538210081, 788932322, 111111111)
),
FirstLastPunch AS (
    SELECT USRID, PunchDate,
           MIN(CASE WHEN DEVUID IN (547239461, 939342251, 546203817, 538167579) THEN PunchTime END) AS InTime,
           MAX(CASE WHEN DEVUID IN (541654478, 538210081, 788932322, 111111111) THEN PunchTime END) AS OutTime
    FROM Punches
    GROUP BY USRID, PunchDate
),
TimeInnings AS (
    SELECT USRID, PunchDate, PunchTime,
           LEAD(PunchTime) OVER (PARTITION BY USRID, PunchDate ORDER BY PunchTime) AS NextPunch,
           CASE
               WHEN (ROW_NUMBER() OVER (PARTITION BY USRID, PunchDate ORDER BY PunchTime) % 2) = 1
               THEN DATEDIFF(SECOND, PunchTime, LEAD(PunchTime) OVER (PARTITION BY USRID, PunchDate ORDER BY PunchTime))
               ELSE NULL
           END AS InTimeInnings
    FROM Punches
)
SELECT FLP.USRID, 
       TU.NM AS Employee_Name, 
       TU.DEPARTMENT, 
       TU.TITLE, 
       FLP.PunchDate, 
       COALESCE(FLP.InTime, '--') AS InTime,  -- Ensuring NULL values are handled
       COALESCE(FLP.OutTime, '--') AS OutTime,
       FORMAT(DATEADD(SECOND, COALESCE(SUM(TI.InTimeInnings), 0), 0), 'HH:mm:ss') AS Total_InTime,
       FORMAT(DATEADD(SECOND, COALESCE(DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) - SUM(TI.InTimeInnings), 0), 0), 'HH:mm:ss') AS Total_OutTime,
       FORMAT(DATEADD(SECOND, COALESCE(DATEDIFF(SECOND, FLP.InTime, FLP.OutTime), 0), 0), 'HH:mm:ss') AS Actual_Working_Hours,
       CASE 
           WHEN FLP.InTime IS NULL THEN 'ABSENT'
        
           WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) >= 4 * 3600 AND DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) < 7 * 3600 THEN 'HALF DAY'  -- Between 4 and 7 hours
          
         
           WHEN CONVERT(TIME, FLP.InTime) > '10:00:00' THEN 'HALF DAY'  -- InTime after 10:00 AM
           WHEN CONVERT(TIME, FLP.InTime) > '09:35:00' AND CONVERT(TIME, FLP.InTime) <= '10:00:00' THEN 'PRESENT with Late Count'  -- InTime between 9:35 AM and 10:00 AM
         
           ELSE 'PRESENT'
       END AS Status
FROM FirstLastPunch FLP
LEFT JOIN TimeInnings TI ON FLP.USRID = TI.USRID AND FLP.PunchDate = TI.PunchDate
LEFT JOIN BioStar2_ac.dbo.T_USR TU ON FLP.USRID = TU.USRID
WHERE TU.NM IS NOT NULL
GROUP BY FLP.USRID, TU.NM, FLP.PunchDate, FLP.InTime, FLP.OutTime, TU.DEPARTMENT, TU.TITLE
ORDER BY FLP.USRID, FLP.PunchDate;

    `);

    res.json(result.recordset);
  } catch (error) {
    console.error("❌ Database test failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
