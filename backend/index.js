require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB, sql } = require("./db");

const app = express();
const PORT = process.env.BACKEND_PORT || 5000;
app.use(cors());
app.use(express.json());

// Connect to database
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
           WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) >= 4 * 3600 AND DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) < 7 * 3600 THEN 'HALF DAY'
           WHEN CONVERT(TIME, FLP.InTime) > '10:00:00' THEN 'HALF DAY'
           WHEN CONVERT(TIME, FLP.InTime) > '09:35:00' AND CONVERT(TIME, FLP.InTime) <= '10:00:00' THEN 'PRESENT with Late Count'
           ELSE 'PRESENT'
       END AS Status
FROM FirstLastPunch FLP
LEFT JOIN TimeInnings TI ON FLP.USRID = TI.USRID AND FLP.PunchDate = TI.PunchDate
LEFT JOIN BioStar2_ac.dbo.T_USR TU ON FLP.USRID = TU.USRID
WHERE TU.NM IS NOT NULL
GROUP BY FLP.USRID, TU.NM, FLP.PunchDate, FLP.InTime, FLP.OutTime, TU.DEPARTMENT, TU.TITLE
HAVING 
    CASE 
        WHEN FLP.InTime IS NULL THEN 'ABSENT'
        WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) >= 4 * 3600 AND DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) < 7 * 3600 THEN 'HALF DAY'
        WHEN CONVERT(TIME, FLP.InTime) > '10:00:00' THEN 'HALF DAY'
        WHEN CONVERT(TIME, FLP.InTime) > '09:35:00' AND CONVERT(TIME, FLP.InTime) <= '10:00:00' THEN 'PRESENT with Late Count'
        ELSE 'PRESENT'
    END NOT IN ('PRESENT', 'PRESENT with Late Count')
