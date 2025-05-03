import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css"; // Import custom CSS

// makeing the dynaic backend address
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000`;

// Add console log to check environment variable
console.log("API_BASE_URL:", API_BASE_URL);

const Attendance = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("-1");
  const [selectedMonth, setSelectedMonth] = useState("Feb-25");
  const [showMispunchesOnly, setShowMispunchesOnly] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);
  const [statusInputs, setStatusInputs] = useState({});
  const [reasonInputs, setReasonInputs] = useState({});

  // Time input states
  const [timeInputs, setTimeInputs] = useState({});

  useEffect(() => {
    fetchAttendanceData();
  }, []);

  // Add new useEffect to handle filtering when selectedEmployee changes
  useEffect(() => {
    if (selectedEmployee !== "-1") {
      const filtered = attendanceData.filter(
        (record) => record.USRID === selectedEmployee
      );
      setFilteredData(filtered);
      setIsFiltered(true);
    } else {
      setFilteredData(attendanceData);
      setIsFiltered(false);
    }
  }, [selectedEmployee, attendanceData]);

  // Function to check if a record has mispunch (missing or invalid inTime or outTime)
  const isMispunch = (record) => {
    // Check for null, empty string, or placeholder values
    const missingInTime =
      !record.InTime || record.InTime === "" || record.InTime === "--";
    const missingOutTime =
      !record.OutTime || record.OutTime === "" || record.OutTime === "--";

    return missingInTime || missingOutTime;
  };
  const fetchAttendanceData = async () => {
    try {
      console.log("Fetching from:", API_BASE_URL); // Debug log
      const response = await axios.get(`${API_BASE_URL}/api/test-db`);
      setAttendanceData(response.data);
      setFilteredData(response.data);
    } catch (error) {
      console.error("Error fetching attendance data:", error);
    }
  };

  const calculateWorkingHours = (inTime, outTime) => {
    if (!inTime || !outTime) {
      return "00:00";
    }

    const inDate = new Date(`1970-01-01T${inTime}:00`);
    const outDate = new Date(`1970-01-01T${outTime}:00`);
    const diffInMilliseconds = outDate - inDate;

    if (diffInMilliseconds < 0) {
      return "00:00"; // Handle cases where outTime is earlier than inTime
    }

    const hours = Math.floor(diffInMilliseconds / 3600000);
    const minutes = Math.floor((diffInMilliseconds % 3600000) / 60000);

    const formattedHours = hours.toString().padStart(2, "0");
    const formattedMinutes = minutes.toString().padStart(2, "0");

    return `${formattedHours}:${formattedMinutes}`;
  };

  const handleTimeChange = (index, type, value) => {
    setTimeInputs((prev) => {
      const currentRow = prev[index] || {
        inTime: "",
        outTime: "",
        hours: "00:00",
      };
      const updatedRow = {
        ...currentRow,
        [type]: value,
      };

      if (type === "inTime" || type === "outTime") {
        updatedRow.hours = calculateWorkingHours(
          type === "inTime" ? value : currentRow.inTime,
          type === "outTime" ? value : currentRow.outTime
        );
      }

      return {
        ...prev,
        [index]: updatedRow,
      };
    });
  };

  const handleStatusChange = (index, value) => {
    setStatusInputs((prev) => ({
      ...prev,
      [index]: value,
    }));
  };
  function getCurrentSQLDateTime() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  const sqlDateTime = getCurrentSQLDateTime();

  const formatDateTime = (date, time) => {
    if (!time) return null;
    // Ensure time is in HH:mm:ss format
    const timeParts = time.split(":");
    const formattedTime =
      timeParts.length === 2
        ? `${time}:00` // Add seconds if missing
        : time;
    // Format to match SQL datetime: 'YYYY-MM-DD HH:mm:ss.000'
    return `${date} ${formattedTime}.000`;
  };

  const HandleSave = async (index) => {
    const record = filteredData[index];
    const timeInput = timeInputs[index] || {};
    const statusInput = statusInputs[index] || record.Status;
    const reasonInput = reasonInputs[index] || "";
    const DEPARTMENT = record.DEPARTMENT;
    const EmpDate = sqlDateTime;

    // Format the datetime values
    const formattedInTime = formatDateTime(record.PunchDate, timeInput.inTime);
    const formattedOutTime = formatDateTime(
      record.PunchDate,
      timeInput.outTime
    );

    const saveData = {
      USRID: record.USRID,
      PunchDate: record.PunchDate,
      InTime: formattedInTime,
      OutTime: formattedOutTime,
      Status: statusInput,
      Reason: reasonInput,
      EmpReqShow: "No",
      ManagerApproval: "Pending",
      DEPARTMENT: DEPARTMENT,
      EmpDate: EmpDate,
    };

    // Added: Show data in console log and alert before sending
    console.log("Data to be sent:", saveData);
    alert(`Data to be sent: ${JSON.stringify(saveData, null, 2)}`);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/save-attendance`,
        saveData
      );
      console.log("Save response:", response.data);
      alert("Attendance saved successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error(
        "Error saving attendance:",
        error.response?.data || error.message
      );
      alert(
        `Error saving attendance: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  };

  const handleRequestApproval = async (index) => {
    const record = filteredData[index];
    const timeInput = timeInputs[index] || {};
    const statusInput = statusInputs[index] || record.Status;
    const reasonInput = reasonInputs[index] || "";

    const approvalData = {
      USRID: record.USRID,
      PunchDate: record.PunchDate,
      Status: statusInput,
      Reason: reasonInput,
    };

    console.log("Requesting approval with data:", approvalData);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/request-approval`,
        approvalData
      );
      console.log("Approval request response:", response.data);
      alert("Approval requested successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error(
        "Error requesting approval:",
        error.response?.data || error.message
      );
      alert(
        `Error requesting approval: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  };

  const HandleApprove = async (index) => {
    const record = filteredData[index];
    const approveData = {
      USRID: record.USRID,
      PunchDate: record.PunchDate,
    };

    console.log("Approving attendance with data:", approveData);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/approve-attendance`,
        approveData
      );
      console.log("Approve response:", response.data);
      alert("Attendance approved successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error(
        "Error approving attendance:",
        error.response?.data || error.message
      );
      alert(
        `Error approving attendance: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  };

  const HandleApproveAll = async () => {
    console.log("Approving all attendance records");

    try {
      const response = await axios.post(`${API_BASE_URL}/api/approve-all`);
      console.log("Approve all response:", response.data);
      alert("All attendance records approved successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error(
        "Error approving all attendance:",
        error.response?.data || error.message
      );
      alert(
        `Error approving all attendance: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  };

  // Function to handle filter - updated to include mispunch filter
  const handleFilter = () => {
    let filtered = [...attendanceData];

    // Filter by employee if selected
    if (selectedEmployee !== "-1") {
      filtered = filtered.filter((record) => record.USRID === selectedEmployee);
    }

    // Filter by mispunches if checkbox is checked
    if (showMispunchesOnly) {
      filtered = filtered.filter((record) => isMispunch(record));
    }

    setFilteredData(filtered);
    setIsFiltered(true);
  };

  const handleReset = () => {
    setFilteredData(attendanceData);
    setSelectedEmployee("-1");
    setShowMispunchesOnly(false);
    setIsFiltered(false);
  };

  // Function to calculate row background color based on status
  const getRowStyle = (record) => {
    if (!record.InTime || !record.OutTime)
      return { backgroundColor: "#b0b0b0", color: "white" };
    if (record.Status === "HALF DAY")
      return { backgroundColor: "#eb8934", color: "white" };
    if (record.Status === "REGULARIZED")
      return { backgroundColor: "#157d0a", color: "white" };
    if (record.Status === "ABSENT")
      return { backgroundColor: "#eb3434", color: "white" };
    return {};
  };

  // Get unique employees for dropdown
  const getUniqueEmployees = () => {
    if (!attendanceData || attendanceData.length === 0) {
      return [];
    }

    const uniqueEmployeesMap = new Map();

    attendanceData.forEach((record) => {
      if (record.USRID && record.Employee_Name) {
        if (!uniqueEmployeesMap.has(record.USRID)) {
          uniqueEmployeesMap.set(record.USRID, {
            id: record.USRID,
            name: record.Employee_Name,
          });
        }
      }
    });

    return Array.from(uniqueEmployeesMap.values());
  };

  // Get the unique employees list
  const uniqueEmployees = getUniqueEmployees();

  return (
    <div className="pageheaderr">
      <section className="pageheader">View / Regularize Attendance</section>

      <div className="row">
        <div className="column">Manager: Sameer Priyadarshi</div>
        <div className="column">
          Employee List:
          <select
            value={selectedEmployee}
            onChange={(e) => {
              console.log("Selected employee value:", e.target.value);
              setSelectedEmployee(e.target.value);
            }}
          >
            <option value="-1">Select</option>
            {uniqueEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
        <div className="column">
          Month:
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            <option value="Jan-25">Jan-25</option>
            <option value="Feb-25">Feb-25</option>
            <option value="Mar-25">Mar-25</option>
          </select>
        </div>
        <div className="column">
          <input
            type="checkbox"
            checked={showMispunchesOnly}
            onChange={(e) => setShowMispunchesOnly(e.target.checked)}
          />
          Mispunches
          <button className="filter-btn" onClick={handleFilter}>
            Filter
          </button>
          {isFiltered && (
            <button className="reset-btn" onClick={handleReset}>
              Reset
            </button>
          )}
        </div>
      </div>

      <section className="content">
        <table>
          <thead>
            <tr>
              <th colSpan="4"></th>
              <th colSpan="3">Devices</th>
              <th colSpan="3">Regularized</th>
              <th colSpan="3"></th>
            </tr>
            <tr>
              <th width="8%">Poornata ID</th>
              <th width="10%">Name</th>
              <th width="8%">Department</th>
              <th width="5%">Date</th>
              <th width="5%">IN</th>
              <th width="5%">OUT</th>
              <th width="5%">Hours</th>
              <th className="settimeE" width="6%">
                IN
              </th>
              <th className="settimeE" width="6%">
                OUT
              </th>
              <th width="5%">Hours</th>
              <th width="7%">Status</th>
              <th width="18%">Remarks</th>
              <th width="10%">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((record, index) => (
              <tr key={index} style={getRowStyle(record)}>
                <td>{record.Employee_ID}</td>
                <td>{record.Employee_Name}</td>
                <td>{record.DEPARTMENT}</td>
                <td>{record.PunchDate}</td>
                <td>{record.InTime || ""}</td>
                <td>{record.OutTime || ""}</td>
                <td>{record.Actual_Working_Hours || "00:00"}</td>
                <td className="settime">
                  <input
                    type="time"
                    value={timeInputs[index]?.inTime || ""}
                    onChange={(e) =>
                      handleTimeChange(index, "inTime", e.target.value)
                    }
                  />
                </td>
                <td className="settime">
                  <input
                    type="time"
                    value={timeInputs[index]?.outTime || ""}
                    onChange={(e) =>
                      handleTimeChange(index, "outTime", e.target.value)
                    }
                  />
                </td>
                <td>{timeInputs[index]?.hours || "00:00"}</td>
                <td>
                  <select
                    value={statusInputs[index] || record.Status}
                    onChange={(e) => handleStatusChange(index, e.target.value)}
                  >
                    <option value={record.Status}>{record.Status}</option>
                    {["ABSENT", "PRESENT", "HALF DAY", "ON DUTY"]
                      .filter((status) => status !== record.Status)
                      .map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  {record.Status === "PRESENT"
                    ? "No Action Needed"
                    : "Regularize Attendance"}
                </td>
                <td>
                  <button onClick={() => HandleSave(index)} title="Save">
                    💾
                  </button>
                  <button
                    onClick={() => handleRequestApproval(index)}
                    title="Request Approval"
                  >
                    📧
                  </button>
                  <button onClick={() => HandleApprove(index)} title="Approve">
                    👍
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="12" style={{ textAlign: "right" }}>
                Approve All:
              </td>
              <td>
                <button
                  onClick={() => HandleApproveAll}
                  title="Approve"
                  style={{ width: "100%" }}
                >
                  👍
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
};

export default Attendance;
