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
import {
  FaRegSave,
  FaEnvelope,
  FaCheck,
  FaThumbsUp,
  FaCalendarAlt,
  FaFilter,
  FaUndo,
  FaSignOutAlt,
  FaExclamationTriangle,
} from "react-icons/fa";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Material UI imports
import { Box, Typography, Paper, LinearProgress } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import BusinessIcon from "@mui/icons-material/Business";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

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
  const [selectedRows, setSelectedRows] = useState({}); // Add state for tracking selected rows

  // Saved records tracking
  const [savedRecords, setSavedRecords] = useState(() => {
    const saved = localStorage.getItem("savedAttendanceRecords");
    return saved ? JSON.parse(saved) : {};
  });

  // User and auth state
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("user");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("-1");
  const [selectedManager, setSelectedManager] = useState("-1");
  const [showMispunchesOnly, setShowMispunchesOnly] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);
  const [expandedRemarks, setExpandedRemarks] = useState({});
  const [popupRemarks, setPopupRemarks] = useState({
    show: false,
    index: null,
    value: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);

  // Date filtering
  const [dateRange, setDateRange] = useState([
    startOfMonth(new Date()),
    endOfMonth(new Date()),
  ]);
  const [startDate, endDate] = dateRange;
  const datePickerRef = useRef(null);

  // Month tracking

  const [monthRanges, setMonthRanges] = useState([]);
  const [availableMonthRanges, setAvailableMonthRanges] = useState([]);

  // Constants
  const MAX_CHARS = 40;

  // Add this with other state declarations
  const dateRangeSetByUser = useRef(false);

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
        hours: calculateWorkingHours(inTime, outTime),
      };
    });

    return initialInputs;
  };

  // Check if a record has a missing punch
  const isMispunch = (record) => {
    if (!record) return false;

    const missingInTime =
      !record.InTime || record.InTime === "" || record.InTime === "--";
    const missingOutTime =
      !record.OutTime || record.OutTime === "" || record.OutTime === "--";

    return missingInTime || missingOutTime;
  };

  // Calculate working hours from in and out times
  const calculateWorkingHours = (inTime, outTime) => {
    if (!inTime || !outTime) {
      return "00:00";
    }

    const inDate = new Date(`2025-01-01T${inTime}:00`);
    const outDate = new Date(`2025-01-01T${outTime}:00`);
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
    // If buttonStatus for this record is approved, highlight green
    const recordKey = `${record.USRID}_${record.PunchDate}`;
    if (buttonStatus[recordKey]?.record?.empReqShow &&
      buttonStatus[recordKey]?.record?.empReqShow.toLowerCase() === "no" &&
      buttonStatus[recordKey]?.record?.status &&
      buttonStatus[recordKey]?.record?.status.toLowerCase() === "approved") {
      return { backgroundColor: "rgba(40, 167, 69, 0.3)" };
    }
    switch (record.Status) {
      case "MIS PUNCH":
        return { backgroundColor: "rgba(210, 236, 17, 0.8)" };
      case "HALF DAY":
        return { backgroundColor: "rgba(255, 193, 7, 0.2)" };
      case "PRESENT":
        return { backgroundColor: "rgba(40, 167, 69, 0.2)" };
      case "ABSENT":
        return { backgroundColor: "rgba(220, 53, 69, 0.2)" };
      default:
        return {};
    }
  };

  // =========== EVENT HANDLERS ===========
  // Handle time input changes
  const handleTimeChange = (id, type, value) => {
    setTimeInputs((prev) => {
      // Find the record by ID (format: USRID_PunchDate)
      const [userId, punchDate] = id.split("_");
      const record = filteredData.find(
        (r) => r.USRID === userId && r.PunchDate === punchDate
      );

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
    setStatusInputs((prev) => ({
      ...prev,
      [index]: value,
    }));
  };

  // Handle reason input changes
  const handleReasonChange = (index, value) => {
    if (value.length <= MAX_CHARS) {
      setReasonInputs((prev) => ({
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
      value: currentValue || "",
    });
  };

  // Handle popup close
  const handlePopupClose = () => {
    setPopupRemarks({ show: false, index: null, value: "" });
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
      baseData = baseData.filter((record) => {
        const recordDate = parseISO(record.PunchDate);
        if (dateRange[1]) {
          return isWithinInterval(recordDate, {
            start: dateRange[0],
            end: dateRange[1],
          });
        } else {
          return (
            isAfter(recordDate, dateRange[0]) ||
            isEqual(recordDate, dateRange[0])
          );
        }
      });
    }

    // Apply mispunches filter if checked
    if (isChecked) {
      baseData = baseData.filter((record) => isMispunch(record));
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
      dates.push(format(new Date(currentDate), "yyyy-MM-dd"));
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

    // Clear selections when filter changes
    clearSelections();

    // Get manager analysis from local storage
    const managerAnalysis = JSON.parse(
      localStorage.getItem("managerAnalysis")
    ) || { managers: [], superAdmins: [], managerCounts: {} };

    // Check user roles
    const isSuperAdmin =
      managerAnalysis.superAdmins && user?.name
        ? managerAnalysis.superAdmins.includes(user.name)
        : false;

    const isManager =
      managerAnalysis.managers && user?.name
        ? managerAnalysis.managers.includes(user.name)
        : false;

    console.log(
      `Filtering with role - SUPERADMIN: ${isSuperAdmin}, Manager: ${isManager}`
    );
    console.log(`Selected employee: ${selectedEmployee}`);
    console.log(`Selected manager: ${selectedManager}`);

    // Check if we need to fetch new data for a specific employee
    if (selectedEmployee !== "self" && selectedEmployee !== "-1") {
      // Fetch the specific employee data from API
      fetchEmployeeAttendance(selectedEmployee);
      return;
    }

    let filtered = [...attendanceData];

    // Filter by selected employee or view mode
    if (selectedEmployee === "self") {
      // Self mode - only show user's own attendance
      filtered = filtered.filter((record) => record.USRID === user.id);
      console.log(
        `Filtered to show only self (${user.id}): ${filtered.length} records`
      );
    } else if (selectedEmployee === "-1" && isSuperAdmin) {
      // All Employees mode - only available for SUPERADMINs
      // Don't filter by user, show all records
      console.log(
        `Showing all records for SUPERADMIN: ${filtered.length} records`
      );
    } else if (isManager && selectedEmployee === "-1") {
      // Show all team members for manager
      filtered = filtered.filter((record) => record.Manager_Name === user.name);
      console.log(
        `Filtered to show all team members: ${filtered.length} records`
      );
    }

    // Filter by selected manager if applicable
    if (selectedManager !== "-1" && isSuperAdmin) {
      filtered = filtered.filter(
        (record) =>
          record.Manager_Name &&
          record.Manager_Name.toLowerCase() === selectedManager.toLowerCase()
      );
      console.log(
        `Filtered by manager ${selectedManager}: ${filtered.length} records`
      );
    }

    // Date range filter
    if (dateRange[0] && dateRange[1]) {
      const beforeFilter = filtered.length;
      filtered = filtered.filter((record) => {
        const recordDate = parseISO(record.PunchDate);
        return isWithinInterval(recordDate, {
          start: dateRange[0],
          end: dateRange[1],
        });
      });
      console.log(
        `Date range filter applied: ${beforeFilter} -> ${filtered.length} records`
      );

      // Generate a list of all dates in the range
      const allDatesInRange = generateDateRange(dateRange[0], dateRange[1]);

      // Find dates that are missing from the filtered data
      const existingDates = new Set(
        filtered.map((record) => record.PunchDate.substring(0, 10))
      );
      const missingDates = allDatesInRange.filter(
        (date) => !existingDates.has(date)
      );

      console.log(
        `Found ${missingDates.length} missing dates in the date range`
      );

      // Create placeholder records for missing dates
      const placeholderRecords = missingDates.map((date) => {
        // Determine which user ID to use for the placeholder
        let userId = user.id;
        if (selectedEmployee !== "-1" && selectedEmployee !== "self") {
          userId = selectedEmployee;
        }

        // Find a sample record with the same user ID to get employee details
        const sampleRecord = attendanceData.find(
          (record) => record.USRID === userId
        );

        return {
          USRID: userId,
          Employee_Name: sampleRecord ? sampleRecord.Employee_Name : user.name,
          DEPARTMENT: sampleRecord
            ? sampleRecord.DEPARTMENT
            : user.department || "",
          PunchDate: date,
          InTime: "--",
          OutTime: "--",
          Actual_Working_Hours: "00:00",
          Status: "ABSENT",
          Manager_Name: sampleRecord ? sampleRecord.Manager_Name : "",
          isSuperAdmin: isSuperAdmin,
          isManager: isManager,
          formattedDate: date,
        };
      });

      // Add the placeholder records to the filtered data
      if (placeholderRecords.length > 0) {
        filtered = [...filtered, ...placeholderRecords];
        console.log(
          `Added ${placeholderRecords.length} placeholder records for missing dates`
        );
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
      filtered = filtered.filter((record) => isMispunch(record));
      console.log(
        `Mispunch filter applied: ${beforeFilter} -> ${filtered.length} records`
      );
    }

    setFilteredData(filtered);
    setIsFiltered(true);
    setIsLoading(false);
  };

  // Function to fetch attendance data for a specific employee (for admin/manager use)
  const fetchEmployeeAttendance = async (employeeId) => {
    try {
      // Check if we have information about this employee already
      const employeeInfo = uniqueEmployees.find((emp) => emp.id === employeeId);

      // If we can't find the employee in our list, show an error
      if (!employeeInfo) {
        setIsLoading(false);
        setFilteredData([]);
        alert("Could not find this employee in your team.");
        return;
      }

      // Get manager analysis from local storage
      const managerAnalysis = JSON.parse(
        localStorage.getItem("managerAnalysis")
      ) || { managers: [], superAdmins: [], managerCounts: {} };

      // Check if this is a SUPERADMIN
      const isSuperAdmin =
        managerAnalysis.superAdmins && user?.name
          ? managerAnalysis.superAdmins.includes(user.name)
          : false;

      // Check if this user is a manager
      const isManager =
        managerAnalysis.managers && user?.name
          ? managerAnalysis.managers.includes(user.name)
          : false;

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
          alert(
            `This employee (${employeeInfo.name}) is not assigned to you as a manager.`
          );
          return;
        }
      }

      // Fetch the employee's attendance data from the appropriate endpoint
      const endpoint = isSuperAdmin
        ? `${API_BASE_URL}/api/admin-attendance`
        : `${API_BASE_URL}/api/attendance`;

      const response = await axios.get(endpoint, {
        params: { userId: employeeId },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },



      });

      if (response.data && response.data.length > 0) {
        console.log("Employee attendance dataxxxxxxxxxxxx:", response.data);

        const formattedData = response.data.map((record) => ({
          ...record,
          formattedDate: format(parseISO(record.PunchDate), "yyyy-MM-dd"),
        }));

        let filtered = [...formattedData];

        // Apply date range filter
        if (dateRange[0] && dateRange[1]) {
          filtered = filtered.filter((record) => {
            const recordDate = parseISO(record.PunchDate);
            return isWithinInterval(recordDate, {
              start: dateRange[0],
              end: dateRange[1],
            });
          });

          // Generate a list of all dates in the range
          const allDatesInRange = generateDateRange(dateRange[0], dateRange[1]);

          // Find dates that are missing from the filtered data
          const existingDates = new Set(
            filtered.map((record) => record.PunchDate.substring(0, 10))
          );
          const missingDates = allDatesInRange.filter(
            (date) => !existingDates.has(date)
          );

          // Create placeholder records for missing dates
          const placeholderRecords = missingDates.map((date) => {
            // Find a sample record to get employee details
            const sampleRecord = formattedData[0];

            return {
              USRID: employeeId,
              Employee_Name: sampleRecord
                ? sampleRecord.Employee_Name
                : employeeInfo.name,
              DEPARTMENT: sampleRecord
                ? sampleRecord.DEPARTMENT
                : employeeInfo.department,
              PunchDate: date,
              InTime: "--",
              OutTime: "--",
              Actual_Working_Hours: "00:00",
              Status: "ABSENT",
              Manager_Name: sampleRecord
                ? sampleRecord.Manager_Name
                : employeeInfo.managerName,
              formattedDate: date,
              isSuperAdmin: isSuperAdmin,
              isManager: isManager,
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
          filtered = filtered.filter((record) => isMispunch(record));
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
          const placeholderRecords = allDatesInRange.map((date) => {
            return {
              USRID: employeeId,
              Employee_Name: employeeInfo.name,
              DEPARTMENT: employeeInfo.department,
              PunchDate: date,
              InTime: "--",
              OutTime: "--",
              Actual_Working_Hours: "00:00",
              Status: "ABSENT",
              Manager_Name: employeeInfo.managerName,
              formattedDate: date,
              isSuperAdmin: isSuperAdmin,
              isManager: isManager,
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
          const initialTimeInputs =
            initializeTimeFromDevice(placeholderRecords);
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
    // Reset filters
    setSelectedEmployee("-1");
    setSelectedManager("-1");
    setDateRange([startOfMonth(new Date()), endOfMonth(new Date())]);
    setShowMispunchesOnly(false);
    setIsFiltered(false);

    // Reset attendance data display
    if (attendanceData && attendanceData.length > 0) {
      const initialTimeInputs = initializeTimeFromDevice(attendanceData);
      setTimeInputs(initialTimeInputs);
      setFilteredData(attendanceData);
    }

    // Reset status and reason inputs
    setStatusInputs({});
    setReasonInputs({});

    // Clear expanded rows
    setExpandedRemarks({});

    // Reset current page
    setCurrentPage(1);

    // Clear selections
    clearSelections();

    console.log("All filters and inputs reset");
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
        extractedOut: outTime,
      });

      // Always copy device time values to input fields
      setTimeInputs((prev) => ({
        ...prev,
        [id]: {
          inTime: inTime,
          outTime: outTime,
          hours: calculateWorkingHours(inTime, outTime),
        },
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
    // Clear selections when changing pages
    clearSelections();
    // Scroll to top of table when changing pages
    const tableScrollContainer = document.querySelector(
      ".table-scroll-container"
    );
    if (tableScrollContainer) {
      tableScrollContainer.scrollTop = 0;
    }
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem("user");
    window.location.href = "/login";
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
    allUsers.forEach((u) => {
      userMap[u.USRID] = {
        ...u,
        name: u.name || u.NM || "Unknown", // Normalize name field
        hasManager: !!(
          u.Manager_Name &&
          u.Manager_Name.trim() !== "" &&
          u.Manager_Name !== "--" &&
          u.Manager_Name !== "null" &&
          u.Manager_Name !== "undefined"
        ),
        isSuperAdmin: u.Manager_Name === "SUPERADMIN",
        isManager: false, // Will be set later
        employees: [], // Will be populated later
      };
    });

    // Map to store managers and count of employees under each manager
    const managerCounts = {};

    // First pass: log all users and their managers
    console.log("\n----- USER-MANAGER RELATIONSHIPS -----");
    allUsers.forEach((user) => {
      const userName = user.name || user.NM || "Unknown";
      const managerName = user.Manager_Name || "NONE";

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
        const managerEntry = Object.values(userMap).find(
          (u) => u.name === managerName
        );

        if (managerEntry) {
          managerEntry.isManager = true;
          managerEntry.employees.push(user.USRID);
        } else {
          console.log(
            `WARNING: Manager "${managerName}" not found as a user in the system`
          );
        }
      }
    });

    // Second pass: validate the manager hierarchy
    console.log("\n----- MANAGER VALIDATION -----");
    const validManagers = [];
    const invalidManagers = [];
    const superAdmins = [];

    Object.values(userMap).forEach((user) => {
      // Check for SUPERADMIN designation
      if (user.isSuperAdmin) {
        superAdmins.push(user.name);
        console.log(`👑 SUPERADMIN identified: ${user.name} (${user.USRID})`);
      }

      if (user.isManager) {
        const isValidManager = true; // All managers are valid now as per the new design

        if (isValidManager) {
          validManagers.push(user.name);
          console.log(
            `✓ Valid manager: ${user.name} (${user.USRID}) - Has ${user.employees.length} employees`
          );
          console.log(
            `  Employees: ${user.employees
              .map((id) => (userMap[id] ? userMap[id].name : id))
              .join(", ")}`
          );
        } else {
          invalidManagers.push(user.name);
          console.log(
            `✗ Invalid manager: ${user.name} (${user.USRID}) - Has their own manager: ${user.Manager_Name}`
          );
        }
      }
    });

    console.log("\n----- SUMMARY -----");
    console.log(`Found ${superAdmins.length} SUPERADMINs`);
    console.log(`Found ${validManagers.length} valid managers`);
    console.log(`Found ${invalidManagers.length} invalid managers`);

    // Check specific employees mentioned by user
    console.log("\n----- SPECIFIC EMPLOYEE CHECK -----");
    ["Vibhu Sood", "Anuj Kumar", "Narayan Singh"].forEach((name) => {
      const employee = Object.values(userMap).find(
        (u) => u.name && u.name.includes(name)
      );
      if (employee) {
        console.log(`${employee.name} (${employee.USRID}):`);
        console.log(
          `  Has manager: ${employee.hasManager ? employee.Manager_Name : "No"}`
        );
        console.log(`  Is SUPERADMIN: ${employee.isSuperAdmin ? "Yes" : "No"}`);
        console.log(`  Is manager: ${employee.isManager ? "Yes" : "No"}`);
        if (employee.isManager) {
          console.log(
            `  Manages: ${employee.employees
              .map((id) => userMap[id]?.name || id)
              .join(", ")}`
          );
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
        .filter((u) => !u.hasManager && !u.isSuperAdmin)
        .map((u) => u.USRID),
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
        const adminCheckResponse = await axios.get(
          `${API_BASE_URL}/api/check-admin-status`,
          {
            params: { userId: user.id },
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        console.log("Admin check response:", adminCheckResponse.data);

        isSuperAdmin = adminCheckResponse.data.isSuperAdmin;
        isManager = adminCheckResponse.data.isManager;

        // Additional debug info
        const employeeCount = adminCheckResponse.data.employeeCount || 0;
        const managerName = adminCheckResponse.data.managerName || "None";

        console.log(`User ${user.name} is:
          - SUPERADMIN: ${isSuperAdmin ? "YES" : "NO"}
          - Manager: ${isManager ? "YES" : "NO"}
          - Manager Name: ${managerName}
          - Employee Count: ${employeeCount}
        `);
      } catch (error) {
        console.error("Failed to check admin status:", error);
        // Fallback to hardcoded admin IDs for backward compatibility
        isSuperAdmin = user.id === "2011090101" || user.id === "2013090101";
        console.log(
          `Fallback admin detection: ${isSuperAdmin ? "Is Admin" : "Not Admin"}`
        );
      }

      // Use the appropriate endpoint based on admin status
      const endpoint = isSuperAdmin
        ? `${API_BASE_URL}/api/admin-attendance`
        : `${API_BASE_URL}/api/attendance`;
      console.log(`Using endpoint: ${endpoint}`);

      // Fetch user's attendance data
      console.log(`Fetching attendance data for user ${user.id}...`);
      const response = await axios.get(endpoint, {
        params: { userId: user.id },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      console.log(response.data, "aaaaaaaaaaaaaaaaaaaa")

      // console.log(`Received ${response.data?.length || 0} attendance records`);

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
            console.log(
              `User ${i + 1}: ${allUsers[i].name || allUsers[i].NM || "Unknown"
              }, Manager: ${allUsers[i].Manager_Name || "None"}`
            );
          }

          // Analyze manager relationships
          console.log("Starting manager relationship analysis...");
          const managerAnalysis = analyzeManagerRelationships(allUsers);

          // Store manager information in local storage for future reference
          localStorage.setItem(
            "managerAnalysis",
            JSON.stringify(managerAnalysis)
          );

          // Update user status with new admin detection (with proper null checking)
          isSuperAdmin =
            user?.name && managerAnalysis.superAdmins
              ? managerAnalysis.superAdmins.includes(user.name)
              : false;

          // Check if current user is a manager (with proper null checking)
          isManager =
            user?.name && managerAnalysis.managers
              ? managerAnalysis.managers.includes(user.name)
              : false;

          console.log(`After analysis - User ${user?.name || "unknown"} is: 
            - SUPERADMIN: ${isSuperAdmin ? "YES" : "NO"}
            - Manager: ${isManager ? "YES" : "NO"}`);

          // If user is a manager, log their employees count
          if (isManager) {
            const employeeCount =
              managerAnalysis.managerCounts && user?.name
                ? managerAnalysis.managerCounts[user.name] || 0
                : 0;
            console.log(`Manager ${user.name} has ${employeeCount} employees`);

            // Log the employee names if available
            const employeesOfManager = allUsers.filter(
              (emp) => emp.Manager_Name === user.name
            );
            if (employeesOfManager.length > 0) {
              console.log("Employees of this manager:");
              employeesOfManager.forEach((emp, index) => {
                console.log(
                  `  ${index + 1}. ${emp.name || emp.NM || "Unknown"} (${emp.USRID
                  })`
                );
              });
            } else {
              console.log(
                "No employees found for this manager in the employee list"
              );
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
        let formattedData = response.data.map((record) => ({
          ...record,
          formattedDate: format(parseISO(record.PunchDate), "yyyy-MM-dd"),
          isSuperAdmin: isSuperAdmin,
          isManager: isManager,
        }));

        // For admin users or potential managers, add placeholders for managed employees
        if (allUsers.length > 0) {
          // Get manager analysis from local storage or use empty defaults
          const managerAnalysis = JSON.parse(
            localStorage.getItem("managerAnalysis")
          ) || { managers: [], superAdmins: [], managerCounts: {} };

          // Check if this user is a manager (has at least one employee)
          const isManager =
            managerAnalysis.managers && user?.name
              ? managerAnalysis.managers.includes(user.name)
              : false;

          // Find employees for this manager (where Manager_Name matches the user's name)
          const managedEmployees = allUsers.filter(
            (emp) =>
              emp.USRID !== user.id && // Not the user themselves
              emp.Manager_Name === user.name // Manager name matches user's name
          );

          console.log(
            `User ${user.name} ${isManager ? "is" : "is not"} a manager with ${managedEmployees.length
            } direct reports`
          );

          // For admins, add all employees as placeholders
          // For managers, add only their managed employees as placeholders
          const employeesToAdd = isSuperAdmin
            ? allUsers.filter((emp) => emp.USRID !== user.id)
            : managedEmployees;

          console.log(
            `Adding ${employeesToAdd.length} employees as placeholders`
          );

          // Get list of user IDs already in attendance data
          const existingUsers = new Set(
            formattedData.map((record) => record.USRID)
          );

          // Add placeholder records for employees who don't already have records
          employeesToAdd.forEach((emp) => {
            if (!existingUsers.has(emp.USRID)) {
              // Add a placeholder record for this employee
              formattedData.push({
                USRID: emp.USRID,
                Employee_Name: emp.name || emp.NM || "Unknown",
                DEPARTMENT: emp.DEPARTMENT || "",
                PunchDate: format(new Date(), "yyyy-MM-dd"),
                InTime: "--",
                OutTime: "--",
                Actual_Working_Hours: "00:00",
                Status: "ABSENT",
                Manager_Name: emp.Manager_Name || user.name,
                isSuperAdmin: isSuperAdmin,
                isManager: isManager,
                formattedDate: format(new Date(), "yyyy-MM-dd"),
                isPlaceholder: true,
              });
            }
          });
        }

        setAttendanceData(formattedData);

        // Extract unique months from data
        const months = [
          ...new Set(
            formattedData
              .filter((record) => !record.isPlaceholder) // Exclude placeholders for month ranges
              .map((record) => {
                const date = parseISO(record.PunchDate);
                return format(date, "yyyy-MM");
              })
          ),
        ].sort();

        // Create month ranges
        const ranges = months.map((monthStr) => {
          const [year, month] = monthStr.split("-").map(Number);
          const firstDay = new Date(year, month - 1, 1);
          const lastDay = endOfMonth(new Date(year, month - 1, 1));
          return {
            start: firstDay,
            end: lastDay,
            label: format(firstDay, "MMMM yyyy"),
          };
        });

        setAvailableMonthRanges(ranges);

        // Find current month range to set as default
        if (ranges.length > 0 && !dateRangeSetByUser.current) {
          const currentDate = new Date();
          const currentMonthStr = format(currentDate, "yyyy-MM");

          // Find the current month in available ranges, or default to most recent
          let defaultMonth = ranges[ranges.length - 1]; // Most recent as fallback

          for (const range of ranges) {
            const rangeMonthStr = format(range.start, "yyyy-MM");
            if (rangeMonthStr === currentMonthStr) {
              defaultMonth = range;
              break;
            }
          }

          // Set date range to current month
          setDateRange([defaultMonth.start, defaultMonth.end]);

          // Filter data to show only user's own data initially
          const filteredForMonth = formattedData.filter((record) => {
            // Only show user's own data initially
            if (record.USRID !== user.id) {
              return false;
            }

            // Check if date is within range and not a placeholder
            if (record.isPlaceholder) return false;

            const recordDate = parseISO(record.PunchDate);
            return isWithinInterval(recordDate, {
              start: defaultMonth.start,
              end: defaultMonth.end,
            });
          });

          setFilteredData(filteredForMonth);

          // If this is a manager or admin, set to self mode by default
          if (isSuperAdmin || isManager) {
            setSelectedEmployee("self");
          }
        } else {
          // Filter to show only the user's own data initially
          const filteredData = formattedData.filter(
            (record) => record.USRID === user.id && !record.isPlaceholder
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
      const response = await axios.get(
        `${API_BASE_URL}/api/check-button-status`,
        {
          params: { userId, date },
        }
      );

      // Create a unique key for this record
      const recordKey = `${userId}_${date}`;

      // Update the buttonStatus state
      setButtonStatus((prev) => ({
        ...prev,
        [recordKey]: response.data,
      }));

      return response.data;
    } catch (error) {
      console.error("Error fetching button status:", error);

      // Return default values that won't disable the buttons
      return {
        saveButtonDisabled: false,
        requestApprovalDisabled: false,
        error: error.message,
      };
    }
  };

  // =========== EFFECTS ===========
  // Fetch attendance data when user changes
  useEffect(() => {
    if (user) {
      fetchAttendanceData();

      // Log admin information for debugging
      if (user.id === "2011090101" || user.id === "2013090101") {
        console.log("Admin user detected:", user);
      }
    }
  }, [user]);

  // Effect to handle admin functionality when component loads
  useEffect(() => {
    if (user && (user.id === "2011090101" || user.id === "2013090101")) {
      console.log("Admin user detected, enabling admin functionality");
      // Default admin to self-mode when first loading
      setSelectedEmployee("self");
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

  // Auto-apply filter if attendance data for the current month is incomplete
  useEffect(() => {
    if (user && attendanceData && attendanceData.length > 0) {
      // Find current month range
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      const daysInMonth = end.getDate();

      // Count records for current month
      const recordsThisMonth = attendanceData.filter(record => {
        const d = parseISO(record.PunchDate);
        return d >= start && d <= end;
      });

      if (recordsThisMonth.length < daysInMonth) {
        // Not all days present, trigger filter to fill in placeholders
        handleFilter();
      }
    }
  }, [attendanceData, user]);

  // =========== CORE SAVE FUNCTIONALITY (KEPT UNCHANGED) ===========
  const HandleSave = async (index) => {
    const record = filteredData[index];
    const recordId = `${record.USRID}_${record.PunchDate}`;
    const timeInput = timeInputs[recordId] || {};
    const statusInput = statusInputs[index] || record.Status;
    const reasonInput = reasonInputs[index] || "";
    const DEPARTMENT = record.DEPARTMENT;
    const EmpDate = getCurrentSQLDateTime();

    // Added additional fields from the attendance record
    const HR_Mail = record.HR_Mail;
    const Manager_Name = record.Manager_Name;
    const Manager_Email = record.Manager_Email;
    const deviceInTime = record.InTime;
    const deviceOutTime = record.OutTime;

    // Check if required fields are present
    if (!record.USRID) {
      alert("User ID required.");
      return;
    }

    if (!timeInput.inTime || !timeInput.outTime) {
      alert(" In Time, and Out Time are all required.");
      return;
    }
    if (!record.PunchDate) {
      alert(" Date,  required.");
      return;
    }

    // Format the datetime values
    const formattedInTime = formatDateTime(record.PunchDate, timeInput.inTime);
    const formattedOutTime = formatDateTime(
      record.PunchDate,
      timeInput.outTime
    );

    // Get manager analysis from local storage
    const managerAnalysis = JSON.parse(
      localStorage.getItem("managerAnalysis")
    ) || { managers: [], superAdmins: [], managerCounts: {} };

    // Check if this is a SUPERADMIN
    const isSuperAdmin = managerAnalysis.superAdmins && user?.name
      ? managerAnalysis.superAdmins.includes(user.name)
      : user?.id === "2011090101" || user?.id === "2013090101"; // Fallback to hardcoded admin IDs

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
      // Set EmpReqShow to "Yes" to indicate it's ready for approval
      // For admin users, it can stay "No" since they can approve their own records
      EmpReqShow: isSuperAdmin && record.USRID === user.id ? "No" : "Yes",
      MailSend: "N",
      ManagerApproval: "Pending", // Note the spelling
      DEPARTMENT: DEPARTMENT ? DEPARTMENT.substring(0, 100) : null,
      EmpDate: EmpDate,
      // Add new fields with correct database column names
      HrManagerEmail: HR_Mail || null,
      ManagerName: Manager_Name || null,
      MEmail: Manager_Email || null,
      ActualPunch: deviceInTime || "--",
      LastPanch: deviceOutTime || "--",
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

      //  fetchAttendanceData(); // Refresh data
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
    try {
      setIsLoading(true);
      const record = filteredData[index];
      const recordId = `${record.USRID}_${record.PunchDate}`;
      const reasonInput = reasonInputs[index] || "";
      const ManagerDate = getCurrentSQLDateTime();

      // Get manager analysis from local storage
      const managerAnalysis = JSON.parse(
        localStorage.getItem("managerAnalysis")
      ) || { managers: [], superAdmins: [], managerCounts: {} };

      // Check if this is a SUPERADMIN
      const isSuperAdmin = managerAnalysis.superAdmins && user?.name
        ? managerAnalysis.superAdmins.includes(user.name)
        : user?.id === "2011090101" || user?.id === "2013090101"; // Fallback to hardcoded admin IDs

      // Different approval paths based on whether the record is for an admin or not
      if (isSuperAdmin && record.USRID === user.id) {
        // Admin approving their own record - Save and approve in one step
        console.log("Admin approving own record - combined save and approve", record.USRID, record.PunchDate);

        // First save the record
        const timeInput = timeInputs[recordId] || {};
        const statusInput = statusInputs[index] || record.Status;

        if (!timeInput.inTime || !timeInput.outTime) {
          alert("In Time and Out Time values are required before approval.");
          setIsLoading(false);
          return;
        }

        // Format the datetime values
        const formattedInTime = formatDateTime(record.PunchDate, timeInput.inTime);
        const formattedOutTime = formatDateTime(record.PunchDate, timeInput.outTime);

        // Prepare data for saving with direct approval
        const saveData = {
          USRID: record.USRID,
          Date: record.PunchDate,
          inTime: formattedInTime,
          OutTime: formattedOutTime,
          Status: statusInput,
          EmpReason: reasonInput.substring(0, 500),
          EmpReqShow: "No",
          MailSend: "Y", // Mark as sent
          ManagerApproval: "Approved", // Pre-approve
          DEPARTMENT: record.DEPARTMENT,
          EmpDate: ManagerDate,
          // Additional fields
          HrManagerEmail: record.HR_Mail || null,
          ManagerName: record.Manager_Name || null,
          MEmail: record.Manager_Email || null,
          ActualPunch: record.InTime || "--",
          LastPanch: record.OutTime || "--",
        };

        // Save with auto-approval
        const response = await axios.post(
          `${API_BASE_URL}/api/save-attendance`,
          saveData
        );

        alert("Attendance saved and approved successfully!");

        // Update saved records state
        setSavedRecords(prev => ({
          ...prev,
          [recordId]: true
        }));
      } else {
        // Regular approval flow for employee records
        // First check if the record exists and has 'Pending' approval status
        const checkResponse = await axios.get(
          `${API_BASE_URL}/api/check-approval-eligibility`,
          {
            params: { userId: record.USRID, date: record.PunchDate }
          }
        );

        if (!checkResponse.data.exists) {
          alert("This record must be saved first before it can be approved.");
          setIsLoading(false);
          return;
        }

        if (!checkResponse.data.eligibleForApproval) {
          alert(`This record cannot be approved. ${checkResponse.data.message}`);
          setIsLoading(false);
          return;
        }

        // Record is eligible for approval, proceed
        const approveData = {
          UserID: record.USRID,
          Date: record.PunchDate,
          EmpReqShow: "No",
          ManagerApproval: "Approved",
          MReason: reasonInput.substring(0, 500),
          ManagerDate: ManagerDate,
        };

        const response = await axios.post(
          `${API_BASE_URL}/api/approve-attendance`,
          approveData
        );

        alert("Attendance approved successfully!");
      }

      // Refresh data
      fetchAttendanceData();
    } catch (error) {
      console.error(
        "Error approving attendance:",
        error.response?.data || error.message
      );
      alert(
        `Error approving attendance: ${error.response?.data?.error || error.message
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Add this function to handle checkbox changes
  const handleCheckboxChange = (index, recordId) => {
    setSelectedRows(prev => ({
      ...prev,
      [recordId]: !prev[recordId]
    }));
  };

  // Update HandleApproveAll to implement proper approval flow
  const HandleApproveAll = async () => {
    try {
      // Filter only the selected records
      const selectedRecordIds = Object.keys(selectedRows).filter(id => selectedRows[id]);

      if (selectedRecordIds.length === 0) {
        alert("No records selected for approval. Please select at least one record.");
        return;
      }

      setIsLoading(true);
      const currentDateTime = getCurrentSQLDateTime();

      // Get manager analysis from local storage
      const managerAnalysis = JSON.parse(
        localStorage.getItem("managerAnalysis")
      ) || { managers: [], superAdmins: [], managerCounts: {} };

      // Check if this is a SUPERADMIN
      const isSuperAdmin = managerAnalysis.superAdmins && user?.name
        ? managerAnalysis.superAdmins.includes(user.name)
        : user?.id === "2011090101" || user?.id === "2013090101"; // Fallback to hardcoded admin IDs

      // Process each selected record
      const results = [];

      for (const recordId of selectedRecordIds) {
        // Extract the USRID and PunchDate from the recordId
        const [userId, punchDate] = recordId.split('_');

        // Find the record in the filteredData
        const recordIndex = filteredData.findIndex(
          record => record.USRID === userId && record.PunchDate === punchDate
        );

        if (recordIndex === -1) continue;

        const record = filteredData[recordIndex];
        const reasonInput = reasonInputs[recordIndex] || "";

        try {
          // Different approval paths based on whether the record is for an admin or not
          if (isSuperAdmin && userId === user.id) {
            // Admin approving their own record - Save and approve in one step
            console.log("Admin approving own record - combined save and approve", userId, punchDate);

            // First save the record
            const timeInput = timeInputs[recordId] || {};
            const statusInput = statusInputs[recordIndex] || record.Status;

            if (!timeInput.inTime || !timeInput.outTime) {
              results.push({
                userId,
                punchDate,
                success: false,
                error: "Missing in or out time values"
              });
              continue;
            }

            // Format the datetime values
            const formattedInTime = formatDateTime(punchDate, timeInput.inTime);
            const formattedOutTime = formatDateTime(punchDate, timeInput.outTime);

            // Prepare data for saving
            const saveData = {
              USRID: userId,
              Date: punchDate,
              inTime: formattedInTime,
              OutTime: formattedOutTime,
              Status: statusInput,
              EmpReason: reasonInput.substring(0, 500),
              EmpReqShow: "No",
              MailSend: "Y", // Mark as sent
              ManagerApproval: "Approved", // Pre-approve
              DEPARTMENT: record.DEPARTMENT,
              EmpDate: currentDateTime,
              // Additional fields
              HrManagerEmail: record.HR_Mail || null,
              ManagerName: record.Manager_Name || null,
              MEmail: record.Manager_Email || null,
              ActualPunch: record.InTime || "--",
              LastPanch: record.OutTime || "--",
            };

            // Save with auto-approval
            const saveResponse = await axios.post(
              `${API_BASE_URL}/api/save-attendance`,
              saveData
            );

            results.push({ userId, punchDate, success: true, message: "Saved and approved" });

            // Update saved records state
            setSavedRecords(prev => ({
              ...prev,
              [recordId]: true
            }));
          } else {
            // Manager approving employee records or admin approving other employees

            // First check if the record exists and has 'Pending' approval status
            const checkResponse = await axios.get(
              `${API_BASE_URL}/api/check-approval-eligibility`,
              {
                params: { userId, date: punchDate }
              }
            );

            if (!checkResponse.data.exists) {
              results.push({
                userId,
                punchDate,
                success: false,
                error: "Record not found in approval queue"
              });
              continue;
            }

            if (checkResponse.data.status !== "Pending") {
              results.push({
                userId,
                punchDate,
                success: false,
                error: `Record has status "${checkResponse.data.status}" and cannot be approved`
              });
              continue;
            }

            // Record exists and is pending, proceed with approval
            const approveData = {
              UserID: userId,
              Date: punchDate,
              EmpReqShow: "No",
              ManagerApproval: "Approved",
              MReason: reasonInput.substring(0, 500),
              ManagerDate: currentDateTime
            };

            const response = await axios.post(
              `${API_BASE_URL}/api/approve-attendance`,
              approveData
            );

            results.push({ userId, punchDate, success: true });
          }
        } catch (error) {
          console.error("Error processing record:", error);
          results.push({
            userId,
            punchDate,
            success: false,
            error: error.response?.data?.error || error.message
          });
        }
      }

      // Show result summary
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      if (failCount > 0) {
        // Create detailed error message for failures
        const errorDetails = results
          .filter(r => !r.success)
          .map(r => `• ${r.userId} (${r.punchDate}): ${r.error}`)
          .join("\n");

        alert(`Approval completed:\n- ${successCount} records approved successfully\n- ${failCount} records failed\n\nErrors:\n${errorDetails}`);
      } else {
        alert(`Success! ${successCount} records approved successfully.`);
      }

      // Clear selection
      setSelectedRows({});

      // Refresh data
      fetchAttendanceData();
    } catch (error) {
      console.error("Error in batch approval:", error);
      alert(`Error in batch approval: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Save All and Select All Fix
  // Add a new function to save all selected actionable rows
  const HandleSaveAll = async () => {
    const selectedRecordIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
    if (selectedRecordIds.length === 0) {
      alert("No records selected for saving. Please select at least one record.");
      return;
    }
    setIsLoading(true);
    let successCount = 0;
    let failCount = 0;
    for (const recordId of selectedRecordIds) {
      const [userId, punchDate] = recordId.split('_');
      const recordIndex = filteredData.findIndex(
        record => record.USRID === userId && record.PunchDate === punchDate
      );
      if (recordIndex === -1) continue;
      const record = filteredData[recordIndex];
      // Only save if not PRESENT
      if ((statusInputs[recordIndex] || record.Status) === "PRESENT") continue;
      try {
        await HandleSave(recordIndex);
        successCount++;
      } catch (e) {
        failCount++;
      }
    }
    setIsLoading(false);
    alert(`Save completed:\n- ${successCount} records saved successfully\n- ${failCount} records failed`);
    setSelectedRows({});
    fetchAttendanceData();
  };

  // Update handleSelectAllChange to only select actionable rows
  const handleSelectAllChange = () => {
    const currentPageIds = currentItems
      .filter(record => (statusInputs[currentItems.indexOf(record)] || record.Status) !== "PRESENT")
      .map(record => `${record.USRID}_${record.PunchDate}`);
    const allSelected = currentPageIds.every(id => selectedRows[id]);
    const newSelectedState = { ...selectedRows };
    currentPageIds.forEach(id => {
      newSelectedState[id] = !allSelected;
    });
    setSelectedRows(newSelectedState);
  };

  // 2. Remove Apply button in production and trigger filter automatically
  // (Assume process.env.NODE_ENV === 'production' for production check)
  // In the filters-section, hide Apply button in production
  // In DatePicker, trigger handleFilter automatically when both dates are selected
  // (Already in your code, but ensure setTimeout(() => handleFilter(), 100); is not commented out)

  // 3. Approved Row Highlighting & Device Time Overwrite
  // In the table row, overwrite device IN/OUT with regularized times if approved
  const getDeviceInTime = (record) => {
    const recordKey = `${record.USRID}_${record.PunchDate}`;
    if (buttonStatus[recordKey]?.record?.status &&
      buttonStatus[recordKey]?.record?.status.toLowerCase() === "approved") {
      // Use regularized times
      return timeInputs[recordKey]?.inTime || record.InTime || "--";
    }
    return record.InTime || "--";
  };
  const getDeviceOutTime = (record) => {
    const recordKey = `${record.USRID}_${record.PunchDate}`;
    if (buttonStatus[recordKey]?.record?.status &&
      buttonStatus[recordKey]?.record?.status.toLowerCase() === "approved") {
      // Use regularized times
      return timeInputs[recordKey]?.outTime || record.OutTime || "--";
    }
    return record.OutTime || "--";
  };

  // In the Action column, show 'Approved = Regularized' if approved
  const getActionCell = (record, index) => {
    const recordKey = `${record.USRID}_${record.PunchDate}`;
    if (buttonStatus[recordKey]?.record?.status &&
      buttonStatus[recordKey]?.record?.status.toLowerCase() === "approved") {
      return <span style={{ color: '#28a745', fontWeight: 600 }}>Approved = Regularized</span>;
    }
    // ...existing action buttons...
  };

  // In the table header/footer, show Save All for employees, Approve All for admin/superadmin
  // (Pseudo code, actual JSX update required)
  // {isAdminOrSuperAdmin ? <ApproveAllButton /> : <SaveAllButton />}
  // SaveAllButton triggers HandleSaveAll

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
    const managerAnalysis = JSON.parse(
      localStorage.getItem("managerAnalysis")
    ) || { managers: [], superAdmins: [], managerCounts: {} };

    // Check if current user is a SUPERADMIN or manager
    const isSuperAdmin =
      managerAnalysis.superAdmins && user.name
        ? managerAnalysis.superAdmins.includes(user.name)
        : false;

    const isManager =
      managerAnalysis.managers && user.name
        ? managerAnalysis.managers.includes(user.name)
        : false;

    console.log(
      `User ${user.name} (${user.id}) - isSuperAdmin: ${isSuperAdmin}, isManager: ${isManager}`
    );

    // For debugging
    if (isManager) {
      const employeeCount = managerAnalysis.managerCounts
        ? managerAnalysis.managerCounts[user.name] || 0
        : 0;
      console.log(
        `Manager ${user.name} has ${employeeCount} employees according to analysis`
      );
    }

    // Use the direct reports from manager analysis instead of scanning all attendance data
    if (isManager) {
      // Get the list of direct reports from the analysis
      const directReports = [];

      // First, find all employees in attendance data where Manager_Name matches current user
      attendanceData.forEach((record) => {
        if (
          record.USRID &&
          record.USRID !== user.id &&
          record.Employee_Name &&
          record.Manager_Name === user.name
        ) {
          if (!employeeMap.has(record.USRID)) {
            employeeMap.set(record.USRID, {
              id: record.USRID,
              name: record.Employee_Name,
              department: record.DEPARTMENT || "Unknown",
              managerName: record.Manager_Name,
            });
            directReports.push(record.USRID);
          }
        }
      });

      console.log(
        `Found ${directReports.length} direct reports in attendance data`
      );

      // If we didn't find all direct reports in attendance data, make a direct API call
      if (directReports.length === 0) {
        console.log(
          "No direct reports found in attendance data, making direct API call..."
        );
        fetchEmployeeList()
          .then((employees) => {
            if (employees && employees.length > 0) {
              console.log(
                `Fetched ${employees.length} employees from direct API call`
              );
            }
          })
          .catch((error) => {
            console.error("Error fetching employee list:", error);
          });
      }
    } else if (isSuperAdmin) {
      // For SUPERADMIN, add all employees except self
      attendanceData.forEach((record) => {
        if (record.USRID && record.USRID !== user.id && record.Employee_Name) {
          if (!employeeMap.has(record.USRID)) {
            employeeMap.set(record.USRID, {
              id: record.USRID,
              name: record.Employee_Name,
              department: record.DEPARTMENT || "Unknown",
              managerName: record.Manager_Name || "Unknown",
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
      id: "self",
      name: user ? `${user.name} (You)` : "Yourself",
      department: user ? user.department : "",
      managerName: "Self",
    });

    console.log(
      `Found ${employees.length} employees (including self) for user ${user.name}`
    );

    return employees;
  };

  // Function to fetch the full employee list directly
  const fetchEmployeeList = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/LOGIN`);

      if (response.data && response.data.length > 0) {
        const employees = response.data;
        console.log(
          "Fetched full employee list:",
          employees.length,
          "employees"
        );

        // Filter based on user role
        const managerAnalysis = JSON.parse(
          localStorage.getItem("managerAnalysis")
        ) || { managers: [], superAdmins: [], managerCounts: {} };

        const isSuperAdmin =
          managerAnalysis.superAdmins && user?.name
            ? managerAnalysis.superAdmins.includes(user.name)
            : false;

        const isManager =
          managerAnalysis.managers && user?.name
            ? managerAnalysis.managers.includes(user.name)
            : false;

        // Create employee map
        const employeeMap = new Map();

        // Log all Manager_Name values for debugging
        console.log("Examining Manager_Name values:");
        const managerNames = new Set();
        employees.forEach((emp) => {
          if (emp.Manager_Name) {
            managerNames.add(emp.Manager_Name);
          }
        });
        console.log("Unique Manager Names:", Array.from(managerNames));

        // Count direct reports
        let directReportCount = 0;

        // Process employees based on role
        employees.forEach((emp) => {
          if (emp.USRID === user.id) return; // Skip self

          // For managers, only include employees where Manager_Name exactly matches user's name
          if (isManager) {
            // Make sure to trim and do a case-insensitive comparison since database values may have inconsistencies
            const empManagerName = (emp.Manager_Name || "").trim();
            const currentUserName = (user.name || "").trim();

            const isDirectReport =
              empManagerName.toLowerCase() === currentUserName.toLowerCase();

            if (isDirectReport) {
              directReportCount++;
              console.log(
                `Direct Report: ${emp.name || emp.NM || "Unknown"} (${emp.USRID
                }), Manager: "${emp.Manager_Name}"`
              );

              employeeMap.set(emp.USRID, {
                id: emp.USRID,
                name: emp.name || emp.NM || "Unknown",
                department: emp.DEPARTMENT || "Unknown",
                managerName: emp.Manager_Name || "Unknown",
              });
            }
          } else if (isSuperAdmin) {
            // For SUPERADMIN, add all employees
            employeeMap.set(emp.USRID, {
              id: emp.USRID,
              name: emp.name || emp.NM || "Unknown",
              department: emp.DEPARTMENT || "Unknown",
              managerName: emp.Manager_Name || "Unknown",
            });
          }
        });

        console.log(`Found ${directReportCount} direct reports from API call`);

        // Add to attendanceData to ensure it's available for the dropdown
        const employeeRecords = Array.from(employeeMap.values());

        // Create placeholder attendance records for these employees
        const placeholders = employeeRecords.map((emp) => ({
          USRID: emp.id,
          Employee_Name: emp.name,
          DEPARTMENT: emp.department,
          PunchDate: format(new Date(), "yyyy-MM-dd"),
          InTime: "--",
          OutTime: "--",
          Actual_Working_Hours: "00:00",
          Status: "ABSENT",
          Manager_Name: emp.managerName,
          formattedDate: format(new Date(), "yyyy-MM-dd"),
          isPlaceholder: true,
        }));

        // Update attendanceData with these placeholders if not already present
        if (placeholders.length > 0) {
          setAttendanceData((prevData) => {
            const existingIds = new Set(prevData.map((record) => record.USRID));
            const newPlaceholders = placeholders.filter(
              (p) => !existingIds.has(p.USRID)
            );
            console.log(
              `Adding ${newPlaceholders.length} new placeholder records to attendanceData`
            );
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
        extractedOut: outTime,
      });

      manualInputs[index] = {
        inTime,
        outTime,
        hours: calculateWorkingHours(inTime, outTime),
      };
    });

    setTimeInputs(manualInputs);
  };

  // Function that gets unique managers from the attendance data
  const getUniqueManagers = () => {
    if (!attendanceData || attendanceData.length === 0) {
      return [];
    }

    const uniqueManagersMap = new Map();

    attendanceData.forEach((record) => {
      if (record.Manager_Name) {
        if (!uniqueManagersMap.has(record.Manager_Name)) {
          uniqueManagersMap.set(record.Manager_Name, {
            id: record.Manager_Name,
            name: record.Manager_Name,
          });
        }
      }
    });

    return Array.from(uniqueManagersMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  };

  // Get the unique managers list
  const uniqueManagers = getUniqueManagers();

  // Function to get current user's manager name
  const getCurrentUserManagerName = () => {
    if (!user) return "Not Assigned";

    // Check if the user has a manager assigned directly
    if (
      user.managerName &&
      user.managerName !== "--" &&
      user.managerName !== "null" &&
      user.managerName !== "undefined"
    ) {
      return user.managerName;
    }

    // Try to find the user in attendance data and get their manager
    const userRecord = attendanceData.find(
      (record) => record.USRID === user.id
    );
    if (
      userRecord &&
      userRecord.Manager_Name &&
      userRecord.Manager_Name !== "--" &&
      userRecord.Manager_Name !== "null" &&
      userRecord.Manager_Name !== "undefined"
    ) {
      return userRecord.Manager_Name;
    }

    // Get manager analysis from local storage
    const managerAnalysis = JSON.parse(
      localStorage.getItem("managerAnalysis")
    ) || { managers: [], superAdmins: [], managerCounts: {} };

    // Check if user is an admin or manager
    const isAdmin =
      managerAnalysis.superAdmins && user.name
        ? managerAnalysis.superAdmins.includes(user.name)
        : false;

    const isManager =
      managerAnalysis.managers && user.name
        ? managerAnalysis.managers.includes(user.name)
        : false;

    // For admin users, show "All Managers" or selected manager
    if (isAdmin) {
      if (selectedManager !== "-1") {
        const manager = uniqueManagers.find((m) => m.id === selectedManager);
        return manager ? manager.name : "All Managers";
      }
      return "All Managers";
    }

    // For managers, show their name
    if (isManager) {
      return user.name;
    }

    return "Not Assigned";
  };

  // Add clearSelections function
  const clearSelections = () => {
    setSelectedRows({});
  };

  const managerAnalysis = JSON.parse(localStorage.getItem("managerAnalysis")) || {};
  const isAdminOrSuperAdmin =
    (managerAnalysis.superAdmins && user?.name && managerAnalysis.superAdmins.includes(user.name)) ||
    user?.id === "2011090101" || user?.id === "2013090101";

  useEffect(() => {
    if (dateRange[0] && dateRange[1]) {
      handleFilter();
    }
  }, [dateRange]);

  return (
    <div className="attendance-container">
      <header className="attendance-header">
        <div className="header-content">
          <h1>Regularize Attendance</h1>
          <div className="header-actions">
            <button
              className="reset-all-btn"
              onClick={forceResetAllTimeInputs}
              title="Reset all regularized times to match device data"
            >
              <FaUndo /> Reset All Times
            </button>
            <button className="logout-btn" onClick={handleLogout}>
              <FaSignOutAlt /> Logout
            </button>
          </div>
        </div>
      </header>

      {isLoading && (
        <div className="loading-animation-container">
          <LinearProgress className="loading-progress" />
        </div>
      )}

      <div className="filters-section">
        <div className="filter-wrapper">
          <div className="filter-grid">
            {/* Manager Name Box (Static) */}
            <div className="filter-item manager-name-box">
              <div className="lead-owner-label">Manager Name</div>
              <div className="lead-owner-container">
                <div className="lead-owner-value">
                  <span>{getCurrentUserManagerName()}</span>
                </div>
              </div>
            </div>

            {/* Employee Select Box */}
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
                    const managerAnalysis = JSON.parse(
                      localStorage.getItem("managerAnalysis")
                    ) || { managers: [], superAdmins: [], managerCounts: {} };

                    // Check if user is an admin (with proper null checking)
                    const isAdmin =
                      managerAnalysis.superAdmins && user?.name
                        ? managerAnalysis.superAdmins.includes(user.name)
                        : false;

                    // Check if user is a manager (with proper null checking)
                    const isManager =
                      managerAnalysis.managers && user?.name
                        ? managerAnalysis.managers.includes(user.name)
                        : false;

                    if (isAdmin) {
                      // Options for admin users
                      return (
                        <>
                          <option value="-1">All Employees</option>
                          {uniqueEmployees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}{" "}
                              {emp.id === "self" ? "" : `(${emp.id})`}
                            </option>
                          ))}
                        </>
                      );
                    } else if (isManager) {
                      // Options for managers with team members
                      return (
                        <>
                          <option value="self">
                            {user ? `${user.name} (You)` : "Yourself"}
                          </option>
                          {uniqueEmployees
                            .filter((emp) => emp.id !== "self")
                            .map((emp) => (
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
                            {user ? user.name : "Yourself"}
                          </option>
                        </>
                      );
                    }
                  })()}
                </select>
                <label htmlFor="employee-select">
                  {(() => {
                    // Get manager analysis
                    const managerAnalysis = JSON.parse(
                      localStorage.getItem("managerAnalysis")
                    ) || { managers: [], superAdmins: [], managerCounts: {} };

                    // Check if user is an admin (with proper null checking)
                    const isAdmin =
                      managerAnalysis.superAdmins && user?.name
                        ? managerAnalysis.superAdmins.includes(user.name)
                        : false;

                    // Check if user is a manager (with proper null checking)
                    const isManager =
                      managerAnalysis.managers && user?.name
                        ? managerAnalysis.managers.includes(user.name)
                        : false;

                    // Get employee count
                    const employeeCount =
                      isManager && user?.name && managerAnalysis.managerCounts
                        ? managerAnalysis.managerCounts[user.name] || 0
                        : 0;

                    if (isAdmin) {
                      return "Employee Name";
                    } else if (isManager) {
                      return `Team Members (${employeeCount})`;
                    } else {
                      return "Your Attendance";
                    }
                  })()}
                </label>
              </div>
            </div>

            <div className="filter-item date-range-picker">
              <div
                className="date-picker-wrapper"
                onClick={handleDatePickerClick}
              >
                <FaCalendarAlt className="icon" />
                <span>
                  {dateRange[0]
                    ? format(dateRange[0], "MMM dd, yyyy")
                    : "Start"}{" "}
                  -{dateRange[1] ? format(dateRange[1], "MMM dd, yyyy") : "End"}
                </span>
                <DatePicker
                  ref={datePickerRef}
                  selectsRange={true}
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(update) => {
                    setDateRange(update);
                    // No auto-filtering here
                  }}
                  monthsShown={1}
                  className="hidden-date-picker"
                  highlightDates={availableMonthRanges.map((range) => ({
                    start: range.start,
                    end: range.end,
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
                        offset: [0, 5],
                      },
                    },
                    {
                      name: "preventOverflow",
                      options: {
                        rootBoundary: "viewport",
                        padding: 8,
                      },
                    },
                  ]}
                  popperPlacement="bottom-start"
                  onMonthChange={() => {
                    // Do nothing here! Just let the calendar view update.
                  }}
                />
              </div>
            </div>

            <div className="filter-item checkbox-group">
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
              {/* Hide Apply button in production */}
              {process.env.NODE_ENV !== "production" && (
                <button
                  className="filter-btn action-button"
                  onClick={handleFilter}
                >
                  <FaFilter /> Apply
                </button>
              )}
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
                <th colSpan="7" className="device-header">
                  Devices
                </th>
                <th colSpan="7" className="regularized-header">
                  Regularized
                </th>
              </tr>
              <tr>
                <th className="col-select">
                  <input
                    type="checkbox"
                    className="select-all-checkbox"
                    checked={currentItems.length > 0 && currentItems.every(record =>
                      selectedRows[`${record.USRID}_${record.PunchDate}`]
                    )}
                    onChange={handleSelectAllChange}
                    title="Select All on Current Page"
                  />
                </th>
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
                <tr
                  key={index}
                  style={getRowStyle(record)}
                  className={selectedRows[`${record.USRID}_${record.PunchDate}`] ? 'selected-row' : ''}
                >
                  <td>
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      checked={selectedRows[`${record.USRID}_${record.PunchDate}`] || false}
                      onChange={() => handleCheckboxChange(index, `${record.USRID}_${record.PunchDate}`)}
                    />
                  </td>
                  <td>{record.USRID}</td>
                  <td>{record.Employee_Name}</td>
                  <td>{record.DEPARTMENT}</td>
                  <td>{record.PunchDate}</td>
                  <td>{getDeviceInTime(record)}</td>
                  <td>{getDeviceOutTime(record)}</td>
                  <td>{record.Actual_Working_Hours || "00:00"}</td>
                  <td className="settime">
                    <div className="time-input-container">
                      <input
                        type="time"
                        value={
                          timeInputs[`${record.USRID}_${record.PunchDate}`]
                            ?.inTime || ""
                        }
                        onChange={(e) =>
                          handleTimeChange(
                            `${record.USRID}_${record.PunchDate}`,
                            "inTime",
                            e.target.value
                          )
                        }
                        className="time-input"
                      />
                      <button
                        className="reset-time-btn"
                        title="Reset to device time"
                        onClick={() =>
                          resetTimeToDeviceData(
                            `${record.USRID}_${record.PunchDate}`,
                            record
                          )
                        }
                      >
                        <FaUndo className="reset-icon" />
                      </button>
                    </div>
                  </td>
                  <td className="settime">
                    <div className="time-input-container">
                      <input
                        type="time"
                        value={
                          timeInputs[`${record.USRID}_${record.PunchDate}`]
                            ?.outTime || ""
                        }
                        onChange={(e) =>
                          handleTimeChange(
                            `${record.USRID}_${record.PunchDate}`,
                            "outTime",
                            e.target.value
                          )
                        }
                        className="time-input"
                      />
                    </div>
                  </td>
                  <td>
                    {calculateWorkingHours(
                      timeInputs[`${record.USRID}_${record.PunchDate}`]
                        ?.inTime || "",
                      timeInputs[`${record.USRID}_${record.PunchDate}`]
                        ?.outTime || ""
                    )}
                  </td>
                  <td>
                    <select
                      value={statusInputs[index] || record.Status}
                      onChange={(e) =>
                        handleStatusChange(index, e.target.value)
                      }
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
                          onClick={() =>
                            handleRemarksClick(index, reasonInputs[index])
                          }
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
                        buttonStatus[`${record.USRID}_${record.PunchDate}`]
                          ?.saveButtonDisabled
                      }
                      className="action-btn save-btn"
                    >
                      <FaRegSave className="btn-icon" />
                    </button>

                    {/* Show approve button only for admin users */}
                    {((user &&
                      (user.id === "2011090101" || user.id === "2013090101")) ||
                      (record.Manager_Name &&
                        (record.Manager_Name === "Admin" ||
                          record.Manager_Name === "SuperAdmin"))) && (
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
                  {Object.values(selectedRows).filter(Boolean).length > 0 ? (
                    <>
                      Approve Selected
                      <span className="selected-count">
                        {Object.values(selectedRows).filter(Boolean).length}
                      </span>:
                    </>
                  ) : (
                    "Approve All:"
                  )}
                </td>
                <td>
                  {/* Show 'Approve All' button only for admin users */}
                  {isAdminOrSuperAdmin ? (
                    <button
                      onClick={HandleApproveAll}
                      title={Object.values(selectedRows).filter(Boolean).length > 0
                        ? `Approve ${Object.values(selectedRows).filter(Boolean).length} Selected Records`
                        : "Approve All"}
                      className="approve-all-btn"
                    >
                      {Object.values(selectedRows).filter(Boolean).length > 0
                        ? `Approve Selected`
                        : `Approve All`} <FaThumbsUp className="btn-icon" />
                    </button>
                  ) : (
                    // Show 'Save All' button for employees
                    <button
                      onClick={HandleSaveAll}
                      title="Save All Selected Records"
                      className="approve-all-btn"
                    >
                      Save All <FaRegSave className="btn-icon" />
                    </button>
                  )}
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
              <button
                className="remarks-popup-close"
                onClick={handlePopupClose}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <textarea
              value={popupRemarks.value}
              onChange={(e) => {
                if (e.target.value.length <= MAX_CHARS) {
                  setPopupRemarks((prev) => ({
                    ...prev,
                    value: e.target.value,
                  }));
                }
              }}
              placeholder="Enter remarks..."
              maxLength={MAX_CHARS}
            />
            <div className="remarks-popup-footer">
              <div
                className={`character-counter ${popupRemarks.value.length >= MAX_CHARS ? "warning" : ""
                  }`}
              >
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
