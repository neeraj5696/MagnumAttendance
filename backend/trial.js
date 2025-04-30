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
      .input("USRID", sql.VarChar, USRID)
      .input("PunchDate", sql.VarChar, PunchDate)
      .query(
        `SELECT * FROM T_EmpReq WHERE USRID = @USRID AND SRVDT = @PunchDate`
      );

      if (checkResult.recordset.length > 0) {
            // Update existing record
            await pool.request()
              .input('USRID', sql.VarChar, USRID)
              .input('PunchDate', sql.VarChar, PunchDate)
              .input('InTime', sql.VarChar, InTime || null)
              .input('OutTime', sql.VarChar, OutTime || null)
              .input('Status', sql.VarChar, Status)
              .input('Reason', sql.VarChar, Reason)
              .input('UpdatedDate', sql.DateTime, new Date())
              .query(`
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
            await pool.request()
              .input('USRID', sql.VarChar, USRID)
              .input('PunchDate', sql.VarChar, PunchDate)
              .input('InTime', sql.VarChar, InTime || null)
              .input('OutTime', sql.VarChar, OutTime || null)
              .input('Status', sql.VarChar, Status)
              .input('Reason', sql.VarChar, Reason)
              .input('CreatedDate', sql.DateTime, new Date())
              .input('IsApproved', sql.Bit, 0)
              .input('ApprovalRequested', sql.Bit, 0)
              .query(`
                INSERT INTO T_EmpReq (USRID, SRVDT, InTime, OutTime, Status, Reason, CreatedDate, IsApproved, ApprovalRequested)
                VALUES (@USRID, @PunchDate, @InTime, @OutTime, @Status, @Reason, @CreatedDate, @IsApproved, @ApprovalRequested)
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