ORDER BY FLP.USRID, FLP.PunchDate;


    `);

    res.json(result.recordset);
  } catch (error) {
    console.error("❌ Database test failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// First, add body parser middleware to handle JSON requests
app.use(express.json());

// Save attendance route
app.post("/api/save-attendance", async (req, res) => {
  try {
    // Log the complete request body first
    console.log("Raw request body:", req.body);

    const { USRID, PunchDate, InTime, OutTime, Status, Reason } = req.body;

    // More detailed logging of the extracted data
    console.log("--------- ATTENDANCE DATA RECEIVED ---------");
    console.log(`USRID: ${USRID} (${typeof USRID})`);
    console.log(`PunchDate: ${PunchDate} (${typeof PunchDate})`);
    console.log(`InTime: ${InTime} (${typeof InTime})`);
    console.log(`OutTime: ${OutTime} (${typeof OutTime})`);
    console.log(`Status: ${Status} (${typeof Status})`);
    console.log(`Reason: ${Reason} (${typeof Reason})`);
    console.log("--------------------------------------------");

    // Validation
    if (!USRID || !PunchDate) {
      console.error("Missing required fields: ", {
        USRID: USRID ? "✓" : "✗",
        PunchDate: PunchDate ? "✓" : "✗",
      });
      throw new Error("USRID and PunchDate are required");
    }

    const pool = await sql.connect();
    // Check if record exists
    
    const checkResult = await pool
    .request()
    .input("UserID", sql.VarChar, USRID)
    .input("USRID", sql.VarChar, USRID)
    .input("Date", sql.VarChar, PunchDate)
    .query(`SELECT * FROM T_EmpReq WHERE UserID = @UserID AND Date = @Date`);
  

    if (checkResult.recordset.length > 0) {
     // Update existing record
      await pool
        .request()
        .input("UserID", sql.VarChar, USRID)
        .input("PunchDate", sql.VarChar, PunchDate)
        .input("InTime", sql.VarChar, InTime || null)
        .input("OutTime", sql.VarChar, OutTime || null)
        .input("Status", sql.VarChar, Status)
        .input("Reason", sql.VarChar, Reason)
        .input("UpdatedDate", sql.DateTime, new Date()).query(`
                UPDATE T_EmpReq 
                SET InTime = @InTime, 
                    OutTime = @OutTime, 
                    Status = @Status, 
                    Reason = @Reason,
                    UpdatedDate = @UpdatedDate
                WHERE USRID = @USRID AND SRVDT = @PunchDate
              `);
      console.log("Updated existing attendance record");
    } else {
      // Insert new record
      await pool
        .request()
       
        
        .input("InTime", sql.VarChar, InTime || null)
        .input("OutTime", sql.VarChar, OutTime || null)
        .input("Status", sql.VarChar, Status)
        .input("Reason", sql.VarChar, Reason|| null)
        .input("CreatedDate", sql.DateTime, new Date())
        .input("IsApproved", sql.Bit, 0)
        .input("ApprovalRequested", sql.Bit, 0).query(`
                INSERT INTO T_EmpReq (UserID)
                VALUES (@USRID)
              `);
      console.log("Created new attendance record");
    }

    // Success response
    console.log("Attendance data processed successfully");
    res.status(200).json({
      message: "Attendance saved successfully",
      receivedData: { USRID, PunchDate, InTime, OutTime, Status, Reason },
    });
  } catch (error) {
    console.error("Error saving attendance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Request approval route
app.post("/api/request-approval", async (req, res) => {
  try {
    const { USRID, PunchDate, Status, Reason } = req.body;
    console.log("Received approval request with data:", {
      USRID,
      PunchDate,
      Status,
      Reason,
    });

    if (!USRID || !PunchDate) {
      throw new Error("USRID and PunchDate are required");
    }

    const pool = await sql.connect();

    // Check if record exists
    const checkResult = await pool
      .request()
      .input("UserID", sql.VarChar, UserID)
      .input("Date", sql.VarChar, Date)
      .query(`SELECT * FROM T_EmpReq WHERE UserID = @UserID AND Date = @Date`);

    if (checkResult.recordset.length > 0) {
      // Update existing record
      await pool
        .request()
        .input("UserID", sql.VarChar, UserID)
        .input("Date", sql.VarChar, Date)
        .input("Status", sql.VarChar, Status)
        .input("Reason", sql.VarChar, Reason)
        .input("UpdatedDate", sql.DateTime, new Date())
        .input("ApprovalRequested", sql.Bit, 1).query(`
          UPDATE T_EmpReq 
          SET Status = @Status, 
              Reason = @Reason,
              UpdatedDate = @UpdatedDate,
              ApprovalRequested = @ApprovalRequested
          WHERE USRID = @USRID AND SRVDT = @PunchDate
        `);
      console.log("Updated existing approval request");
    } else {
      // Insert new record
      await pool
        .request()
        .input("USRID", sql.VarChar, USRID)
        .input("PunchDate", sql.VarChar, PunchDate)
        .input("Status", sql.VarChar, Status)
        .input("Reason", sql.VarChar, Reason)
        .input("CreatedDate", sql.DateTime, new Date())
        .input("IsApproved", sql.Bit, 0)
        .input("ApprovalRequested", sql.Bit, 1).query(`
          INSERT INTO T_EmpReq (USRID, SRVDT, Status, Reason, CreatedDate, IsApproved, ApprovalRequested)
          VALUES (@USRID, @PunchDate, @Status, @Reason, @CreatedDate, @IsApproved, @ApprovalRequested)
        `);
      console.log("Created new approval request");
    }

    res.status(200).json({ message: "Approval requested successfully" });
  } catch (error) {
    console.error("Error requesting approval:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve attendance route
app.post("/api/approve-attendance", async (req, res) => {
  try {
    const { USRID, PunchDate } = req.body;
    console.log("Received approve attendance request with data:", {
      USRID,
      PunchDate,
    });

    if (!USRID || !PunchDate) {
      throw new Error("USRID and PunchDate are required");
    }

    const pool = await sql.connect();

    const result = await pool
      .request()
      .input("USRID", sql.VarChar, USRID)
      .input("PunchDate", sql.VarChar, PunchDate)
      .input("IsApproved", sql.Bit, 1)
      .input("ApprovedDate", sql.DateTime, new Date()).query(`
        UPDATE T_EmpReq 
        SET IsApproved = @IsApproved,
            ApprovedDate = @ApprovedDate
        WHERE USRID = @USRID AND SRVDT = @PunchDate
      `);

    console.log(
      "Approved attendance record:",
      result.rowsAffected[0] > 0 ? "Success" : "No records updated"
    );

    res.status(200).json({ message: "Attendance approved successfully" });
  } catch (error) {
    console.error("Error approving attendance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve all attendance route
app.post("/api/approve-all", async (req, res) => {
  try {
    console.log("Received approve all attendance request");

    const pool = await sql.connect();

    const result = await pool
      .request()
      .input("IsApproved", sql.Bit, 1)
      .input("ApprovedDate", sql.DateTime, new Date()).query(`
        UPDATE T_EmpReq 
        SET IsApproved = @IsApproved,
            ApprovedDate = @ApprovedDate
        WHERE ApprovalRequested = 1 AND IsApproved = 0
      `);

    console.log(
      "Approved all attendance records:",
      result.rowsAffected[0],
      "records updated"
    );

    res
      .status(200)
      .json({ message: "All attendance records approved successfully" });
  } catch (error) {
    console.error("Error approving all attendance:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
