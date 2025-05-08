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
               FORMAT(SRVDT, 'yyyy-MM-dd') AS PunchDate,
               FORMAT(SRVDT, 'HH:mm:ss') AS PunchTime,
               DEVUID
        FROM BioStar2_ac.dbo.T_LG202502
        WHERE USRID = @userId AND DEVUID IN (547239461, 939342251, 546203817, 538167579, 541654478, 538210081, 788932322, 111111111)
        
        UNION ALL

        SELECT USRID, 
               FORMAT(SRVDT, 'yyyy-MM-dd') AS PunchDate,
               FORMAT(SRVDT, 'HH:mm:ss') AS PunchTime,
               DEVUID
        FROM BioStar2_ac.dbo.T_LG202404
        WHERE USRID = @userId AND DEVUID IN (547239461, 939342251, 546203817, 538167579, 541654478, 538210081, 788932322, 111111111)
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
           COALESCE(FLP.InTime, '--') AS InTime,
           COALESCE(FLP.OutTime, '--') AS OutTime,
           FORMAT(DATEADD(SECOND, COALESCE(SUM(TI.InTimeInnings), 0), 0), 'HH:mm:ss') AS Total_InTime,
           FORMAT(DATEADD(SECOND, COALESCE(DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) - SUM(TI.InTimeInnings), 0), 0), 'HH:mm:ss') AS Total_OutTime,
           FORMAT(DATEADD(SECOND, COALESCE(DATEDIFF(SECOND, FLP.InTime, FLP.OutTime), 0), 0), 'HH:mm:ss') AS Actual_Working_Hours,

           CASE 
               WHEN FLP.InTime IS NULL OR FLP.OutTime IS NULL THEN 'ABSENT'
               WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) < 18000 THEN 'HALF DAY' -- less than 5 hours
               ELSE 'PRESENT'
           END AS Status

    FROM FirstLastPunch FLP
    LEFT JOIN TimeInnings TI ON FLP.USRID = TI.USRID AND FLP.PunchDate = TI.PunchDate
    LEFT JOIN BioStar2_ac.dbo.T_USR TU ON FLP.USRID = TU.USRID
    WHERE TU.NM IS NOT NULL AND FLP.USRID = @userId
    GROUP BY FLP.USRID, TU.NM, FLP.PunchDate, FLP.InTime, FLP.OutTime, TU.DEPARTMENT, TU.TITLE
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

    const { 
      USRID,           // Maps to UserId column
      PunchDate,       // Maps to Date column
      InTime,          // Maps to InTime column (already formatted as 'YYYY-MM-DD HH:mm:ss.000')
      OutTime,         // Maps to OutTime column (already formatted as 'YYYY-MM-DD HH:mm:ss.000')
      Status,          // Maps to Status column
      Reason,          // Maps to EmpReason column
      EmpReqShow,      // Maps to EmpReqShow column
      ManagerApproval, // Maps to ManagerApproval column
      DEPARTMENT,      // Maps to DEPARTMENT column
      EmpDate          // Maps to EmpDate column
    } = req.body;

    // More detailed logging of the extracted data
    console.log("--------- ATTENDANCE DATA RECEIVED ---------");
    console.log(`USRID: ${USRID} (${typeof USRID})`);
    console.log(`PunchDate: ${PunchDate} (${typeof PunchDate})`);
    console.log(`InTime: ${InTime} (${typeof InTime})`);
    console.log(`OutTime: ${OutTime} (${typeof OutTime})`);
    console.log(`Status: ${Status} (${typeof Status})`);
    console.log(`Reason: ${Reason} (${typeof Reason})`);
    console.log(`EmpReqShow: ${EmpReqShow} (${typeof EmpReqShow})`);
    console.log(`ManagerApproval: ${ManagerApproval} (${typeof ManagerApproval})`);
    console.log(`DEPARTMENT: ${DEPARTMENT} (${typeof DEPARTMENT})`);
    console.log(`EmpDate: ${EmpDate} (${typeof EmpDate})`);
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
    console.log("Database connection established");
    
    // Check if record exists
    const checkQuery = `SELECT * FROM T_EmpReq WHERE UserId = @USRID AND Date = @PunchDate`;
    console.log("Checking existing record with query:", checkQuery);
    
    const checkResult = await pool
      .request()
      .input("USRID", sql.VarChar, USRID)
      .input("PunchDate", sql.VarChar, PunchDate)
      .query(checkQuery);
    
    console.log("Check result:", checkResult.recordset.length > 0 ? "Record exists" : "No record found");

    if (checkResult.recordset.length > 0) {
      // Update existing record
      const updateQuery = `
        UPDATE T_EmpReq 
        SET InTime = @InTime,           -- Column: InTime (datetime)
            OutTime = @OutTime,         -- Column: OutTime (datetime)
            EmpReason = @Reason,        -- Column: EmpReason (varchar)
            Status = @Status,           -- Column: Status (varchar)
            EmpReqShow = @EmpReqShow,   -- Column: EmpReqShow (varchar)
            ManagerApproval = @ManagerApproval, -- Column: ManagerApproval (varchar)
            DEPARTMENT = @DEPARTMENT,    -- Column: DEPARTMENT (varchar)
            EmpDate = @EmpDate          -- Column: EmpDate (datetime)
        WHERE UserId = @USRID AND Date = @PunchDate
      `;
      console.log("Updating record with query:", updateQuery);
      
      const updateResult = await pool
        .request()
        .input("USRID", sql.VarChar, USRID)
        .input("PunchDate", sql.VarChar, PunchDate)
        .input("InTime", sql.DateTime, InTime)
        .input("OutTime", sql.DateTime, OutTime)
        .input("Reason", sql.VarChar, Reason || null)
        .input("Status", sql.VarChar, Status || null)
        .input("EmpReqShow", sql.VarChar, EmpReqShow || null)
        .input("ManagerApproval", sql.VarChar, ManagerApproval || null)
        .input("DEPARTMENT", sql.VarChar, DEPARTMENT || null)
        .input("EmpDate", sql.DateTime, EmpDate || new Date())
        .query(updateQuery);
      
      console.log("Update result:", updateResult.rowsAffected[0] > 0 ? "Success" : "No rows updated");
    } else {
      // Insert new record
      const insertQuery = `
        INSERT INTO T_EmpReq (
          UserId,        -- Column: UserId (varchar)
          Date,          -- Column: Date (varchar)
          InTime,        -- Column: InTime (datetime)
          OutTime,       -- Column: OutTime (datetime)
          EmpReason,     -- Column: EmpReason (varchar)
          Status,        -- Column: Status (varchar)
          EmpReqShow,    -- Column: EmpReqShow (varchar)
          ManagerApproval, -- Column: ManagerApproval (varchar)
          DEPARTMENT,    -- Column: DEPARTMENT (varchar)
          EmpDate        -- Column: EmpDate (datetime)
        )
        VALUES (
          @USRID,
          @PunchDate,
          @InTime,
          @OutTime,
          @Reason,
          @Status,
          @EmpReqShow,
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
        .input("ManagerApproval", sql.VarChar, ManagerApproval || null)
        .input("DEPARTMENT", sql.VarChar, DEPARTMENT || null)
        .input("EmpDate", sql.DateTime, EmpDate || new Date())
        .query(insertQuery);
      
      console.log("Insert result:", insertResult.rowsAffected[0] > 0 ? "Success" : "No rows inserted");
    }

    // Success response
    console.log("Attendance data processed successfully");
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
        ManagerApproval,
        DEPARTMENT,
        EmpDate
      },
    });
  } catch (error) {
    console.error("Error saving attendance:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      state: error.state,
      procedure: error.procedure,
      lineNumber: error.lineNumber
    });
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


// Request approval route
app.post("/api/request-approval", async (req, res) => {
  try {
    const { USRID, PunchDate, Status, Reason, EmpReqShow, MailSend } = req.body;
    console.log("Received approval request with data:", {
      USRID,
      PunchDate,
      Status,
      Reason,
      EmpReqShow,
      MailSend
    });

    if (!USRID || !PunchDate) {
      throw new Error("USRID and PunchDate are required");
    }

    const pool = await sql.connect();

    // Check if record exists
    const checkResult = await pool
      .request()
      .input("USRID", sql.VarChar, USRID)
      .input("PunchDate", sql.VarChar, PunchDate)
      .query(`SELECT * FROM T_EmpReq WHERE USRID = @USRID AND PunchDate = @PunchDate`);

    if (checkResult.recordset.length > 0) {
      // Update existing record
      await pool
        .request()
        .input("USRID", sql.VarChar, USRID)
        .input("PunchDate", sql.VarChar, PunchDate)
        .input("Status", sql.VarChar, Status)
        .input("Reason", sql.VarChar, Reason)
        .input("EmpReqShow", sql.VarChar, EmpReqShow || 'Yes')
        .input("MailSend", sql.Char, MailSend || 'Y')
        .input("UpdatedDate", sql.DateTime, new Date())
        .query(`
          UPDATE T_EmpReq 
          SET Status = @Status, 
              EmpReason = @Reason,
              EmpDate = @UpdatedDate,
              EmpReqShow = @EmpReqShow,
              MailSend = @MailSend
          WHERE UserID = @USRID AND Date = @PunchDate
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
        .input("EmpReqShow", sql.VarChar, EmpReqShow || 'Yes')
        .input("MailSend", sql.Char, MailSend || 'Y')
        .input("CreatedDate", sql.DateTime, new Date())
        .query(`
          INSERT INTO T_EmpReq (
            UserID, 
            Date, 
            Status, 
            EmpReason, 
            EmpDate,
            EmpReqShow,
            MailSend
          )
          VALUES (
            @USRID, 
            @PunchDate, 
            @Status, 
            @Reason, 
            @CreatedDate,
            @EmpReqShow,
            @MailSend
          )
        `);
      console.log("Created new approval request");
    }

    res.status(200).json({ 
      message: "Approval requested successfully",
      data: {
        USRID,
        PunchDate,
        Status,
        Reason,
        EmpReqShow: EmpReqShow || 'Yes',
        MailSend: MailSend || 'Y'
      }
    });
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
