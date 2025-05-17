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
      const result = await pool
        .request()
        .input("userId", sql.VarChar, userId)
        .input("date", sql.VarChar, date).query(`
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
          exists: false,
        });
      }

      const record = result.recordset[0];
      console.log("Found record:", record);

      // Use the exact column names from the table
      const empReqShow = record.EmpReqShow;
      const mailSend = record.MailSend;

      // Logic for button status with exact case matching
      const saveButtonDisabled =
        empReqShow === "NO" || empReqShow === "No" || empReqShow === "no";
      const requestApprovalDisabled =
        (empReqShow === "YES" ||
          empReqShow === "Yes" ||
          empReqShow === "yes") &&
        (mailSend === "Y" || mailSend === "y");

      res.json({
        saveButtonDisabled,
        requestApprovalDisabled,
        exists: true,
        record: {
          empReqShow,
          mailSend,
          inTime: record.inTime,
          outTime: record.OutTime,
          status: record.Status,
        },
      });
    } catch (error) {
      console.error("Query error:", error);
      res.json({
        saveButtonDisabled: false,
        requestApprovalDisabled: false,
        exists: false,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("Error checking button status:", error);
    res.json({
      saveButtonDisabled: false,
      requestApprovalDisabled: false,
      exists: false,
      error: error.message,
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

    // Use the correct query structure with proper field ordering
    const result = await pool.request().input("userId", sql.VarChar, userId)
      .query(`
      WITH Punches AS (
        SELECT USRID,
                FORMAT(SRVDT, 'yyyy-MM-dd') AS PunchDate,
               FORMAT(SRVDT, 'HH:mm:ss') AS PunchTime,
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
      ),
      UserDetails AS (
        SELECT 
            u.USRID,
            u.NM AS Employee_Name,
            u.USRUID,
            u.DEPARTMENT,
            u.TITLE,
            f5.VAL AS HR_Mail,
            f6.VAL AS Manager_Email,
            f7.VAL AS Manager_Name
        FROM BioStar2_ac.dbo.T_USR u
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f5 ON u.USRUID = f5.USRUID AND f5.CUSFLDUID = 5
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f6 ON u.USRUID = f6.USRUID AND f6.CUSFLDUID = 6
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f7 ON u.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
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
            WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) <= 5 * 3600 THEN 'HALF DAY'
            ELSE 'PRESENT'
        END AS Status,
        ud.Manager_Name,
        ud.Manager_Email,
        ud.HR_Mail
      FROM FirstLastPunch FLP
      LEFT JOIN TimeInnings TI ON FLP.USRID = TI.USRID AND FLP.PunchDate = TI.PunchDate
      LEFT JOIN UserDetails ud ON FLP.USRID = ud.USRID
      WHERE (ud.Employee_Name IS NOT NULL) AND
        (FLP.USRID = @userId OR ud.Manager_Name = (SELECT NM FROM BioStar2_ac.dbo.T_USR WHERE USRID = @userId))
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
      U.DEPARTMENT,
      f7.VAL AS Manager_Name
    FROM 
      (SELECT DISTINCT USRID FROM dbo.T_LG202402) AS LG
    INNER JOIN 
      dbo.T_USR AS U ON LG.USRID = U.USRID
    LEFT JOIN 
      dbo.T_USRCUSFLD f7 ON U.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
    WHERE 
      U.NM IS NOT NULL;
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
      MailSend, // ✅ Added here
      ManagerApproval,
      DEPARTMENT,
      EmpDate,
      // Add the new fields
      HR_Mail,
      Manager_Name,
      Manager_Email,
      DeviceInTime,
      DeviceOutTime
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
    // console.log(`HR_Mail: ${HR_Mail} (${typeof HR_Mail})`);
    // console.log(`Manager_Name: ${Manager_Name} (${typeof Manager_Name})`);
    // console.log(`Manager_Email: ${Manager_Email} (${typeof Manager_Email})`);
    // console.log(`DeviceInTime: ${DeviceInTime} (${typeof DeviceInTime})`);
    // console.log(`DeviceOutTime: ${DeviceOutTime} (${typeof DeviceOutTime})`);
    // console.log("--------------------------------------------");

    if (!USRID || !PunchDate) {
      console.error("Missing required fields:", {
        USRID: USRID ? "✓" : "✗",
        PunchDate: PunchDate ? "✓" : "✗",
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

    console.log(
      "Check result:",
      checkResult.recordset.length > 0 ? "Record exists" : "No record found"
    );

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
            EmpDate = @EmpDate,
            HrManagerEmail = @HrManagerEmail,
            ManagerName = @ManagerName,
            MEmail = @MEmail,
            ActualPunch = @ActualPunch,
            LastPanch = @LastPanch
        WHERE UserId = @USRID AND Date = @PunchDate
      `;
      console.log("Updating record with query:", updateQuery);

      const updateResult = await pool
        .request()
        .input("USRID", sql.VarChar, USRID)
        .input("PunchDate", sql.VarChar, PunchDate)
        .input("InTime", sql.DateTime, InTime)
        .input("OutTime", sql.DateTime, OutTime)
        .input("Reason", sql.VarChar, Reason)
        .input("Status", sql.VarChar, Status)
        .input("EmpReqShow", sql.VarChar, EmpReqShow)
        .input("MailSend", sql.VarChar, MailSend || "N") // ✅ New binding
        .input("ManagerApproval", sql.VarChar, ManagerApproval)
        .input("DEPARTMENT", sql.VarChar, DEPARTMENT)
        .input("EmpDate", sql.DateTime, EmpDate || new Date())
        .input("HrManagerEmail", sql.VarChar, HR_Mail)
        .input("ManagerName", sql.VarChar, Manager_Name)
        .input("MEmail", sql.VarChar, Manager_Email)
        .input("ActualPunch", sql.VarChar, DeviceInTime)
        .input("LastPanch", sql.VarChar, DeviceOutTime)
        .query(updateQuery);

      console.log(
        "Update result:",
        updateResult.rowsAffected[0] > 0 ? "Success" : "No rows updated"
      );
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
          EmpDate,
          HrManagerEmail,
          ManagerName,
          MEmail,
          ActualPunch,
          LastPanch
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
          @EmpDate,
          @HrManagerEmail,
          @ManagerName,
          @MEmail,
          @ActualPunch,
          @LastPanch
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
        .input("HrManagerEmail", sql.VarChar, HR_Mail || null)
        .input("ManagerName", sql.VarChar, Manager_Name || null)
        .input("MEmail", sql.VarChar, Manager_Email || null)
        .input("ActualPunch", sql.VarChar, DeviceInTime || null)
        .input("LastPanch", sql.VarChar, DeviceOutTime || null)
        .query(insertQuery);

      console.log(
        "Insert result:",
        insertResult.rowsAffected[0] > 0 ? "Success" : "No rows inserted"
      );
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
        EmpDate,
        HR_Mail,
        Manager_Name,
        Manager_Email,
        DeviceInTime,
        DeviceOutTime
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
        lineNumber: error.lineNumber,
      },
    });
  }
});

// Approve attendance route
app.post("/api/approve-attendance", async (req, res) => {
  try {
    const { UserID, Date, ManagerApproval, MReason, ManagerDate } = req.body;
    console.log("Received data:", {
      UserID,
      Date,
      ManagerApproval,
      MReason,
      ManagerDate,
    });

    const USRID = UserID;
    const PunchDate = Date;

    if (!USRID || !PunchDate) {
      throw new Error("USRID and PunchDate are required");
    }

    const pool = await sql.connect();
    console.log("conneted for approval");

    const result = await pool
      .request()
      .input("USRID", sql.VarChar, USRID)
      .input("PunchDate", sql.VarChar, PunchDate)
      .input("ManagerApproval", sql.VarChar, ManagerApproval)
      .input("MailSend", sql.VarChar, "Y")
      .input("MReason", sql.VarChar, MReason)
      .input("ManagerDate", sql.DateTime, ManagerDate || new Date()).query(`
        UPDATE T_EmpReq 
        SET 
            ManagerApproval = @ManagerApproval,
            ManagerDate = @ManagerDate,
            MailSend= @MailSend,
            MReason= @MReason
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
      .input("ManagerDate", sql.DateTime, new Date()).query(`
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

// New endpoint to fetch attendance data for managers (admins) who can see both their own and their employees' data
app.get("/api/admin-attendance", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    console.log(`Fetching admin attendance data for user: ${userId}`);

    const pool = await sql.connect();
    console.log("✅ Database connected successfully!");

    // First, determine if the user is a SUPERADMIN by checking their Manager_Name
    const checkUserRoleQuery = `
      SELECT 
          u.USRID,
          u.NM AS Employee_Name,
          f7.VAL AS Manager_Name
      FROM BioStar2_ac.dbo.T_USR u
      LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f7 ON u.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
      WHERE u.USRID = @userId
    `;

    const userRoleCheck = await pool
      .request()
      .input("userId", sql.VarChar, userId)
      .query(checkUserRoleQuery);

    // Check user's role
    const isSuperAdmin =
      userRoleCheck.recordset.length > 0 &&
      userRoleCheck.recordset[0].Manager_Name === "SUPERADMIN";

    const isManager =
      userRoleCheck.recordset.length > 0 &&
      userRoleCheck.recordset[0].Employee_Name !== null;

    const userName = userRoleCheck.recordset[0]?.Employee_Name || null;

    console.log(
      `User ${userId} is ${isSuperAdmin
        ? "SUPERADMIN"
        : isManager
          ? "a manager"
          : "a regular employee"
      }`
    );

    let query = "";

    if (isSuperAdmin) {
      // For SUPERADMIN, fetch all users' attendance
      query = `
      WITH Punches AS (
        SELECT USRID,
              FORMAT(SRVDT, 'yyyy-MM-dd') AS PunchDate,
              FORMAT(SRVDT, 'HH:mm:ss') AS PunchTime,
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
      ),
      UserDetails AS (
        SELECT 
            u.USRID,
            u.NM AS Employee_Name,
            u.USRUID,
            u.DEPARTMENT,
            u.TITLE,
            f5.VAL AS HR_Mail,
            f6.VAL AS Manager_Email,
            f7.VAL AS Manager_Name
        FROM BioStar2_ac.dbo.T_USR u
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f5 ON u.USRUID = f5.USRUID AND f5.CUSFLDUID = 5
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f6 ON u.USRUID = f6.USRUID AND f6.CUSFLDUID = 6
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f7 ON u.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
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
            WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) <= 5 * 3600 THEN 'HALF DAY'
            ELSE 'PRESENT'
        END AS Status,
        ud.Manager_Name,
        ud.Manager_Email,
        ud.HR_Mail
      FROM FirstLastPunch FLP
      LEFT JOIN TimeInnings TI ON FLP.USRID = TI.USRID AND FLP.PunchDate = TI.PunchDate
      LEFT JOIN UserDetails ud ON FLP.USRID = ud.USRID
      WHERE ud.Employee_Name IS NOT NULL
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
      `;
    } else {
      // For regular managers, fetch their own attendance and their direct reports
      query = `
      WITH Punches AS (
        SELECT USRID,
              FORMAT(SRVDT, 'yyyy-MM-dd') AS PunchDate,
              FORMAT(SRVDT, 'HH:mm:ss') AS PunchTime,
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
      ),
      UserDetails AS (
        SELECT 
            u.USRID,
            u.NM AS Employee_Name,
            u.USRUID,
            u.DEPARTMENT,
            u.TITLE,
            f5.VAL AS HR_Mail,
            f6.VAL AS Manager_Email,
            f7.VAL AS Manager_Name
        FROM BioStar2_ac.dbo.T_USR u
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f5 ON u.USRUID = f5.USRUID AND f5.CUSFLDUID = 5
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f6 ON u.USRUID = f6.USRUID AND f6.CUSFLDUID = 6
        LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f7 ON u.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
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
            WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) <= 5 * 3600 THEN 'HALF DAY'
            ELSE 'PRESENT'
        END AS Status,
        ud.Manager_Name,
        ud.Manager_Email,
        ud.HR_Mail
      FROM FirstLastPunch FLP
      LEFT JOIN TimeInnings TI ON FLP.USRID = TI.USRID AND FLP.PunchDate = TI.PunchDate
      LEFT JOIN UserDetails ud ON FLP.USRID = ud.USRID
      WHERE ud.Employee_Name IS NOT NULL AND 
        (FLP.USRID = @userId OR ud.Manager_Name = @userName) -- Only direct reports
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
      `;
    }

    const result = await pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("userName", sql.NVarChar, userName)
      .query(query);

    console.log(
      `Found ${result.recordset.length} records for user ${userId} (${isSuperAdmin ? "SUPERADMIN" : "manager"
      } mode)`
    );
    res.json(result.recordset);
  } catch (error) {
    console.error("❌ Database query failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to check if a user is an admin based on Manager_Name being null
app.get("/api/check-admin-status", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const pool = await sql.connect();

    const checkUserRoleQuery = `
      SELECT 
          u.USRID,
          u.NM AS Employee_Name,
          f7.VAL AS Manager_Name
      FROM BioStar2_ac.dbo.T_USR u
      LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f7 ON u.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
      WHERE u.USRID = @userId
    `;

    const userRoleCheck = await pool
      .request()
      .input("userId", sql.VarChar, userId)
      .query(checkUserRoleQuery);

    // Check user's role
    const isSuperAdmin =
      userRoleCheck.recordset.length > 0 &&
      userRoleCheck.recordset[0].Manager_Name === "SUPERADMIN";

    // Regular manager check - has employees assigned to them
    const getUsersManageredQuery = `
      SELECT COUNT(*) AS EmployeeCount
      FROM BioStar2_ac.dbo.T_USR u
      LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f7 ON u.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
      WHERE f7.VAL = (SELECT NM FROM BioStar2_ac.dbo.T_USR WHERE USRID = @userId)
    `;

    const managerCheck = await pool
      .request()
      .input("userId", sql.VarChar, userId)
      .query(getUsersManageredQuery);

    const isManager = managerCheck.recordset[0].EmployeeCount > 0;

    console.log(
      `Role status check for user ${userId}: ${isSuperAdmin ? "SUPERADMIN" : isManager ? "Manager" : "Regular Employee"
      }`
    );

    res.json({
      isSuperAdmin,
      isManager,
      isAdmin: isSuperAdmin, // For backwards compatibility
      managerName: userRoleCheck.recordset[0]?.Manager_Name || null,
      userName: userRoleCheck.recordset[0]?.Employee_Name || null,
      employeeCount: managerCheck.recordset[0].EmployeeCount,
    });
  } catch (error) {
    console.error("Error checking admin status:", error);
    res.status(500).json({ error: "Error checking admin status" });
  }
});

// Add new endpoint to check if a record exists and is eligible for approval
app.get("/api/check-approval-eligibility", async (req, res) => {
  try {
    const { userId, date } = req.query;

    if (!userId || !date) {
      return res.status(400).json({ error: "User ID and date are required" });
    }

    console.log(`Checking approval eligibility for user ${userId} on date ${date}`);

    const pool = await sql.connect();

    // Check if the record exists and get its status
    const checkQuery = `
      SELECT TOP 1 ManagerApproval, EmpReqShow, MailSend
      FROM T_EmpReq 
      WHERE UserId = @userId AND Date = @date
    `;

    const result = await pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("date", sql.VarChar, date)
      .query(checkQuery);

    if (result.recordset.length === 0) {
      // Record does not exist
      console.log(`No record found for user ${userId} on date ${date}`);
      return res.json({ 
        exists: false, 
        eligibleForApproval: false,
        message: "Record not found in the system" 
      });
    }

    // Record exists, check its status
    const record = result.recordset[0];
    const status = record.ManagerApproval || "Pending"; // Default to Pending if null
    const empReqShow = record.EmpReqShow || "No";
    const mailSend = record.MailSend || "N";

    console.log(`Record found for user ${userId} on date ${date} with status: ${status}`);
    
    // Check if eligible for approval
    // A record is eligible if:
    // 1. It has ManagerApproval = "Pending" or null
    // 2. It has been submitted for approval (empReqShow = "Yes")
    const isEligible = (
      (status === "Pending" || status === null) && 
      (empReqShow === "Yes" || empReqShow === "YES" || empReqShow === "yes")
    );

    res.json({
      exists: true,
      status: status,
      empReqShow: empReqShow,
      mailSend: mailSend,
      eligibleForApproval: isEligible,
      message: isEligible 
        ? "Record is eligible for approval" 
        : `Record exists but has status "${status}" and empReqShow="${empReqShow}"`
    });
  } catch (error) {
    console.error("Error checking approval eligibility:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
