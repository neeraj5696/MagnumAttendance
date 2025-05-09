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

// API endpoint to check button status
app.get("/api/check-button-status", async (req, res) => {
  try {
    const { userId, date } = req.query;
    
    if (!userId || !date) {
      return res.status(400).json({ error: "UserID and date are required" });
    }
    
    console.log(`Checking button status for userId: ${userId}, date: ${date}`);
    
    const pool = await sql.connect();
    
    // Use the correct column names for the T_EmpReq table
    try {
      const result = await pool.request()
        .input('userId', sql.VarChar, userId)
        .input('date', sql.VarChar, date)
        .query(`
          SELECT TOP 1
            UserID, Date, EmpReqShow, MailSend, inTime, OutTime, Status
          FROM T_EmpReq 
          WHERE UserID = @userId AND Date = @date
        `);
          
      if (result.recordset.length === 0) {
        console.log(`No record found for user ${userId} on date ${date}`);
        return res.json({ 
          saveButtonDisabled: false,
          requestApprovalDisabled: false,
          exists: false
        });
      }
      
      const record = result.recordset[0];
      console.log('Found record:', record);
      
      // Use the exact column names from the table
      const empReqShow = record.EmpReqShow;
      const mailSend = record.MailSend;
      
      // Logic for button status with exact case matching
      const saveButtonDisabled = empReqShow === 'NO' || empReqShow === 'No' || empReqShow === 'no';
      const requestApprovalDisabled = 
        (empReqShow === 'YES' || empReqShow === 'Yes' || empReqShow === 'yes') && 
        (mailSend === 'Y' || mailSend === 'y');
      
      res.json({
        saveButtonDisabled,
        requestApprovalDisabled,
        exists: true,
        record: {
          empReqShow,
          mailSend,
          inTime: record.inTime,
          outTime: record.OutTime,
          status: record.Status
        }
      });
    } catch (error) {
      console.error("Query error:", error);
      res.json({ 
        saveButtonDisabled: false,
        requestApprovalDisabled: false,
        exists: false,
        error: error.message
      });
    }
  } catch (error) {
    console.error("Error checking button status:", error);
    res.json({ 
      saveButtonDisabled: false,
      requestApprovalDisabled: false,
      exists: false,
      error: error.message
    });
  }
});

app.get("/api/attendance", async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }
    
    console.log(`Fetching attendance data for user: ${userId}`);
    
    const pool = await sql.connect();
    console.log("✅ Database connected successfully!");
    
    // Modified query to filter by specific user ID
    const result = await pool.request()
      .input('userId', sql.VarChar, userId)
      .query(`
      WITH Punches AS (
    SELECT USRID,
            FORMAT(SRVDT, 'yyyy-MM-dd') AS PunchDate,  -- Only Date
           FORMAT(SRVDT, 'HH:mm:ss') AS PunchTime,    -- Only Time
           DEVUID
    FROM BioStar2_ac.dbo.T_LG202502
    WHERE USRID = @userId 
    AND DEVUID IN (547239461, 939342251, 546203817, 538167579, 541654478, 538210081, 788932322, 111111111)
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
),
UserDetails AS (
    SELECT 
        u.USRID,
        u.NM AS Employee_Name,
        u.USRUID,
        u.DEPARTMENT,
        u.TITLE,
        f5.VAL AS Manager_Name,
        f6.VAL AS HR_Mail,
        f7.VAL AS Manager_Email
    FROM BioStar2_ac.dbo.T_USR u
    LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f5 ON u.USRUID = f5.USRUID AND f5.CUSFLDUID = 5
    LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f6 ON u.USRUID = f6.USRUID AND f6.CUSFLDUID = 6
    LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f7 ON u.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
    WHERE u.USRID = @userId
)
SELECT 
    FLP.USRID,
    ud.Employee_Name,
    ud.DEPARTMENT,
    ud.TITLE,
    FLP.PunchDate,
    COALESCE(FLP.InTime, '--') AS InTime,
    COALESCE(FLP.OutTime, '--') AS OutTime,
    FORMAT(DATEADD(SECOND, COALESCE(SUM(TI.InTimeInnings), 0), 0), 'HH:mm:ss') AS Total_InTime,
    FORMAT(DATEADD(SECOND, COALESCE(DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) - SUM(TI.InTimeInnings), 0), 0), 'HH:mm:ss') AS Total_OutTime,
    FORMAT(DATEADD(SECOND, COALESCE(DATEDIFF(SECOND, FLP.InTime, FLP.OutTime), 0), 0), 'HH:mm:ss') AS Actual_Working_Hours,
    CASE
        WHEN FLP.InTime IS NULL THEN 'ABSENT'
        WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) <= 5 * 3600 THEN 'HALF DAY'  -- Less than 5 hours
        ELSE 'PRESENT'
    END AS Status,
    ud.Manager_Name,
    ud.Manager_Email,
    ud.HR_Mail
FROM FirstLastPunch FLP
LEFT JOIN TimeInnings TI ON FLP.USRID = TI.USRID AND FLP.PunchDate = TI.PunchDate
LEFT JOIN UserDetails ud ON FLP.USRID = ud.USRID
GROUP BY 
    FLP.USRID, 
    ud.Employee_Name, 
    FLP.PunchDate, 
    FLP.InTime, 
    FLP.OutTime, 
    ud.DEPARTMENT, 
    ud.TITLE, 
    ud.Manager_Name, 
    ud.Manager_Email, 
    ud.HR_Mail
ORDER BY FLP.PunchDate DESC;
      `);

    console.log(`Found ${result.recordset.length} records for user ${userId}`);
    res.json(result.recordset);
  } catch (error) {
    console.error("❌ Database query failed:", error);
    res.status(500).json({ error: error.message });
  }
});


