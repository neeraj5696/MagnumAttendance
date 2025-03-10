import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css"; // Import custom CSS

const Attendance = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    fetchAttendanceData();
  }, []);

  const fetchAttendanceData = async () => {
    setLoading(true);
    try {
      const response = await axios.get("http://localhost:5000/api/test-db"|| "https://magnum-attendancebackenmd.vercel.app/"|| "https://magnum-attendancebackenmd-484gqyvnm-neeraj5696s-projects.vercel.app/");
      setAttendanceData(response.data);
      setFilteredData(response.data);
      setError(null);
    } catch (error) {
      console.error("❌ Error fetching attendance data:", error);
      setError("Failed to load attendance data.");
    }
    setLoading(false);
  };

  const handleFilter = () => {
    let filtered = attendanceData;

    if (selectedEmployee) {
      filtered = filtered.filter((record) => record.Employee_Name === selectedEmployee);
    }

    if (selectedDate) {
      filtered = filtered.filter((record) => record.PunchDate === selectedDate);
    }

    setFilteredData(filtered);
  };

  return (
    <div className="attendance-container">
      <h2 className="title">Attendance Records</h2>

      {/* Loading Message */}
      {loading && <div className="loading-message">Fetching data, please wait...</div>}

      {/* Dropdown Filters */}
      <div className="filters">
        {/* Employee Dropdown */}
        <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
          <option value="">Select Employee</option>
          {[...new Set(attendanceData.map((record) => record.Employee_Name))].map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {/* Date Dropdown */}
        <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
          <option value="">Select Date</option>
          {[...new Set(attendanceData.map((record) => record.PunchDate))].map((date) => (
            <option key={date} value={date}>
              {date}
            </option>
          ))}
        </select>

        {/* OK Button */}
        <button onClick={handleFilter}>OK</button>
      </div>

      {/* Error Handling */}
      {error && <p className="error">{error}</p>}

      {/* Attendance Table */}
      {!loading && (
        <div className="table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Department</th>
                <th>Title</th>
                <th>Date</th>
                <th>In Time</th>
                <th>Out Time</th>
                <th>Total In Time</th>
                <th>Total Out Time</th>
                <th>Working Hours</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((record, index) => (
                  <tr key={index} className={index % 2 === 0 ? "even-row" : "odd-row"}>
                    <td>{record.Employee_Name}</td>
                    <td>{record.DEPARTMENT || "--"}</td>
                    <td>{record.TITLE || "--"}</td>
                    <td>{record.PunchDate}</td>
                    <td>{record.InTime || "--"}</td>
                    <td>{record.OutTime || "--"}</td>
                    <td>{record.Total_InTime || "--"}</td>
                    <td>{record.Total_OutTime || "--"}</td>
                    <td>{record.Actual_Working_Hours || "--"}</td>
                    <td className={record.Status === "PRESENT" ? "status-present" : "status-absent"}>
                      {record.Status}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" className="no-records">
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Attendance;
