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
      
      // Create a unique id for this record to ensure consistency across pagination
      const recordId = `${record.USRID}_${record.PunchDate}`;
      
      // Always copy device time values to input fields
      initialInputs[recordId] = {
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
  const handleTimeChange = (id, type, value) => {
    setTimeInputs(prev => {
      // Find the record by ID (format: USRID_PunchDate)
      const [userId, punchDate] = id.split('_');
      const record = filteredData.find(r => r.USRID === userId && r.PunchDate === punchDate);
      
      const currentRow = prev[id] || {
        inTime: record ? getTimeValue(record?.InTime) : "",
        outTime: record ? getTimeValue(record?.OutTime) : "",
        hours: record ? record?.Actual_Working_Hours || "00:00" : "00:00",
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
        [id]: updatedRow,
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
  
  // Generate a continuous date range array from start to end dates
  const generateDateRange = (startDate, endDate) => {
    const dates = [];
    const currentDate = new Date(startDate);
    const lastDate = new Date(endDate);
    
    while (currentDate <= lastDate) {
      dates.push(format(new Date(currentDate), 'yyyy-MM-dd'));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  };

  // Filter handler
  const handleFilter = () => {
    if (!attendanceData || attendanceData.length === 0) return;
    
    // Clear the filteredData state to show loading state
    setFilteredData([]);
    setIsLoading(true);
    
    // Get manager analysis from local storage
    const managerAnalysis = JSON.parse(localStorage.getItem('managerAnalysis')) || 
                           { managers: [], superAdmins: [], managerCounts: {} };
    
    // Check user roles
    const isSuperAdmin = managerAnalysis.superAdmins && user?.name ? 
                       managerAnalysis.superAdmins.includes(user.name) : false;
    
    const isManager = managerAnalysis.managers && user?.name ? 
                     managerAnalysis.managers.includes(user.name) : false;
    
    console.log(`Filtering with role - SUPERADMIN: ${isSuperAdmin}, Manager: ${isManager}`);
    console.log(`Selected employee: ${selectedEmployee}`);
    
    // Check if we need to fetch new data for a specific employee
    if (selectedEmployee !== 'self' && selectedEmployee !== "-1") {
      // Fetch the specific employee data from API
      fetchEmployeeAttendance(selectedEmployee);
      return;
    }
    
    let filtered = [...attendanceData];
    
    // Filter by selected employee or view mode
    if (selectedEmployee === 'self') {
      // Self mode - only show user's own attendance
      filtered = filtered.filter(record => record.USRID === user.id);
      console.log(`Filtered to show only self (${user.id}): ${filtered.length} records`);
    } else if (selectedEmployee === "-1" && isSuperAdmin) {
      // All Employees mode - only available for SUPERADMINs
      // Don't filter by user, show all records
      console.log(`Showing all records for SUPERADMIN: ${filtered.length} records`);
    } else {
      // Default behavior for non-SUPERADMINs - show only own records
      if (!isSuperAdmin) {
        filtered = filtered.filter(record => record.USRID === user.id);
        console.log(`Default filter to self for non-SUPERADMIN: ${filtered.length} records`);
      }
    }

    // Date range filter
    if (dateRange[0] && dateRange[1]) {
      const beforeFilter = filtered.length;
      filtered = filtered.filter(record => {
        const recordDate = parseISO(record.PunchDate);
        return isWithinInterval(recordDate, {
          start: dateRange[0],
          end: dateRange[1]
        });
      });
      console.log(`Date range filter applied: ${beforeFilter} -> ${filtered.length} records`);
      
      // Generate a list of all dates in the range
      const allDatesInRange = generateDateRange(dateRange[0], dateRange[1]);
      
      // Find dates that are missing from the filtered data
      const existingDates = new Set(filtered.map(record => record.PunchDate.substring(0, 10)));
      const missingDates = allDatesInRange.filter(date => !existingDates.has(date));
      
      console.log(`Found ${missingDates.length} missing dates in the date range`);
      
      // Create placeholder records for missing dates
      const placeholderRecords = missingDates.map(date => {
        // Determine which user ID to use for the placeholder
        let userId = user.id;
        if (selectedEmployee !== "-1" && selectedEmployee !== "self") {
          userId = selectedEmployee;
        }
        
        // Find a sample record with the same user ID to get employee details
        const sampleRecord = attendanceData.find(record => record.USRID === userId);
        
        return {
          USRID: userId,
          Employee_Name: sampleRecord ? sampleRecord.Employee_Name : user.name,
          DEPARTMENT: sampleRecord ? sampleRecord.DEPARTMENT : user.department || '',
          PunchDate: date,
          InTime: '--',
          OutTime: '--',
          Actual_Working_Hours: '00:00',
          Status: 'ABSENT',
          Manager_Name: sampleRecord ? sampleRecord.Manager_Name : '',
          isSuperAdmin: isSuperAdmin,
          isManager: isManager,
          formattedDate: date
        };
      });
      
      // Add the placeholder records to the filtered data
      if (placeholderRecords.length > 0) {
        filtered = [...filtered, ...placeholderRecords];
        console.log(`Added ${placeholderRecords.length} placeholder records for missing dates`);
      }
      
      // Sort by date descending
      filtered.sort((a, b) => {
        const dateA = new Date(a.PunchDate);
        const dateB = new Date(b.PunchDate);
        return dateB - dateA;
      });
    }

    // Mispunch filter
    if (showMispunchesOnly) {
      const beforeFilter = filtered.length;
      filtered = filtered.filter(record => isMispunch(record));
      console.log(`Mispunch filter applied: ${beforeFilter} -> ${filtered.length} records`);
    }

    setFilteredData(filtered);
    setIsFiltered(true);
    setIsLoading(false);
  };
  
  // Function to fetch attendance data for a specific employee (for admin/manager use)
  const fetchEmployeeAttendance = async (employeeId) => {
    try {
      // Check if we have information about this employee already
      const employeeInfo = uniqueEmployees.find(emp => emp.id === employeeId);
      
      // If we can't find the employee in our list, show an error
      if (!employeeInfo) {
        setIsLoading(false);
        setFilteredData([]);
        alert("Could not find this employee in your team.");
        return;
      }
      
      // Get manager analysis from local storage
      const managerAnalysis = JSON.parse(localStorage.getItem('managerAnalysis')) || 
                           { managers: [], superAdmins: [], managerCounts: {} };
                           
      // Check if this is a SUPERADMIN
      const isSuperAdmin = managerAnalysis.superAdmins && user?.name ? 
                        managerAnalysis.superAdmins.includes(user.name) : false;
      
      // Check if this user is a manager
      const isManager = managerAnalysis.managers && user?.name ? 
                      managerAnalysis.managers.includes(user.name) : false;
      
      // If not SUPERADMIN or manager, verify this employee belongs to this manager
      if (!isSuperAdmin && !isManager) {
        setIsLoading(false);
        setFilteredData([]);
        alert("You don't have permission to view this employee's attendance.");
        return;
      }
      
      if (!isSuperAdmin && isManager) {
        // If not SUPERADMIN but manager, check if this employee is a direct report
        const isEmployeeOfManager = employeeInfo.managerName === user.name;
        if (!isEmployeeOfManager) {
          setIsLoading(false);
          setFilteredData([]);
          alert(`This employee (${employeeInfo.name}) is not assigned to you as a manager.`);
          return;
        }
      }
      
      // Fetch the employee's attendance data from the appropriate endpoint
      const endpoint = isSuperAdmin ? `${API_BASE_URL}/api/admin-attendance` : `${API_BASE_URL}/api/attendance`;
      
      const response = await axios.get(endpoint, {
        params: { userId: employeeId },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        }
      });
      
      if (response.data && response.data.length > 0) {
        console.log("Employee attendance data:", response.data);
        
        const formattedData = response.data.map(record => ({
          ...record,
          formattedDate: format(parseISO(record.PunchDate), 'yyyy-MM-dd')
        }));
        
        let filtered = [...formattedData];
        
        // Apply date range filter
        if (dateRange[0] && dateRange[1]) {
          filtered = filtered.filter(record => {
            const recordDate = parseISO(record.PunchDate);
            return isWithinInterval(recordDate, {
              start: dateRange[0],
              end: dateRange[1]
            });
          });
          
          // Generate a list of all dates in the range
          const allDatesInRange = generateDateRange(dateRange[0], dateRange[1]);
          
          // Find dates that are missing from the filtered data
          const existingDates = new Set(filtered.map(record => record.PunchDate.substring(0, 10)));
          const missingDates = allDatesInRange.filter(date => !existingDates.has(date));
          
          // Create placeholder records for missing dates
          const placeholderRecords = missingDates.map(date => {
            // Find a sample record to get employee details
            const sampleRecord = formattedData[0];
            
            return {
              USRID: employeeId,
              Employee_Name: sampleRecord ? sampleRecord.Employee_Name : employeeInfo.name,
              DEPARTMENT: sampleRecord ? sampleRecord.DEPARTMENT : employeeInfo.department,
              PunchDate: date,
              InTime: '--',
              OutTime: '--',
              Actual_Working_Hours: '00:00',
              Status: 'ABSENT',
              Manager_Name: sampleRecord ? sampleRecord.Manager_Name : employeeInfo.managerName,
              formattedDate: date,
              isSuperAdmin: isSuperAdmin,
              isManager: isManager
            };
          });
          
          // Add the placeholder records to the filtered data
          filtered = [...filtered, ...placeholderRecords];
          
          // Sort by date descending
          filtered.sort((a, b) => {
            const dateA = new Date(a.PunchDate);
            const dateB = new Date(b.PunchDate);
            return dateB - dateA;
          });
        }
        
        // Apply mispunch filter if needed
        if (showMispunchesOnly) {
          filtered = filtered.filter(record => isMispunch(record));
        }
        
        setFilteredData(filtered);
        
        // Initialize time inputs
        const initialTimeInputs = initializeTimeFromDevice(filtered);
        setTimeInputs(initialTimeInputs);
      } else {
        // No attendance data found - create placeholder records
        if (dateRange[0] && dateRange[1]) {
          // Generate a list of all dates in the range
          const allDatesInRange = generateDateRange(dateRange[0], dateRange[1]);
          
          // Create placeholder records for all dates
          const placeholderRecords = allDatesInRange.map(date => {
            return {
              USRID: employeeId,
              Employee_Name: employeeInfo.name,
              DEPARTMENT: employeeInfo.department,
              PunchDate: date,
              InTime: '--',
              OutTime: '--',
              Actual_Working_Hours: '00:00',
              Status: 'ABSENT',
              Manager_Name: employeeInfo.managerName,
              formattedDate: date,
              isSuperAdmin: isSuperAdmin,
              isManager: isManager
            };
          });
          
          // Sort by date descending
          placeholderRecords.sort((a, b) => {
            const dateA = new Date(a.PunchDate);
            const dateB = new Date(b.PunchDate);
            return dateB - dateA;
          });
          
          setFilteredData(placeholderRecords);
          
          // Initialize time inputs
          const initialTimeInputs = initializeTimeFromDevice(placeholderRecords);
          setTimeInputs(initialTimeInputs);
        } else {
          setFilteredData([]);
        }
      }
    } catch (error) {
      console.error("Error fetching employee attendance data:", error);
      setFilteredData([]);
    } finally {
      setIsLoading(false);
      setIsFiltered(true);
    }
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
  const resetTimeToDeviceData = (id, record) => {
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
      
      console.log(`Resetting times for index ${id}:`, { 
        deviceIn: record.InTime, 
        deviceOut: record.OutTime,
        extractedIn: inTime,
        extractedOut: outTime
      });
      
      // Always copy device time values to input fields
      setTimeInputs(prev => ({
        ...prev,
        [id]: {
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
  
  // Enhanced manager detection logic
  const analyzeManagerRelationships = (allUsers) => {
    if (!allUsers || allUsers.length === 0) {
      console.log("No users to analyze");
      return { managers: [], managerCounts: {}, superAdmins: [] };
    }

    console.log("------- MANAGER RELATIONSHIP ANALYSIS -------");
    console.log(`Total users in system: ${allUsers.length}`);
    
    // Create a map of all users by ID for quick lookup
    const userMap = {};
    allUsers.forEach(u => {
      userMap[u.USRID] = {
        ...u,
        name: u.name || u.NM || 'Unknown', // Normalize name field
        hasManager: !!(u.Manager_Name && u.Manager_Name.trim() !== '' && 
                     u.Manager_Name !== '--' && u.Manager_Name !== 'null' && 
                     u.Manager_Name !== 'undefined'),
        isSuperAdmin: u.Manager_Name === 'SUPERADMIN',
        isManager: false, // Will be set later
        employees: [] // Will be populated later
      };
    });
    
    // Map to store managers and count of employees under each manager
    const managerCounts = {};
    
    // First pass: log all users and their managers
    console.log("\n----- USER-MANAGER RELATIONSHIPS -----");
    allUsers.forEach(user => {
      const userName = user.name || user.NM || 'Unknown';
      const managerName = user.Manager_Name || 'NONE';
      
      console.log(`User: ${userName} (${user.USRID}), Manager: ${managerName}`);
      
      // Record manager-employee relationship if manager exists
      if (userMap[user.USRID].hasManager) {
        // Add this manager to the counts
        if (managerCounts[managerName]) {
          managerCounts[managerName]++;
        } else {
          managerCounts[managerName] = 1;
        }
        
        // Find the manager in the user map if they exist
        const managerEntry = Object.values(userMap).find(u => 
          u.name === managerName
        );
        
        if (managerEntry) {
          managerEntry.isManager = true;
          managerEntry.employees.push(user.USRID);
        } else {
          console.log(`WARNING: Manager "${managerName}" not found as a user in the system`);
        }
      }
    });
    
    // Second pass: validate the manager hierarchy
    console.log("\n----- MANAGER VALIDATION -----");
    const validManagers = [];
    const invalidManagers = [];
    const superAdmins = [];
    
    Object.values(userMap).forEach(user => {
      // Check for SUPERADMIN designation
      if (user.isSuperAdmin) {
        superAdmins.push(user.name);
        console.log(`👑 SUPERADMIN identified: ${user.name} (${user.USRID})`);
      }
      
      if (user.isManager) {
        const isValidManager = true; // All managers are valid now as per the new design
        
        if (isValidManager) {
          validManagers.push(user.name);
          console.log(`✓ Valid manager: ${user.name} (${user.USRID}) - Has ${user.employees.length} employees`);
          console.log(`  Employees: ${user.employees.map(id => userMap[id] ? userMap[id].name : id).join(', ')}`);
        } else {
          invalidManagers.push(user.name);
          console.log(`✗ Invalid manager: ${user.name} (${user.USRID}) - Has their own manager: ${user.Manager_Name}`);
        }
      }
    });
    
    console.log("\n----- SUMMARY -----");
    console.log(`Found ${superAdmins.length} SUPERADMINs`);
    console.log(`Found ${validManagers.length} valid managers`);
    console.log(`Found ${invalidManagers.length} invalid managers`);
    
    // Check specific employees mentioned by user
    console.log("\n----- SPECIFIC EMPLOYEE CHECK -----");
    ["Vibhu Sood", "Anuj Kumar", "Narayan Singh"].forEach(name => {
      const employee = Object.values(userMap).find(u => u.name && u.name.includes(name));
      if (employee) {
        console.log(`${employee.name} (${employee.USRID}):`);
        console.log(`  Has manager: ${employee.hasManager ? employee.Manager_Name : 'No'}`);
        console.log(`  Is SUPERADMIN: ${employee.isSuperAdmin ? 'Yes' : 'No'}`);
        console.log(`  Is manager: ${employee.isManager ? 'Yes' : 'No'}`);
        if (employee.isManager) {
          console.log(`  Manages: ${employee.employees.map(id => userMap[id]?.name || id).join(', ')}`);
        }
      } else {
        console.log(`Employee '${name}' not found in system`);
      }
    });
    
    console.log("------- END OF ANALYSIS -------");
    
    return { 
      managers: validManagers,
      superAdmins: superAdmins,
      managerCounts,
      invalidManagers,
      employeesWithoutManager: Object.values(userMap)
        .filter(u => !u.hasManager && !u.isSuperAdmin)
        .map(u => u.USRID)
    };
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
      
      console.log("---------- ROLE DETECTION DEBUG ----------");
      console.log(`Checking role for user: ${user.name} (${user.id})`);
      
      // First check if user is admin by looking at Manager_Name
      let isSuperAdmin = false;
      let isManager = false;
      
      try {
        console.log("Making admin status check API call...");
        const adminCheckResponse = await axios.get(`${API_BASE_URL}/api/check-admin-status`, {
          params: { userId: user.id },
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          }
        });
        
        console.log("Admin check response:", adminCheckResponse.data);
        
        isSuperAdmin = adminCheckResponse.data.isSuperAdmin;
        isManager = adminCheckResponse.data.isManager;
        
        // Additional debug info
        const employeeCount = adminCheckResponse.data.employeeCount || 0;
        const managerName = adminCheckResponse.data.managerName || "None";
        
        console.log(`User ${user.name} is:
          - SUPERADMIN: ${isSuperAdmin ? 'YES' : 'NO'}
          - Manager: ${isManager ? 'YES' : 'NO'}
          - Manager Name: ${managerName}
          - Employee Count: ${employeeCount}
        `);
      } catch (error) {
        console.error("Failed to check admin status:", error);
        // Fallback to hardcoded admin IDs for backward compatibility
        isSuperAdmin = user.id === '2011090101' || user.id === '2013090101';
        console.log(`Fallback admin detection: ${isSuperAdmin ? 'Is Admin' : 'Not Admin'}`);
      }
      
      // Use the appropriate endpoint based on admin status
      const endpoint = isSuperAdmin ? `${API_BASE_URL}/api/admin-attendance` : `${API_BASE_URL}/api/attendance`;
      console.log(`Using endpoint: ${endpoint}`);
      
      // Fetch user's attendance data
      console.log(`Fetching attendance data for user ${user.id}...`);
      const response = await axios.get(endpoint, {
        params: { userId: user.id },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        }
      });
      
      console.log(`Received ${response.data?.length || 0} attendance records`);
      
      // Also fetch all users to find manager-employee relationships
      let allUsers = [];
      try {
        console.log("Fetching all users for manager analysis...");
        const loginResponse = await axios.get(`${API_BASE_URL}/api/LOGIN`);
        if (loginResponse.data && loginResponse.data.length > 0) {
          allUsers = loginResponse.data;
          console.log("Fetched all users:", allUsers.length, "users");
          
          // Sample a few users to verify Manager_Name is present
          const sampleSize = Math.min(5, allUsers.length);
          console.log(`Sample of ${sampleSize} users with Manager_Name field:`);
          for (let i = 0; i < sampleSize; i++) {
            console.log(`User ${i+1}: ${allUsers[i].name || allUsers[i].NM || 'Unknown'}, Manager: ${allUsers[i].Manager_Name || 'None'}`);
          }
          
          // Analyze manager relationships
          console.log("Starting manager relationship analysis...");
          const managerAnalysis = analyzeManagerRelationships(allUsers);
          
          // Store manager information in local storage for future reference
          localStorage.setItem('managerAnalysis', JSON.stringify(managerAnalysis));
          
          // Update user status with new admin detection (with proper null checking)
          isSuperAdmin = user?.name && managerAnalysis.superAdmins ? 
                       managerAnalysis.superAdmins.includes(user.name) : false;
          
          // Check if current user is a manager (with proper null checking)
          isManager = user?.name && managerAnalysis.managers ? 
                    managerAnalysis.managers.includes(user.name) : false;
          
          console.log(`After analysis - User ${user?.name || 'unknown'} is: 
            - SUPERADMIN: ${isSuperAdmin ? 'YES' : 'NO'}
            - Manager: ${isManager ? 'YES' : 'NO'}`);
          
          // If user is a manager, log their employees count
          if (isManager) {
            const employeeCount = managerAnalysis.managerCounts && user?.name ? 
                               (managerAnalysis.managerCounts[user.name] || 0) : 0;
            console.log(`Manager ${user.name} has ${employeeCount} employees`);
            
            // Log the employee names if available
            const employeesOfManager = allUsers.filter(emp => emp.Manager_Name === user.name);
            if (employeesOfManager.length > 0) {
              console.log("Employees of this manager:");
              employeesOfManager.forEach((emp, index) => {
                console.log(`  ${index+1}. ${emp.name || emp.NM || 'Unknown'} (${emp.USRID})`);
              });
            } else {
              console.log("No employees found for this manager in the employee list");
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch user list:", error);
      }
      console.log("----------------------------------------");
      
      if (response.data && response.data.length > 0) {
        console.log("Attendance data:", response.data.length, "records");
        
        // Format attendance data
        let formattedData = response.data.map(record => ({
          ...record,
          formattedDate: format(parseISO(record.PunchDate), 'yyyy-MM-dd'),
          isSuperAdmin: isSuperAdmin,
          isManager: isManager
        }));
        
        // For admin users or potential managers, add placeholders for managed employees
        if (allUsers.length > 0) {
          // Get manager analysis from local storage or use empty defaults
          const managerAnalysis = JSON.parse(localStorage.getItem('managerAnalysis')) || 
                                 { managers: [], superAdmins: [], managerCounts: {} };
                                 
          // Check if this user is a manager (has at least one employee)
          const isManager = managerAnalysis.managers && user?.name ? 
                          managerAnalysis.managers.includes(user.name) : false;
          
          // Find employees for this manager (where Manager_Name matches the user's name)
          const managedEmployees = allUsers.filter(emp => 
            emp.USRID !== user.id && // Not the user themselves
            emp.Manager_Name === user.name // Manager name matches user's name
          );
          
          console.log(`User ${user.name} ${isManager ? 'is' : 'is not'} a manager with ${managedEmployees.length} direct reports`);
          
          // For admins, add all employees as placeholders
          // For managers, add only their managed employees as placeholders
          const employeesToAdd = isSuperAdmin ? allUsers.filter(emp => emp.USRID !== user.id) : managedEmployees;
          
          console.log(`Adding ${employeesToAdd.length} employees as placeholders`);
          
          // Get list of user IDs already in attendance data
          const existingUsers = new Set(formattedData.map(record => record.USRID));
          
          // Add placeholder records for employees who don't already have records
          employeesToAdd.forEach(emp => {
            if (!existingUsers.has(emp.USRID)) {
              // Add a placeholder record for this employee
              formattedData.push({
                USRID: emp.USRID,
                Employee_Name: emp.name || emp.NM || 'Unknown',
                DEPARTMENT: emp.DEPARTMENT || '',
                PunchDate: format(new Date(), 'yyyy-MM-dd'),
                InTime: '--',
                OutTime: '--',
                Actual_Working_Hours: '00:00',
                Status: 'ABSENT',
                Manager_Name: emp.Manager_Name || user.name,
                isSuperAdmin: isSuperAdmin,
                isManager: isManager,
                formattedDate: format(new Date(), 'yyyy-MM-dd'),
                isPlaceholder: true
              });
            }
          });
        }
        
        setAttendanceData(formattedData);
        
        // Extract unique months from data
        const months = [...new Set(formattedData
          .filter(record => !record.isPlaceholder) // Exclude placeholders for month ranges
          .map(record => {
            const date = parseISO(record.PunchDate);
            return format(date, 'yyyy-MM');
          }))].sort();
        
        // Create month ranges
        const ranges = months.map(monthStr => {
          const [year, month] = monthStr.split('-').map(Number);
          const firstDay = new Date(year, month - 1, 1);
          const lastDay = endOfMonth(new Date(year, month - 1, 1));
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
          
          // Filter data to show only user's own data initially
          const filteredForMonth = formattedData.filter(record => {
            // Only show user's own data initially
            if (record.USRID !== user.id) {
              return false;
            }
            
            // Check if date is within range and not a placeholder
            if (record.isPlaceholder) return false;
            
            const recordDate = parseISO(record.PunchDate);
            return isWithinInterval(recordDate, {
              start: defaultMonth.start,
              end: defaultMonth.end
            });
          });
          
          setFilteredData(filteredForMonth);
          
          // If this is a manager or admin, set to self mode by default
          if (isSuperAdmin || isManager) {
            setSelectedEmployee('self');
          }
        } else {
          // Filter to show only the user's own data initially
          const filteredData = formattedData.filter(record => 
            record.USRID === user.id && !record.isPlaceholder
          );
            
          setFilteredData(filteredData);
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
      
      // Log admin information for debugging
      if (user.id === '2011090101' || user.id === '2013090101') {
        console.log("Admin user detected:", user);
      }
    }
  }, [user]);
  
  // Effect to handle admin functionality when component loads
  useEffect(() => {
    if (user && (user.id === '2011090101' || user.id === '2013090101')) {
      console.log("Admin user detected, enabling admin functionality");
      // Default admin to self-mode when first loading
      setSelectedEmployee('self');
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
    const recordId = `${record.USRID}_${record.PunchDate}`;
    const timeInput = timeInputs[recordId] || {};
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
      alert("All attendance reroved successfully!");
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

  // Get unique employees with improved manager logic
  const getUniqueEmployees = () => {
    if (!attendanceData || attendanceData.length === 0 || !user) return [];
    
    // Create a map to track unique employees by ID
    const employeeMap = new Map();
    
    // Get manager analysis from local storage
    const managerAnalysis = JSON.parse(localStorage.getItem('managerAnalysis')) || 
                           { managers: [], superAdmins: [], managerCounts: {} };
    
    // Check if current user is a SUPERADMIN or manager
    const isSuperAdmin = managerAnalysis.superAdmins && user.name ? 
                      managerAnalysis.superAdmins.includes(user.name) : false;
    
    const isManager = managerAnalysis.managers && user.name ? 
                    managerAnalysis.managers.includes(user.name) : false;
    
    console.log(`User ${user.name} (${user.id}) - isSuperAdmin: ${isSuperAdmin}, isManager: ${isManager}`);
    
    // For debugging
    if (isManager) {
      const employeeCount = managerAnalysis.managerCounts ? 
                         (managerAnalysis.managerCounts[user.name] || 0) : 0;
      console.log(`Manager ${user.name} has ${employeeCount} employees according to analysis`);
    }
    
    // Use the direct reports from manager analysis instead of scanning all attendance data
    if (isManager) {
      // Get the list of direct reports from the analysis
      const directReports = [];
      
      // First, find all employees in attendance data where Manager_Name matches current user
      attendanceData.forEach(record => {
        if (record.USRID && 
            record.USRID !== user.id && 
            record.Employee_Name && 
            record.Manager_Name === user.name) {
          if (!employeeMap.has(record.USRID)) {
            employeeMap.set(record.USRID, {
              id: record.USRID,
              name: record.Employee_Name,
              department: record.DEPARTMENT || 'Unknown',
              managerName: record.Manager_Name
            });
            directReports.push(record.USRID);
          }
        }
      });
      
      console.log(`Found ${directReports.length} direct reports in attendance data`);
      
      // If we didn't find all direct reports in attendance data, make a direct API call
      if (directReports.length === 0) {
        console.log("No direct reports found in attendance data, making direct API call...");
        fetchEmployeeList().then(employees => {
          if (employees && employees.length > 0) {
            console.log(`Fetched ${employees.length} employees from direct API call`);
          }
        }).catch(error => {
          console.error("Error fetching employee list:", error);
        });
      }
    } else if (isSuperAdmin) {
      // For SUPERADMIN, add all employees except self
      attendanceData.forEach(record => {
        if (record.USRID && 
            record.USRID !== user.id && 
            record.Employee_Name) {
          if (!employeeMap.has(record.USRID)) {
            employeeMap.set(record.USRID, {
              id: record.USRID,
              name: record.Employee_Name,
              department: record.DEPARTMENT || 'Unknown',
              managerName: record.Manager_Name || 'Unknown'
            });
          }
        }
      });
    }
    
    // Convert map to array and sort by name
    const employees = Array.from(employeeMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name)
    );
    
    // Add the current user as a self option at the beginning
    employees.unshift({
      id: 'self',
      name: user ? `${user.name} (You)` : 'Yourself',
      department: user ? user.department : '',
      managerName: 'Self'
    });
    
    console.log(`Found ${employees.length} employees (including self) for user ${user.name}`);
    
    return employees;
  };

  // Function to fetch the full employee list directly
  const fetchEmployeeList = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/LOGIN`);
      
      if (response.data && response.data.length > 0) {
        const employees = response.data;
        console.log("Fetched full employee list:", employees.length, "employees");
        
        // Filter based on user role
        const managerAnalysis = JSON.parse(localStorage.getItem('managerAnalysis')) || 
                             { managers: [], superAdmins: [], managerCounts: {} };
        
        const isSuperAdmin = managerAnalysis.superAdmins && user?.name ? 
                          managerAnalysis.superAdmins.includes(user.name) : false;
        
        const isManager = managerAnalysis.managers && user?.name ? 
                        managerAnalysis.managers.includes(user.name) : false;
        
        // Create employee map
        const employeeMap = new Map();
        
        // Log all Manager_Name values for debugging
        console.log("Examining Manager_Name values:");
        const managerNames = new Set();
        employees.forEach(emp => {
          if (emp.Manager_Name) {
            managerNames.add(emp.Manager_Name);
          }
        });
        console.log("Unique Manager Names:", Array.from(managerNames));
        
        // Count direct reports
        let directReportCount = 0;
        
        // Process employees based on role
        employees.forEach(emp => {
          if (emp.USRID === user.id) return; // Skip self
          
          // For managers, only include employees where Manager_Name exactly matches user's name
          if (isManager) {
            // Make sure to trim and do a case-insensitive comparison since database values may have inconsistencies
            const empManagerName = (emp.Manager_Name || '').trim();
            const currentUserName = (user.name || '').trim();
            
            const isDirectReport = empManagerName.toLowerCase() === currentUserName.toLowerCase();
            
            if (isDirectReport) {
              directReportCount++;
              console.log(`Direct Report: ${emp.name || emp.NM || 'Unknown'} (${emp.USRID}), Manager: "${emp.Manager_Name}"`);
              
              employeeMap.set(emp.USRID, {
                id: emp.USRID,
                name: emp.name || emp.NM || 'Unknown',
                department: emp.DEPARTMENT || 'Unknown',
                managerName: emp.Manager_Name || 'Unknown'
              });
            }
          } else if (isSuperAdmin) {
            // For SUPERADMIN, add all employees
            employeeMap.set(emp.USRID, {
              id: emp.USRID,
              name: emp.name || emp.NM || 'Unknown',
              department: emp.DEPARTMENT || 'Unknown',
              managerName: emp.Manager_Name || 'Unknown'
            });
          }
        });
        
        console.log(`Found ${directReportCount} direct reports from API call`);
        
        // Add to attendanceData to ensure it's available for the dropdown
        const employeeRecords = Array.from(employeeMap.values());
        
        // Create placeholder attendance records for these employees
        const placeholders = employeeRecords.map(emp => ({
          USRID: emp.id,
          Employee_Name: emp.name,
          DEPARTMENT: emp.department,
          PunchDate: format(new Date(), 'yyyy-MM-dd'),
          InTime: '--',
          OutTime: '--',
          Actual_Working_Hours: '00:00',
          Status: 'ABSENT',
          Manager_Name: emp.managerName,
          formattedDate: format(new Date(), 'yyyy-MM-dd'),
          isPlaceholder: true
        }));
        
        // Update attendanceData with these placeholders if not already present
        if (placeholders.length > 0) {
          setAttendanceData(prevData => {
            const existingIds = new Set(prevData.map(record => record.USRID));
            const newPlaceholders = placeholders.filter(p => !existingIds.has(p.USRID));
            console.log(`Adding ${newPlaceholders.length} new placeholder records to attendanceData`);
            return [...prevData, ...newPlaceholders];
          });
        }
        
        return employeeRecords;
      }
      
      return [];
    } catch (error) {
      console.error("Error fetching employee list:", error);
      return [];
    }
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
              <div className="select-container">
                <select
                  id="employee-select"
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="filter-select"
                >
                  {(() => {
                    // Get manager analysis from local storage or use empty defaults
                    const managerAnalysis = JSON.parse(localStorage.getItem('managerAnalysis')) || 
                                          { managers: [], superAdmins: [], managerCounts: {} };
                    
                    // Check if user is an admin (with proper null checking)
                    const isAdmin = managerAnalysis.superAdmins && user?.name ? 
                                  managerAnalysis.superAdmins.includes(user.name) : false;
                    
                    // Check if user is a manager (with proper null checking)
                    const isManager = managerAnalysis.managers && user?.name ? 
                                    managerAnalysis.managers.includes(user.name) : false;
                    
                    if (isAdmin) {
                      // Options for admin users
                      return (
                        <>
                          <option value="-1">All Employees</option>
                          {uniqueEmployees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} {emp.id === 'self' ? '' : `(${emp.id})`}
                            </option>
                          ))}
                        </>
                      );
                    } else if (isManager) {
                      // Options for managers with team members
                      return (
                        <>
                          <option value="self">{user ? `${user.name} (You)` : 'Yourself'}</option>
                          {uniqueEmployees.filter(emp => emp.id !== 'self').map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} ({emp.department})
                            </option>
                          ))}
                        </>
                      );
                    } else {
                      // Options for regular employees with no team members
                      return (
                        <>
                          <option value="self">
                            {user ? user.name : 'Yourself'}
                          </option>
                        </>
                      );
                    }
                  })()}
                </select>
                <label htmlFor="employee-select">
                  {(() => {
                    // Get manager analysis
                    const managerAnalysis = JSON.parse(localStorage.getItem('managerAnalysis')) || 
                                          { managers: [], superAdmins: [], managerCounts: {} };
                    
                    // Check if user is an admin (with proper null checking)
                    const isAdmin = managerAnalysis.superAdmins && user?.name ? 
                                  managerAnalysis.superAdmins.includes(user.name) : false;
                    
                    // Check if user is a manager (with proper null checking)
                    const isManager = managerAnalysis.managers && user?.name ? 
                                    managerAnalysis.managers.includes(user.name) : false;
                    
                    // Get employee count
                    const employeeCount = isManager && user?.name && managerAnalysis.managerCounts ? 
                                        (managerAnalysis.managerCounts[user.name] || 0) : 0;
                    
                    if (isAdmin) {
                      return 'All Employees';
                    } else if (isManager) {
                      return `Team Members (${employeeCount})`;
                    } else {
                      return 'Your Attendance';
                    }
                  })()}
                </label>
              </div>
            </div>
            
            <div className="filter-item date-range-picker">
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
                    // Automatically apply the filter if both dates are selected
                    if (update[0] && update[1]) {
                      setDateRange(update);
                      setTimeout(() => handleFilter(), 100);
                    }
                  }}
                  monthsShown={1}
                  className="hidden-date-picker"
                  highlightDates={availableMonthRanges.map(range => ({
                    start: range.start,
                    end: range.end
                  }))}
                  showMonthDropdown={true}
                  showYearDropdown={true}
                  dropdownMode="select"
                  calendarClassName="calendar-visible"
                  disabledKeyboardNavigation
                  popperClassName="calendar-popper"
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
                  popperPlacement="bottom-start"
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
                        value={timeInputs[`${record.USRID}_${record.PunchDate}`]?.inTime || ""}
                        onChange={(e) =>
                          handleTimeChange(`${record.USRID}_${record.PunchDate}`, "inTime", e.target.value)
                        }
                        className="time-input"
                      />
                      <button 
                        className="reset-time-btn" 
                        title="Reset to device time"
                        onClick={() => resetTimeToDeviceData(`${record.USRID}_${record.PunchDate}`, record)}
                      >
                        <FaUndo className="reset-icon" />
                      </button>
                    </div>
                  </td>
                  <td className="settime">
                    <div className="time-input-container">
                      <input
                        type="time"
                        value={timeInputs[`${record.USRID}_${record.PunchDate}`]?.outTime || ""}
                        onChange={(e) =>
                          handleTimeChange(`${record.USRID}_${record.PunchDate}`, "outTime", e.target.value)
                        }
                        className="time-input"
                      />
                    </div>
                  </td>
                  <td>
                    {calculateWorkingHours(
                      timeInputs[`${record.USRID}_${record.PunchDate}`]?.inTime || "",
                      timeInputs[`${record.USRID}_${record.PunchDate}`]?.outTime || ""
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

                    {/* Show approve button only for admin users */}
                    {((user && (user.id === '2011090101' || user.id === '2013090101')) || 
                       (record.Manager_Name && (record.Manager_Name === 'Admin' || record.Manager_Name === 'SuperAdmin'))) && (
                      <button
                        onClick={() => HandleApprove(index)}
                        title="Approve"
                        disabled={record.Status === "PRESENT"}
                        className="action-btn approve-btn"
                      >
                        <FaThumbsUp className="btn-icon" />
                      </button>
                    )}
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
                  {/* Show 'Approve All' button only for admin users */}
                  {(user && (user.id === '2011090101' || user.id === '2013090101')) || 
                   (attendanceData[0]?.Manager_Name && 
                    (attendanceData[0].Manager_Name === 'Admin' || attendanceData[0].Manager_Name === 'SuperAdmin')) ? (
                    <button
                      onClick={HandleApproveAll}
                      title="Approve All"
                      className="approve-all-btn"
                    >
                      <FaThumbsUp className="btn-icon" /> APPROVE ALL
                    </button>
                  ) : null}
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