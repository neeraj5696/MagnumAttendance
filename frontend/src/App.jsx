import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css"; // Import custom CSS
import {
  format,
  parseISO,
  addMonths,
  isBefore,
  isAfter,
  isEqual,
} from "date-fns";

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
  const [savedRecords, setSavedRecords] = useState(() => {
    const saved = localStorage.getItem("savedAttendanceRecords");
    return saved ? JSON.parse(saved) : {};
  });
  const [monthRanges, setMonthRanges] = useState([]);
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Time input states
  const [timeInputs, setTimeInputs] = useState({});
  const [expandedRemarks, setExpandedRemarks] = useState({});
  const MAX_CHARS = 40;

  // Add popupRemarks state
  const [popupRemarks, setPopupRemarks] = useState({ show: false, index: null, value: '' });

  // Add new useEffect to handle filtering when selectedEmployee changes
  useEffect(() => {
    let filtered = [...attendanceData];

    if (selectedEmployee !== "-1") {
      filtered = attendanceData.filter(
        (record) => record.USRID === selectedEmployee
      );
    }

    if (showMispunchesOnly) {
      filtered = filtered.filter((record) => isMispunch(record));
    }

    setFilteredData(filtered);
    setIsFiltered(selectedEmployee !== "-1" || showMispunchesOnly);
  }, [selectedEmployee, showMispunchesOnly, attendanceData]);

  // Add new useEffect to handle filtering when user changes
  useEffect(() => {
    if (!user) return;
    
    let filtered = [...attendanceData];
    filtered = filtered.filter(record => record.USRID === user.id);
    
    if (showMispunchesOnly) {
      filtered = filtered.filter((record) => isMispunch(record));
    }

    setFilteredData(filtered);
    setIsFiltered(showMispunchesOnly);
  }, [user, showMispunchesOnly, attendanceData]);

  // Helper function to get time in HH:mm format or empty string
  const getTimeValue = (timeStr) => {
    if (!timeStr || timeStr === "--") return "";
    // If timeStr is already in HH:mm:ss, return HH:mm
    if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) return timeStr.substring(0, 5);
    // If timeStr is in 'YYYY-MM-DD HH:mm:ss' format, extract time part
    if (timeStr.includes(" ")) {
      const parts = timeStr.split(" ");
      if (parts[1] && /^\d{2}:\d{2}:\d{2}$/.test(parts[1]))
        return parts[1].substring(0, 5);
    }
    return "";
  };

  // Only initialize timeInputs if empty or filteredData length changes
  useEffect(() => {
    if (Object.keys(timeInputs).length !== filteredData.length) {
      const initialTimeInputs = {};
      filteredData.forEach((record, index) => {
        initialTimeInputs[index] = {
          inTime: getTimeValue(record.InTime),
          outTime: getTimeValue(record.OutTime),
          hours: record.Actual_Working_Hours || "00:00",
        };
      });
      setTimeInputs(initialTimeInputs);
    }
  }, [filteredData]);

  // Function to check if a record has mispunch (missing or invalid inTime or outTime)
  const isMispunch = (record) => {
    // Check for null, empty string, or placeholder values
    const missingInTime =
      !record.InTime || record.InTime === "" || record.InTime === "--";
    const missingOutTime =
      !record.OutTime || record.OutTime === "" || record.OutTime === "--";

    return missingInTime || missingOutTime;
  };

  // fetching the data form api
  const fetchAttendanceData = async () => {
    try {
      setIsLoading(true);
      console.log("Fetching from:", API_BASE_URL);
      const response = await axios.get(`${API_BASE_URL}/api/test-db`);
      // Filter data for logged-in user only
      const userData = response.data.filter(record => record.USRID === user.id);
      setAttendanceData(userData);
      setFilteredData(userData);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching attendance data:", error);
      setIsLoading(false);
    }
  };

  /// side efect of fetchattendancedata
  useEffect(() => {
    if (user) {
      fetchAttendanceData();
    }
  }, [user]);

  // Build salary periods when data is fetched
  useEffect(() => {
    if (!attendanceData || attendanceData.length === 0) return;

    const punchDates = attendanceData
      .map((entry) => parseISO(entry.PunchDate))
      .filter((date) => !isNaN(date));

    if (punchDates.length === 0) return;

    const minDate = format(new Date(Math.min(...punchDates)), "yyyy-MM-dd");
    const maxDate = format(new Date(Math.max(...punchDates)), "yyyy-MM-dd");

    const ranges = generateSalaryPeriods(minDate, maxDate);
    setMonthRanges(ranges);

    if (ranges.length > 0) {
      setSelectedMonth(ranges[0].value);
    }
  }, [attendanceData]);

  // Filter data based on selected month period
  useEffect(() => {
    if (!selectedMonth || monthRanges.length === 0) return;

    const selectedPeriod = monthRanges.find(
      (period) => period.value === selectedMonth
    );

    if (!selectedPeriod) return;

    const { startDate, endDate } = selectedPeriod;

    const filtered = attendanceData.filter((entry) => {
      const punchDate = parseISO(entry.PunchDate);
      return (
        (isEqual(punchDate, startDate) || isAfter(punchDate, startDate)) &&
        (isEqual(punchDate, endDate) || isBefore(punchDate, endDate))
      );
    });

    setFilteredData(filtered);
  }, [selectedMonth, monthRanges, attendanceData]);

  function generateSalaryPeriods(minDateStr, maxDateStr) {
    const periods = [];
    let current = parseISO(minDateStr);
    current.setDate(17);
    if (parseISO(minDateStr).getDate() > 17) {
      current = addMonths(current, 1);
    }

    const maxDate = parseISO(maxDateStr);

    while (isBefore(current, addMonths(maxDate, 1))) {
      const start = new Date(current);
      const end = addMonths(start, 1);
      end.setDate(16);

      periods.push({
        label: `${format(start, "MMMM d")} - ${format(end, "MMMM d")}`,
        value: format(start, "yyyy-MM-dd"),
        startDate: start,
        endDate: end,
      });

      current = addMonths(current, 1);
    }

    return periods;
  }

  const calculateWorkingHours = (inTime, outTime) => {
    if (!inTime || !outTime) {
      return "00:00";
    }
    const inDate = new Date(`1970-01-01T${inTime}:00`);
    const outDate = new Date(`1970-01-01T${outTime}:00`);
    const diffInMilliseconds = outDate - inDate;
    if (diffInMilliseconds < 0) {
      return "00:00";
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
        inTime:
          filteredData[index]?.InTime?.split(" ")[1]?.substring(0, 5) || "",
        outTime:
          filteredData[index]?.OutTime?.split(" ")[1]?.substring(0, 5) || "",
        hours: filteredData[index]?.Actual_Working_Hours || "00:00",
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

  // Add reason options

  const handleReasonChange = (index, value) => {
    if (value.length <= MAX_CHARS) {
      setReasonInputs((prev) => ({
        ...prev,
        [index]: value,
      }));
    }
  };

  const toggleExpand = (index) => {
    setExpandedRemarks((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  function getCurrentSQLDateTime() {
    const now = new Date();

    // Format current date as 'YYYY-MM-DD'
    const currentDate = now.toISOString().split("T")[0]; // e.g. '2025-05-05'

    // Format current time as 'HH:mm'
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hours}:${minutes}`; // e.g. '14:30'

    // Call your function
    const formatted = formatDateTime(currentDate, currentTime);

    return formatted; // Output: '2025-05-05 20:00:00.000' (if IST)
  }

  const formatDateTime = (date, time) => {
    if (!time) return null;

    // Ensure time is in HH:mm:ss format
    const timeParts = time.split(":");
    const formattedTime = timeParts.length === 2 ? `${time}:00` : time;

    // Combine date and time into a Date object (UTC assumed)
    const isoString = `${date}T${formattedTime}Z`; // Treat as UTC
    const utcDate = new Date(isoString);

    // Add 5 hours and 30 minutes (IST offset)
    const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
    const istDate = new Date(utcDate.getTime());

    // Format back to 'YYYY-MM-DD HH:mm:ss.000'
    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, "0");
    const day = String(istDate.getDate()).padStart(2, "0");
    const hours = String(istDate.getHours()).padStart(2, "0");
    const minutes = String(istDate.getMinutes()).padStart(2, "0");
    const seconds = String(istDate.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.000`;
  };

  const sqlDateTime = getCurrentSQLDateTime();

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

    // Truncate or format values to fit SQL Server constraints
    const saveData = {
      USRID: record.USRID.substring(0, 50), // Assuming UserId is varchar(50)
      PunchDate: record.PunchDate.substring(0, 10), // Date format YYYY-MM-DD
      InTime: formattedInTime,
      OutTime: formattedOutTime,
      Status: statusInput.substring(0, 50), // Assuming Status is varchar(50)
      Reason: reasonInput.substring(0, 500), // Assuming Reason is varchar(500)
      EmpReqShow: "No",
      ManagerApproval: "Pending",
      DEPARTMENT: DEPARTMENT ? DEPARTMENT.substring(0, 100) : null, // Assuming DEPARTMENT is varchar(100)
      EmpDate: EmpDate
    };

    if (!timeInput.inTime || !timeInput.outTime) {
      alert("Both In and Out times must be provided.");
      return;
    }

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

      // Create a unique key for this record that will persist
      const recordKey = `${record.USRID}_${record.PunchDate}`;

      // Update savedRecords with the unique key
      const updatedSavedRecords = {
        ...savedRecords,
        [recordKey]: true,
      };

      // Update state
      setSavedRecords(updatedSavedRecords);

      // Store in localStorage for persistence
      localStorage.setItem(
        "savedAttendanceRecords",
        JSON.stringify(updatedSavedRecords)
      );

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
    switch (record.Status) {
      case "MIS PUNCH":
        return { backgroundColor: "rgba(210, 236, 17, 0.8)" };  // Dark gray
      case "HALF DAY":
        return { backgroundColor: "rgba(255, 193, 7, 0.2)" };  // Orange
      case "PRESENT":
        return { backgroundColor: "rgba(40, 167, 69, 0.2)" };  // Green
      case "ABSENT":
        return { backgroundColor: "rgba(220, 53, 69, 0.2)" };    // Darker gray
      default:
        return {};
    }
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

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);

  // Add pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    // Scroll to top of table when changing pages
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      tableContainer.scrollTop = 0;
    }
  };

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredData]);

  // Add popup-related functions
  const handleRemarksClick = (index, currentValue) => {
    setPopupRemarks({
      show: true,
      index,
      value: currentValue || ''
    });
  };

  const handlePopupClose = () => {
    setPopupRemarks({ show: false, index: null, value: '' });
  };

  const handlePopupSave = () => {
    if (popupRemarks.index !== null) {
      handleReasonChange(popupRemarks.index, popupRemarks.value);
    }
    handlePopupClose();
  };

  return (
    <div className="attendance-container">
      <header className="attendance-header">
        <div className="header-content">
          <h1>Attendance Management</h1>
          <div className="user-section">
            <div className="user-info">
              <span className="welcome-text">Welcome,</span>
              <span className="user-name">{user?.name}</span>
              <span className="user-department">({user?.department})</span>
            </div>
            <button onClick={handleLogout} className="logout-btn">
              <i className="fas fa-sign-out-alt"></i> Logout
            </button>
          </div>
        </div>
      </header>

      {isLoading && (
        <div className="loading-message">
          <i className="fas fa-spinner fa-spin"></i> Data is loading, please wait...
        </div>
      )}

      <div className="filters-section">
        <div className="filter-group">
          <div className="filter-item">
            <label>Employee Name</label>
            <div className="employee-name">{user?.name}</div>
          </div>
          <div className="filter-item">
            <label>Attendance List</label>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="filter-select"
            >
              <option value="-1">Select Employee</option>
              {uniqueEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label>Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="filter-select"
            >
              {monthRanges.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showMispunchesOnly}
                onChange={(e) => setShowMispunchesOnly(e.target.checked)}
              />
              <span>Show Mispunches Only</span>
            </label>
          </div>
          <div className="filter-actions">
            <button className="filter-btn" onClick={handleFilter}>
              <i className="fas fa-filter"></i> Filter
            </button>
            {isFiltered && (
              <button className="reset-btn" onClick={handleReset}>
                <i className="fas fa-undo"></i> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="attendance-table">
          <thead>
            <tr>
              <th colSpan="4"></th>
              <th colSpan="3">Devices</th>
              <th colSpan="3">Regularized</th>
              <th colSpan="3"></th>
            </tr>
            <tr>
              <th width="4%">Select</th>
              <th width="8%">Poornata ID</th>
              <th width="10%">Name</th>
              <th width="8%">Department</th>
              <th width="5%">Date</th>
              <th width="5%">IN</th>
              <th width="5%">OUT</th>
              <th width="5%">Hours</th>
              <th className="settimeE" width="6%">IN</th>
              <th className="settimeE" width="6%">OUT</th>
              <th width="5%">Hours</th>
              <th width="7%">Status</th>
              <th width="9%">Remarks</th>
              <th width="10%">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((record, index) => (
              <tr key={index} style={getRowStyle(record)}>
                <td>
                  <input type="checkbox" className="row-checkbox" />
                </td>
                <td>{record.USRID}</td>
                <td>{record.Employee_Name}</td>
                <td>{record.DEPARTMENT}</td>
                <td>{record.PunchDate}</td>
                <td>{record.InTime || "--"}</td>
                <td>{record.OutTime || "--"}</td>
                <td>{record.Actual_Working_Hours || "00:00"}</td>
                <td className="settime">
                  <input
                    type="time"
                    value={
                      timeInputs[index]?.inTime !== undefined &&
                      timeInputs[index]?.inTime !== ""
                        ? timeInputs[index].inTime
                        : getTimeValue(record.InTime)
                    }
                    onChange={(e) =>
                      handleTimeChange(index, "inTime", e.target.value)
                    }
                    className="time-input"
                  />
                </td>
                <td className="settime">
                  <input
                    type="time"
                    value={
                      timeInputs[index]?.outTime !== undefined &&
                      timeInputs[index]?.outTime !== ""
                        ? timeInputs[index].outTime
                        : getTimeValue(record.OutTime)
                    }
                    onChange={(e) =>
                      handleTimeChange(index, "outTime", e.target.value)
                    }
                    className="time-input"
                  />
                </td>
                <td>
                  {calculateWorkingHours(
                    timeInputs[index]?.inTime !== undefined &&
                      timeInputs[index]?.inTime !== ""
                      ? timeInputs[index].inTime
                      : getTimeValue(record.InTime),
                    timeInputs[index]?.outTime !== undefined &&
                      timeInputs[index]?.outTime !== ""
                      ? timeInputs[index].outTime
                      : getTimeValue(record.OutTime)
                  )}
                </td>
                <td>
                <select>
                      <option value={record.Status} selected>
                        {record.Status}{" "}
                      </option>
                      {["ABSENT", "PRESENT", "HALF DAY", "ON DUTY"]
                        .filter((status) => status !== record.Status)
                        .map((status) => (
                          <option key={status} value={status}>
                            {status}{" "}
                          </option>
                        ))}
                    </select>
                </td>
                <td>
                  {record.Status === "PRESENT" ? (
                    <span className="no-action">No Action Needed</span>
                  ) : (
                    <div className="remarks-container">
                      <div 
                        className="reason-input"
                        onClick={() => handleRemarksClick(index, reasonInputs[index])}
                      >
                        {reasonInputs[index] || "Click to add remarks"}
                      </div>
                    </div>
                  )}
                </td>
                <td className="action-buttons">
                  <button
                    onClick={() => HandleSave(index)}
                    title="Save"
                    disabled={
                      record.Status === "PRESENT" ||
                      savedRecords[`${record.USRID}_${record.PunchDate}`]
                    }
                    className="action-btn save-btn"
                  >
                    <i className="fas fa-save"></i>
                  </button>

                  <button
                    onClick={() => handleRequestApproval(index)}
                    title="Request Approval"
                    disabled={record.Status === "PRESENT"}
                    className="action-btn approval-btn"
                  >
                    <i className="fas fa-envelope"></i>
                  </button>

                  <button
                    onClick={() => HandleApprove(index)}
                    title="Approve"
                    disabled={record.Status === "PRESENT"}
                    className="action-btn approve-btn"
                  >
                    <i className="fas fa-check"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="12" className="approve-all-cell">
                Approve All:
              </td>
              <td>
                <button
                  onClick={HandleApproveAll}
                  title="Approve All"
                  className="approve-all-btn"
                >
                  <i className="fas fa-check-double"></i> Approve All
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {filteredData.length > 0 && (
        <div className="pagination-container">
          <button
            className="pagination-button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <i className="fas fa-chevron-left"></i> Previous
          </button>
          
          <span className="pagination-info">
            Page {currentPage} of {totalPages}
          </span>
          
          <button
            className="pagination-button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      )}

      {/* Add popup JSX */}
      {popupRemarks.show && (
        <>
          <div className="remarks-popup-overlay" onClick={handlePopupClose} />
          <div className="remarks-popup">
            <div className="remarks-popup-header">
              <div className="remarks-popup-title">Add Remarks</div>
              <button className="remarks-popup-close" onClick={handlePopupClose}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <textarea
              value={popupRemarks.value}
              onChange={(e) => {
                if (e.target.value.length <= MAX_CHARS) {
                  setPopupRemarks(prev => ({ ...prev, value: e.target.value }));
                }
              }}
              placeholder="Enter remarks..."
              maxLength={MAX_CHARS}
            />
            <div className="remarks-popup-footer">
              <div className={`character-counter ${popupRemarks.value.length >= MAX_CHARS ? 'warning' : ''}`}>
                {popupRemarks.value.length}/{MAX_CHARS}
              </div>
              <button className="pagination-button" onClick={handlePopupSave}>
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Attendance;