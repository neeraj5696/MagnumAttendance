import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css"; // Import custom CSS

const API_BASE_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

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

  const HandleSave = async (index) => {
    const record = filteredData[index];
    const timeInput = timeInputs[index] || {};
    const statusInput = statusInputs[index] || record.Status;
    const reasonInput = reasonInputs[index] || "";

    try {
      await axios.post(`${API_BASE_URL}/api/save-attendance`, {
        USRID: record.USRID,
        PunchDate: record.PunchDate,
        InTime: timeInput.inTime,
        OutTime: timeInput.outTime,
        Status: statusInput,
        Reason: reasonInput,
      });

      alert("Attendance saved successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error("Error saving attendance:", error);
      alert("Error saving attendance. Please try again.");
    }
  };

  const handleRequestApproval = async (index) => {
    const record = filteredData[index];
    const timeInput = timeInputs[index] || {};
    const statusInput = statusInputs[index] || record.Status;
    const reasonInput = reasonInputs[index] || "";

    try {
      await axios.post(`${API_BASE_URL}/api/request-approval`, {
        USRID: record.USRID,
        PunchDate: record.PunchDate,
        Status: statusInput,
        Reason: reasonInput,
      });

      alert("Approval requested successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error("Error requesting approval:", error);
      alert("Error requesting approval. Please try again.");
    }
  };

  const HandleApprove = async (index) => {
    const record = filteredData[index];

    try {
      await axios.post(`${API_BASE_URL}/api/approve-attendance`, {
        USRID: record.USRID,
        PunchDate: record.PunchDate,
      });

      alert("Attendance approved successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error("Error approving attendance:", error);
      alert("Error approving attendance. Please try again.");
    }
  };

  const HandleApproveAll = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/approve-all`);
      alert("All attendance records approved successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error("Error approving all attendance:", error);
      alert("Error approving all attendance. Please try again.");
    }
  };

  // Function to handle filter
  const handleFilter = () => {
    let filtered = [...attendanceData];

    if (selectedEmployee !== "-1") {
      filtered = filtered.filter((record) => record.USRID === selectedEmployee);
    }

    setFilteredData(filtered);
    setIsFiltered(true);
  };

  // Function to reset filters
  const handleReset = () => {
    setFilteredData(attendanceData);
    setSelectedEmployee("-1");
    setIsFiltered(false);
  };

  // Function to calculate row background color based on status
  const getRowStyle = (record) => {
    if (!record.InTime || !record.OutTime)
      return { backgroundColor: "#eb3434", color: "white" };
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
                  <button onClick={()=> HandleApprove(index)} title="Approve">
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
                  onClick={()=>HandleApproveAll}
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
