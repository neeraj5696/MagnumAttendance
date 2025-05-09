

///SAVETHE DAATA 

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


/// APPROVAL DTAA