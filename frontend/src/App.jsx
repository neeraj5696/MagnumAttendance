import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css"; // Import custom CSS
import {
  format,
  parseISO,
  addMonths,
  isBefore,
  isAfter,
  isEqual,
  endOfMonth,
  startOfMonth,
  isWithinInterval,
} from "date-fns";
import { FaRegSave, FaEnvelope, FaCheck, FaThumbsUp, FaCalendarAlt, FaFilter, FaUndo, FaSignOutAlt, FaExclamationTriangle } from "react-icons/fa";
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

// makeing the dynaic backend address
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000`;

// Add console log to check environment variable
console.log("API_BASE_URL:", API_BASE_URL);

const Attendance = () => {
  // =========== STATE MANAGEMENT ===========
  // Core data states
  const [attendanceData, setAttendanceData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [timeInputs, setTimeInputs] = useState({});
  const [statusInputs, setStatusInputs] = useState({});
  const [reasonInputs, setReasonInputs] = useState({});
  const [buttonStatus, setButtonStatus] = useState({});
  
  // Saved records tracking
  const [savedRecords, setSavedRecords] = useState(() => {
    const saved = localStorage.getItem("savedAttendanceRecords");
    return saved ? JSON.parse(saved) : {};
  });
  
  // User and auth state
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("-1");
  const [showMispunchesOnly, setShowMispunchesOnly] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);
  const [expandedRemarks, setExpandedRemarks] = useState({});
  const [popupRemarks, setPopupRemarks] = useState({ show: false, index: null, value: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);
  
  // Date filtering
  const [dateRange, setDateRange] = useState([startOfMonth(new Date()), endOfMonth(new Date())]);
  const [startDate, endDate] = dateRange;
  const datePickerRef = useRef(null);
  
  // Month tracking
  const [selectedMonth, setSelectedMonth] = useState("Feb-25");
  const [monthRanges, setMonthRanges] = useState([]);
  const [availableMonthRanges, setAvailableMonthRanges] = useState([]);
  
  // Constants
  const MAX_CHARS = 40;

  // =========== UTILITY FUNCTIONS ===========
  // Get time value from various formats
  const getTimeValue = (timeStr) => {
    if (!timeStr || timeStr === "--") return "";
    
    // Handle HH:mm:ss format
    if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
      return timeStr.substring(0, 5);
    }
    
    // Handle YYYY-MM-DD HH:mm:ss format
    if (timeStr.includes(" ")) {
      const parts = timeStr.split(" ");
      if (parts[1] && /^\d{2}:\d{2}:\d{2}$/.test(parts[1])) {
        return parts[1].substring(0, 5);
      }
    }
    
    // Handle HH:mm format
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
      return timeStr.substring(0, 5);
    }
    
    // Extract any HH:MM pattern from other formats
    const timeMatch = timeStr.match(/(\d{2}:\d{2})/);
    if (timeMatch) {
      return timeMatch[1];
    }
    
    return "";
  };
  
  // Initialize time inputs from device data
  const initializeTimeFromDevice = (data) => {
    const initialInputs = {};
    
    data.forEach((record, index) => {
      // Try different patterns to extract time values
      let inTime = "";
      let outTime = "";
      
      if (record.InTime && record.InTime !== "--") {
        // Try to find any time pattern in the string
        const match = record.InTime.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
        if (match) {
          inTime = match[1].substring(0, 5);
        }
      }
      
      if (record.OutTime && record.OutTime !== "--") {
        // Try to find any time pattern in the string
        const match = record.OutTime.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
        if (match) {
          outTime = match[1].substring(0, 5);
        }
      }
      
      // Ensure the time values are properly formatted
      initialInputs[index] = {
        inTime: inTime,
        outTime: outTime, 
        hours: calculateWorkingHours(inTime, outTime)
      };
    });
    
    return initialInputs;
  };
  
  // Check if a record has a missing punch
  const isMispunch = (record) => {
    if (!record) return false;
    
    const missingInTime = !record.InTime || record.InTime === "" || record.InTime === "--";
    const missingOutTime = !record.OutTime || record.OutTime === "" || record.OutTime === "--";
    
    return missingInTime || missingOutTime;
  };
  
  // Calculate working hours from in and out times
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

  // Format datetime for SQL format
  const formatDateTime = (date, time) => {
    if (!time) return null;

    // Ensure time is in HH:mm:ss format
    const timeParts = time.split(":");
    const formattedTime = timeParts.length === 2 ? `${time}:00` : time;

    // Combine date and time into a Date object
    const isoString = `${date}T${formattedTime}Z`;
    const utcDate = new Date(isoString);

    // Format back to 'YYYY-MM-DD HH:mm:ss.000'
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, "0");
    const day = String(utcDate.getDate()).padStart(2, "0");
    const hours = String(utcDate.getHours()).padStart(2, "0");
    const minutes = String(utcDate.getMinutes()).padStart(2, "0");
    const seconds = String(utcDate.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.000`;
  };
  
  // Get current SQL datetime
  function getCurrentSQLDateTime() {
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0];
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return formatDateTime(currentDate, `${hours}:${minutes}`);
  }
  
  // Calculate row background style based on status
  const getRowStyle = (record) => {
    switch (record.Status) {
      case "MIS PUNCH": return { backgroundColor: "rgba(210, 236, 17, 0.8)" };
      case "HALF DAY": return { backgroundColor: "rgba(255, 193, 7, 0.2)" };
      case "PRESENT": return { backgroundColor: "rgba(40, 167, 69, 0.2)" };
      case "ABSENT": return { backgroundColor: "rgba(220, 53, 69, 0.2)" };
      default: return {};
    }
  };

  // =========== EVENT HANDLERS ===========
  // Handle time input changes
  const handleTimeChange = (index, type, value) => {
    setTimeInputs(prev => {
      const record = filteredData[index];
      const currentRow = prev[index] || {
        inTime: getTimeValue(record?.InTime),
        outTime: getTimeValue(record?.OutTime),
        hours: record?.Actual_Working_Hours || "00:00",
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
  
  // Handle status changes
  const handleStatusChange = (index, value) => {
    setStatusInputs(prev => ({
      ...prev,
      [index]: value,
    }));
  };
  
  // Handle reason input changes
  const handleReasonChange = (index, value) => {
    if (value.length <= MAX_CHARS) {
      setReasonInputs(prev => ({
        ...prev,
        [index]: value,
      }));
    }
  };
  
  // Handle remarks click to open popup
  const handleRemarksClick = (index, currentValue) => {
    setPopupRemarks({
      show: true,
      index,
      value: currentValue || ''
    });
  };
  
  // Handle popup close
  const handlePopupClose = () => {
    setPopupRemarks({ show: false, index: null, value: '' });
  };
  
  // Handle popup save
  const handlePopupSave = () => {
    if (popupRemarks.index !== null) {
      handleReasonChange(popupRemarks.index, popupRemarks.value);
    }
    handlePopupClose();
  };
  
  // Datepicker click handler
  const handleDatePickerClick = () => {
    if (datePickerRef.current) {
      datePickerRef.current.setOpen(true);
    }
  };
  
  // Handle mispunch filter change
  const handleMispunchFilterChange = (e) => {
    const isChecked = e.target.checked;
    setShowMispunchesOnly(isChecked);
    
    let baseData = [...attendanceData];
    
    // Apply date filter
    if (dateRange[0]) {
      baseData = baseData.filter(record => {
        const recordDate = parseISO(record.PunchDate);
        if (dateRange[1]) {
          return isWithinInterval(recordDate, { 
            start: dateRange[0], 
            end: dateRange[1] 
          });
        } else {
          return isAfter(recordDate, dateRange[0]) || isEqual(recordDate, dateRange[0]);
        }
      });
    }
    
    // Apply mispunches filter if checked
    if (isChecked) {
      baseData = baseData.filter(record => isMispunch(record));
    }
    
    setFilteredData(baseData);
    setIsFiltered(isChecked || dateRange[0] !== null);
  };
  
  // Filter handler
  const handleFilter = () => {
    if (!attendanceData || attendanceData.length === 0) return;
    
    let filtered = [...attendanceData];

    // Date range filter
    if (dateRange[0]) {
      filtered = filtered.filter(record => {
        const recordDate = parseISO(record.PunchDate);
        if (dateRange[1]) {
          return isWithinInterval(recordDate, {
            start: dateRange[0],
            end: dateRange[1]
          });
        } else {
          return isAfter(recordDate, dateRange[0]) || isEqual(recordDate, dateRange[0]);
        }
      });
    }

    // Mispunch filter
    if (showMispunchesOnly) {
      filtered = filtered.filter(record => isMispunch(record));
    }

    setFilteredData(filtered);
    setIsFiltered(true);
  };
  
  // Reset filters
  const handleReset = () => {
    setShowMispunchesOnly(false);
    
    // Reset to current month's data
    if (availableMonthRanges.length > 0) {
      const currentDate = new Date();
      let currentMonth = availableMonthRanges[0]; // Default to first month
      
      // Try to find current month in available ranges
      for (const range of availableMonthRanges) {
        if (currentDate >= range.start && currentDate <= range.end) {
          currentMonth = range;
          break;
        }
      }
      
      // Set date range to current month
      setDateRange([currentMonth.start, currentMonth.end]);
      
      // Filter data for the current month
      const filtered = attendanceData.filter(record => {
        const recordDate = parseISO(record.PunchDate);
        return isWithinInterval(recordDate, {
          start: currentMonth.start,
          end: currentMonth.end
        });
      });
      
      setFilteredData(filtered);
    } else {
      // If no months available, just show all data
      setFilteredData(attendanceData);
    }
    
    setIsFiltered(false);
  };
  
  // Reset time inputs to match device data
  const resetTimeToDeviceData = (index) => {
    const record = filteredData[index];
    if (record) {
      // Try different patterns to extract time values
      let inTime = "";
      let outTime = "";
      
      if (record.InTime && record.InTime !== "--") {
        // Try to find any time pattern in the string
        const match = record.InTime.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
        if (match) {
          inTime = match[1].substring(0, 5);
        }
      }
      
      if (record.OutTime && record.OutTime !== "--") {
        // Try to find any time pattern in the string
        const match = record.OutTime.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
        if (match) {
          outTime = match[1].substring(0, 5);
        }
      }
      
      console.log(`Resetting times for index ${index}:`, { 
        deviceIn: record.InTime, 
        deviceOut: record.OutTime,
        extractedIn: inTime,
        extractedOut: outTime
      });
      
      setTimeInputs(prev => ({
        ...prev,
        [index]: {
          inTime: inTime,
          outTime: outTime,
          hours: calculateWorkingHours(inTime, outTime)
        }
      }));
    }
  };
  
  // Reset all time inputs to match device data
  const resetAllTimeInputs = () => {
    console.log("Resetting all time inputs to match device data");
    const initialTimeInputs = initializeTimeFromDevice(filteredData);
    setTimeInputs(initialTimeInputs);
  };
  
  // Pagination handler
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    // Scroll to top of table when changing pages
    const tableScrollContainer = document.querySelector('.table-scroll-container');
    if (tableScrollContainer) {
      tableScrollContainer.scrollTop = 0;
    }
  };
  
  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/login';
  };
  
  // =========== DATA FETCHING ===========
  // Fetch attendance data
  const fetchAttendanceData = async () => {
    setIsLoading(true);
    try {
      if (!user || !user.id) {
        console.log("No user found, cannot fetch attendance data");
        setFilteredData([]);
        setAttendanceData([]);
        setIsLoading(false);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/attendance`, {
        params: { userId: user.id },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        }
      });
      
      if (response.data && response.data.length > 0) {
        const formattedData = response.data.map(record => ({
          ...record,
          formattedDate: format(parseISO(record.PunchDate), 'yyyy-MM-dd')
        }));
        
        setAttendanceData(formattedData);
        
        // Extract unique months from data
        const months = [...new Set(formattedData.map(record => {
          const date = parseISO(record.PunchDate);
          return format(date, 'yyyy-MM');
        }))].sort();
        
        // Create month ranges
        const ranges = months.map(monthStr => {
          const [year, month] = monthStr.split('-').map(Number);
          const firstDay = new Date(year, month - 1, 1);
          const lastDay = new Date(year, month, 0);
          return {
            start: firstDay,
            end: lastDay,
            label: format(firstDay, 'MMMM yyyy')
          };
        });
        
        setAvailableMonthRanges(ranges);
        
        // Find current month range to set as default
        if (ranges.length > 0) {
          const currentDate = new Date();
          const currentMonthStr = format(currentDate, 'yyyy-MM');
          
          // Find the current month in available ranges, or default to most recent
          let defaultMonth = ranges[ranges.length - 1]; // Most recent as fallback
          
          for (const range of ranges) {
            const rangeMonthStr = format(range.start, 'yyyy-MM');
            if (rangeMonthStr === currentMonthStr) {
              defaultMonth = range;
              break;
            }
          }
          
          // Set date range to current month
          setDateRange([defaultMonth.start, defaultMonth.end]);
          
          // Filter data for the selected month
          const filteredForMonth = formattedData.filter(record => {
            const recordDate = parseISO(record.PunchDate);
            return isWithinInterval(recordDate, {
              start: defaultMonth.start,
              end: defaultMonth.end
            });
          });
          
          setFilteredData(filteredForMonth);
        } else {
          setFilteredData(formattedData);
        }
      } else {
        setFilteredData([]);
        setAttendanceData([]);
      }
    } catch (error) {
      console.error("Error fetching attendance data:", error);
      setFilteredData([]);
      setAttendanceData([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch button status
  const fetchButtonStatus = async (userId, date) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/check-button-status`, {
        params: { userId, date }
      });

      // Create a unique key for this record
      const recordKey = `${userId}_${date}`;

      // Update the buttonStatus state
      setButtonStatus(prev => ({
        ...prev,
        [recordKey]: response.data
      }));

      return response.data;
    } catch (error) {
      console.error("Error fetching button status:", error);

      // Return default values that won't disable the buttons
      return {
        saveButtonDisabled: false,
        requestApprovalDisabled: false,
        error: error.message
      };
    }
  };
  
  // =========== EFFECTS ===========
  // Fetch attendance data when user changes
  useEffect(() => {
    if (user) {
      fetchAttendanceData();
    }
  }, [user]);
  
  // Initialize time inputs when filtered data changes
  useEffect(() => {
    if (filteredData.length > 0) {
      const initialTimeInputs = initializeTimeFromDevice(filteredData);
      setTimeInputs(initialTimeInputs);
      
      // Log to check if time data is being properly initialized
      console.log("Time inputs initialized:", initialTimeInputs);
    }
  }, [filteredData]);
  
  // Reset pagination when filtered data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredData]);
  
  // Add effect to refresh time inputs when date range changes
  useEffect(() => {
    if (filteredData.length > 0) {
      setTimeInputs(initializeTimeFromDevice(filteredData));
    }
  }, [dateRange]);

  // =========== CORE SAVE FUNCTIONALITY (KEPT UNCHANGED) ===========
  const HandleSave = async (index) => {
    const record = filteredData[index];
    const timeInput = timeInputs[index] || {};
    const statusInput = statusInputs[index] || record.Status;
    const reasonInput = reasonInputs[index] || "";
    const DEPARTMENT = record.DEPARTMENT;
    const EmpDate = getCurrentSQLDateTime();

    // Check if required fields are present
    if (!record.USRID || !record.PunchDate || !timeInput.inTime || !timeInput.outTime) {
      alert("User ID, Date, In Time, and Out Time are all required.");
      return;
    }

    // Format the datetime values
    const formattedInTime = formatDateTime(record.PunchDate, timeInput.inTime);
    const formattedOutTime = formatDateTime(
      record.PunchDate,
      timeInput.outTime
    );

    // Truncate or format values to fit SQL Server constraints
    const saveData = {
      // Use UserID (not USRID) to match server column name
      USRID: record.USRID.substring(0, 50),
      // Use Date (not PunchDate) to match server column name
      Date: record.PunchDate.substring(0, 10),      
      inTime: formattedInTime,
      OutTime: formattedOutTime,
      Status: statusInput.substring(0, 50),
      EmpReason: reasonInput.substring(0, 500),
      EmpReqShow: "No",
      MailSend: "N",
      ManagerApproval: "Pending", // Note the spelling
      DEPARTMENT: DEPARTMENT ? DEPARTMENT.substring(0, 100) : null,
      EmpDate: EmpDate
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

      // Update button status after save
      await fetchButtonStatus(record.USRID, record.PunchDate);

      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error(
        "Error saving attendance:",
        error.response?.data || error.message
      );
      alert(
        `Error saving attendance: ${error.response?.data?.error || error.message
        }`
      );
    }
  };

  // =========== APPROVAL FUNCTIONS ===========
  const HandleApprove = async (index) => {
    const record = filteredData[index];
    const approveData = {
      UserID: record.USRID,
      Date: record.PunchDate,
      EmpReqShow: "No",
      ManagerApproval: "Pending",
    };

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/approve-attendance`,
        approveData
      );
      alert("Attendance approved successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error(
        "Error approving attendance:",
        error.response?.data || error.message
      );
      alert(
        `Error approving attendance: ${error.response?.data?.error || error.message
        }`
      );
    }
  };

  const HandleApproveAll = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/approve-all`);
      alert("All attendance records approved successfully!");
      fetchAttendanceData(); // Refresh data
    } catch (error) {
      console.error(
        "Error approving all attendance:",
        error.response?.data || error.message
      );
      alert(
        `Error approving all attendance: ${error.response?.data?.error || error.message
        }`
      );
    }
  };

  // =========== PAGINATION LOGIC ===========
  // Calculate pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  // Render helpers
  const getUniqueEmployees = () => {
    if (!attendanceData || attendanceData.length === 0) return [];

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

  const uniqueEmployees = getUniqueEmployees();

  // Force reset all time inputs to ensure device data copies to regularized columns
  const forceResetAllTimeInputs = () => {
    console.log("Force resetting all time inputs with direct extraction");
    const manualInputs = {};
    
    filteredData.forEach((record, index) => {
      // Try different patterns to extract time values
      let inTime = "";
      let outTime = "";
      
      if (record.InTime && record.InTime !== "--") {
        // Try to find any time pattern in the string
        const match = record.InTime.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
        if (match) {
          inTime = match[1].substring(0, 5);
        }
      }
      
      if (record.OutTime && record.OutTime !== "--") {
        // Try to find any time pattern in the string
        const match = record.OutTime.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
        if (match) {
          outTime = match[1].substring(0, 5);
        }
      }
      
      console.log(`Index ${index}:`, { 
        rawIn: record.InTime, 
        rawOut: record.OutTime,
        extractedIn: inTime,
        extractedOut: outTime
      });
      
      manualInputs[index] = {
        inTime,
        outTime,
        hours: calculateWorkingHours(inTime, outTime)
      };
    });
    
    setTimeInputs(manualInputs);
  };

  return (
    <div className="attendance-container">
      <header className="attendance-header">
        <div className="header-content">
          <h1>Regularize Attendance</h1>
          <div className="header-actions">
            <button className="reset-all-btn" onClick={forceResetAllTimeInputs} title="Reset all regularized times to match device data">
              <FaUndo /> Reset All Times
            </button>
            <button className="logout-btn" onClick={handleLogout}>
              <FaSignOutAlt /> Logout
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
        <div className="filter-wrapper">
          <div className="filter-grid">
            <div className="filter-item employee-select">
              <label>Manager Name</label>
              <div className="manager-name-display">
                {user && filteredData.length > 0 && filteredData[0].Manager_Name ? 
                  filteredData[0].Manager_Name : 
                  "No manager assigned"}
              </div>
            </div>
            
            <div className="filter-item date-range-picker">
              <label>Date Range</label>
              <div className="date-picker-wrapper" onClick={handleDatePickerClick}>
                <FaCalendarAlt className="icon" />
                <span>
                  {dateRange[0] ? format(dateRange[0], 'MMM dd, yyyy') : 'Start'} - 
                  {dateRange[1] ? format(dateRange[1], 'MMM dd, yyyy') : 'End'}
                </span>
                <DatePicker
                  ref={datePickerRef}
                  selectsRange={true}
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(update) => {
                    setDateRange(update);
                  }}
                  monthsShown={2}
                  className="hidden-date-picker"
                  highlightDates={availableMonthRanges.map(range => ({
                    start: range.start,
                    end: range.end
                  }))}
                  popperClassName="calendar-popper"
                  popperPlacement="bottom-start"
                  popperModifiers={[
                    {
                      name: "offset",
                      options: {
                        offset: [0, 5]
                      }
                    },
                    {
                      name: "preventOverflow",
                      options: {
                        rootBoundary: "viewport",
                        padding: 8
                      }
                    }
                  ]}
                />
              </div>
            </div>
            
            <div className="filter-item checkbox-group">
              <label>&nbsp;</label>
              <div className="checkbox-container">
                <FaExclamationTriangle className="icon" />
                <input
                  type="checkbox"
                  id="mispunchesCheck"
                  checked={showMispunchesOnly}
                  onChange={handleMispunchFilterChange}
                />
                <label htmlFor="mispunchesCheck" className="checkbox-label">
                  Mispunches Only
                </label>
              </div>
            </div>
            
            <div className="filter-actions">
              <button className="filter-btn action-button" onClick={handleFilter}>
                <FaFilter /> Apply
              </button>
            </div>
            
            <div className="filter-header">
              <button className="reset-btn action-button" onClick={handleReset}>
                <FaUndo /> Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-scroll-container">
          <table className="attendance-table">
            <thead>
              <tr>
                <th colSpan="7" className="device-header">Devices</th>
                <th colSpan="7" className="regularized-header">Regularized</th>
              </tr>
              <tr>
                <th className="col-select">Sel</th>
                <th className="col-id">ID</th>
                <th className="col-name">Name</th>
                <th className="col-department">Dept</th>
                <th className="col-date">Date</th>
                <th className="col-in">IN</th>
                <th className="col-out">OUT</th>
                <th className="col-hours">Hours</th>
                <th className="col-reg-in">Reg IN</th>
                <th className="col-reg-out">Reg OUT</th>
                <th className="col-reg-hours">Hours</th>
                <th className="col-status">Status</th>
                <th className="col-remarks">Remarks</th>
                <th className="col-action">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map((record, index) => (
                <tr key={index} style={getRowStyle(record)}>
                  <td>
                    <input
                      type="checkbox"
                      className="row-checkbox"
                    />
                  </td>
                  <td>{record.USRID}</td>
                  <td>{record.Employee_Name}</td>
                  <td>{record.DEPARTMENT}</td>
                  <td>{record.PunchDate}</td>
                  <td>{record.InTime || "--"}</td>
                  <td>{record.OutTime || "--"}</td>
                  <td>{record.Actual_Working_Hours || "00:00"}</td>
                  <td className="settime">
                    <div className="time-input-container">
                      <input
                        type="time"
                        value={timeInputs[index]?.inTime || ""}
                        onChange={(e) =>
                          handleTimeChange(index, "inTime", e.target.value)
                        }
                        className="time-input"
                      />
                      <button 
                        className="reset-time-btn" 
                        title="Reset to device time"
                        onClick={() => resetTimeToDeviceData(index)}
                      >
                        <FaUndo className="reset-icon" />
                      </button>
                    </div>
                  </td>
                  <td className="settime">
                    <div className="time-input-container">
                      <input
                        type="time"
                        value={timeInputs[index]?.outTime || ""}
                        onChange={(e) =>
                          handleTimeChange(index, "outTime", e.target.value)
                        }
                        className="time-input"
                      />
                    </div>
                  </td>
                  <td>
                    {calculateWorkingHours(
                      timeInputs[index]?.inTime || "",
                      timeInputs[index]?.outTime || ""
                    )}
                  </td>
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
                    {record.Status === "PRESENT" ? (
                      <div className="no-action-container">
                        <span className="no-action">No Action Needed</span>
                      </div>
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
                        savedRecords[`${record.USRID}_${record.PunchDate}`] ||
                        buttonStatus[`${record.USRID}_${record.PunchDate}`]?.saveButtonDisabled
                      }
                      className="action-btn save-btn"
                    >
                      <FaRegSave className="btn-icon" />
                    </button>

                    <button
                      onClick={() => HandleApprove(index)}
                      title="Approve"
                      disabled={record.Status === "PRESENT"}
                      className="action-btn approve-btn"
                    >
                      <FaThumbsUp className="btn-icon" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="13" className="approve-all-cell">
                  Approve All:
                </td>
                <td>
                  <button
                    onClick={HandleApproveAll}
                    title="Approve All"
                    className="approve-all-btn"
                  >
                    <FaThumbsUp className="btn-icon" /> APPROVE ALL
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {filteredData.length > 0 && (
        <div className="pagination-container">
          <button
            className="pagination-button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>

          <span className="pagination-info">
            Page {currentPage} of {totalPages}
          </span>

          <button
            className="pagination-button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}

      {/* Remarks popup */}
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