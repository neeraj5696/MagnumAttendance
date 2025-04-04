import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css"; // Import custom CSS

const Attendance = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("-1");
  const [selectedMonth, setSelectedMonth] = useState("Feb-25");
  const [showMispunchesOnly, setShowMispunchesOnly] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);

  useEffect(() => {
    fetchAttendanceData();
  }, []);

  const fetchAttendanceData = async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/test-db");
      setAttendanceData(response.data);
      setFilteredData(response.data); // Initially show all data
    } catch (error) {
      console.error("Error fetching attendance data:", error);
    }
  };

  // Function to handle filter
  const handleFilter = () => {
    let filtered = [...attendanceData];
    
    // Filter by employee if not "All"
    if (selectedEmployee !== "-1") {
      filtered = filtered.filter(record => record.Employee_ID === selectedEmployee);
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
    if (!record.InTime || !record.OutTime) return { backgroundColor: "#eb3434", color: "white" };
    if (record.Status === "HALF DAY") return { backgroundColor: "#eb8934", color: "white" };
    if (record.Status === "REGULARIZED") return { backgroundColor: "#157d0a", color: "white" };
    return {};
  };

  // Get unique employees for dropdown
  const getUniqueEmployees = () => {
    const uniqueEmployees = new Set();
    attendanceData.forEach(record => {
      if (record.Employee_ID && record.Employee_Name) {
        uniqueEmployees.add(JSON.stringify({
          id: record.Employee_ID,
          name: record.Employee_Name
        }));
      }
    });
    return Array.from(uniqueEmployees).map(emp => JSON.parse(emp));
  };

  return (
    <div>
      <section className="pageheader">View / Regularize Attendance</section>
      
      <div className="row">
        <div className="column">Manager: Sameer Priyadarshi</div>
        <div className="column">
          Employee List: 
          <select 
            value={selectedEmployee} 
            onChange={(e) => setSelectedEmployee(e.target.value)}
          >
            <option value="-1">Select</option>
            {getUniqueEmployees().map(emp => (
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
              <th width="12%">Name</th>
              <th width="10%">Department</th>
              <th width="5%">Date</th>
              <th width="5%">IN</th>
              <th width="5%">OUT</th>
              <th width="5%">Hours</th>
              <th width="5%">IN</th>
              <th width="5%">OUT</th>
              <th width="5%">Hours</th>
              <th width="7%">Status</th>
              <th width="18%">Remarks</th>
              <th width="10%">Action</th>
            </tr>
          </thead>
          <tbody>
            {(filteredData.length > 0 ? filteredData : attendanceData).map((record, index) => (
              <tr key={index} style={getRowStyle(record)}>
                <td>{record.Employee_ID}</td>
                <td>{record.Employee_Name}</td>
                <td>{record.DEPARTMENT}</td>
                <td>{record.PunchDate}</td>
                <td>{record.InTime || ""}</td>
                <td>{record.OutTime || ""}</td>
                <td>{record.Actual_Working_Hours || "00:00"}</td>
                <td><input type="time" /></td>
                <td><input type="time" /></td>
                <td>00:00</td>
                <td>
                  <select defaultValue={record.Status === "HALF DAY" ? "H" : "P"}>
                    <option value="P">Present</option>
                    <option value="H">Half Day</option>
                    <option value="A">Absent</option>
                  </select>
                </td>
                <td>{record.Status === "PRESENT" ? "No Action Needed" : "Regularize Attendance"}</td>
                <td>
                  <button title="Save">💾</button>
                  <button title="Request Approval">📧</button>
                  <button title="Approve">👍</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="12" style={{ textAlign: "right" }}>Approve All:</td>
              <td><button title="Approve" style={{ width: "100%" }}>👍</button></td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
};

export default Attendance;