// login route

app.get("/api/LOGIN", async (req, res) => {
  try {
    const pool = await sql.connect();
    console.log("✅ Database connected successfully on Vercel!"); // ✅ Logs in the console instead
    const result = await pool.request().query(`
    SELECT DISTINCT
    U.USRID,
    U.NM AS name,
    U.EML AS email,
    U.DEPARTMENT
FROM 
    (SELECT DISTINCT USRID FROM dbo.T_LG202402) AS LG
INNER JOIN 
    dbo.T_USR AS U ON LG.USRID = U.USRID;

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

    // Destructure and rename as needed
    const { 
      USRID,
      Date: PunchDate,
      inTime: InTime,
      OutTime,
      Status,
      EmpReason: Reason,
      EmpReqShow,
      MailSend,                    // ✅ Added here
      ManagerApproval,
      DEPARTMENT,
      EmpDate
    } = req.body;

    // // Logging
    // console.log("--------- ATTENDANCE DATA RECEIVED ---------");
    // console.log(`USRID: ${USRID} (${typeof USRID})`);
    // console.log(`PunchDate: ${PunchDate} (${typeof PunchDate})`);
    // console.log(`InTime: ${InTime} (${typeof InTime})`);
    // console.log(`OutTime: ${OutTime} (${typeof OutTime})`);
    // console.log(`Status: ${Status} (${typeof Status})`);
    // console.log(`Reason: ${Reason} (${typeof Reason})`);
    // console.log(`EmpReqShow: ${EmpReqShow} (${typeof EmpReqShow})`);
    // console.log(`MailSend: ${MailSend} (${typeof MailSend})`); // ✅
    // console.log(`ManagerApproval: ${ManagerApproval} (${typeof ManagerApproval})`);
    // console.log(`DEPARTMENT: ${DEPARTMENT} (${typeof DEPARTMENT})`);
    // console.log(`EmpDate: ${EmpDate} (${typeof EmpDate})`);
    // console.log("--------------------------------------------");

    if (!USRID || !PunchDate) {
      console.error("Missing required fields:", {
        USRID: USRID ? "✓" : "✗",
        PunchDate: PunchDate ? "✓" : "✗"
      });
      throw new Error("USRID and PunchDate are required");
    }

    const pool = await sql.connect();
    console.log("Database connection established");

    // Check if record exists
    const checkQuery = `
      SELECT * FROM T_EmpReq WHERE UserId = @USRID AND Date = @PunchDate
    `;
    const checkResult = await pool
      .request()
      .input("USRID", sql.VarChar, USRID)
      .input("PunchDate", sql.VarChar, PunchDate)
      .query(checkQuery);

    console.log("Check result:", checkResult.recordset.length > 0 ? "Record exists" : "No record found");

    if (checkResult.recordset.length > 0) {
      // ✅ UPDATE QUERY INCLUDING MailSend
      const updateQuery = `
        UPDATE T_EmpReq 
        SET InTime = @InTime,
            OutTime = @OutTime,
            EmpReason = @Reason,
            Status = @Status,
            EmpReqShow = @EmpReqShow,
            MailSend = @MailSend,
            ManagerApproval = @ManagerApproval,
            DEPARTMENT = @DEPARTMENT,
            EmpDate = @EmpDate
        WHERE UserId = @USRID AND Date = @PunchDate
      `;
      console.log("Updating record with query:", updateQuery);

      const updateResult = await pool
        .request()
        .input("USRID", sql.VarChar, USRID)
        .input("PunchDate", sql.VarChar, PunchDate)
        .input("InTime", sql.DateTime, InTime)
        .input("OutTime", sql.DateTime, OutTime)
        .input("Reason", sql.VarChar, Reason )
        .input("Status", sql.VarChar, Status )
        .input("EmpReqShow", sql.VarChar, EmpReqShow )
        .input("MailSend", sql.VarChar, MailSend || "N") // ✅ New binding
        .input("ManagerApproval", sql.VarChar, ManagerApproval )
        .input("DEPARTMENT", sql.VarChar, DEPARTMENT )
        .input("EmpDate", sql.DateTime, EmpDate || new Date())
        .query(updateQuery);

      console.log("Update result:", updateResult.rowsAffected[0] > 0 ? "Success" : "No rows updated");

    } else {
    
      const insertQuery = `
        INSERT INTO T_EmpReq (
          UserId,
          Date,
          InTime,
          OutTime,
          EmpReason,
          Status,
          EmpReqShow,
          MailSend,
          ManagerApproval,
          DEPARTMENT,
          EmpDate
        )
        VALUES (
          @USRID,
          @PunchDate,
          @InTime,
          @OutTime,
          @Reason,
          @Status,
          @EmpReqShow,
          @MailSend,
          @ManagerApproval,
          @DEPARTMENT,
          @EmpDate
        )
      `;
      console.log("Inserting new record with query:", insertQuery);

      const insertResult = await pool
        .request()
        .input("USRID", sql.VarChar, USRID)
        .input("PunchDate", sql.VarChar, PunchDate)
        .input("InTime", sql.DateTime, InTime)
        .input("OutTime", sql.DateTime, OutTime)
        .input("Reason", sql.VarChar, Reason || null)
        .input("Status", sql.VarChar, Status || null)
        .input("EmpReqShow", sql.VarChar, EmpReqShow || null)
        .input("MailSend", sql.VarChar, MailSend || "N") 
        .input("ManagerApproval", sql.VarChar, ManagerApproval || null)
        .input("DEPARTMENT", sql.VarChar, DEPARTMENT || null)
        .input("EmpDate", sql.DateTime, EmpDate || new Date())
        .query(insertQuery);

      console.log("Insert result:", insertResult.rowsAffected[0] > 0 ? "Success" : "No rows inserted");
    }

    res.status(200).json({
      message: "Attendance saved successfully",
      receivedData: { 
        USRID, 
        PunchDate, 
        InTime, 
        OutTime, 
        Status, 
        Reason,
        EmpReqShow,
        MailSend, 
        ManagerApproval,
        DEPARTMENT,
        EmpDate
      },
    });
  } catch (error) {
    console.error("Error saving attendance:", error);
    res.status(500).json({ 
      error: error.message,
      details: {
        code: error.code,
        state: error.state,
        procedure: error.procedure,
        lineNumber: error.lineNumber
      }
    });
  }
});





// Approve attendance route
app.post("/api/approve-attendance", async (req, res) => {
  try {
    const { UserID, Date } = req.body;
    console.log("Received approve attendance request with data:", {
      UserID,
      Date,
    });
    const USRID= UserID;
    const PunchDate= Date;

    if (!USRID || !PunchDate) {
      throw new Error("USRID and PunchDate are required");
    }

    const pool = await sql.connect();

    const result = await pool
      .request()
      .input("USRID", sql.VarChar, USRID)
      .input("PunchDate", sql.VarChar, PunchDate)
      .input("ManagerApproval", sql.VarChar, "Approved")
      .input("ApprovedDate", sql.DateTime, new Date())
      .query(`
        UPDATE T_EmpReq 
        SET ManagerApproal = @ManagerApproval,
            ManagerDate = @ApprovedDate
        WHERE UserID = @USRID AND Date = @PunchDate
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
      .input("ManagerApproval", sql.VarChar, "Approved")
      .input("ManagerDate", sql.DateTime, new Date())
      .query(`
        UPDATE T_EmpReq 
        SET ManagerApproal = @ManagerApproval,
            ManagerDate = @ManagerDate
        WHERE EmpReqShow = 'Yes' AND MailSend = 'Y' AND (ManagerApproal IS NULL OR ManagerApproal <> 'Approved')
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
