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
    const savedUser = localStorage.getItem("user");
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Time input states
  const [timeInputs, setTimeInputs] = useState({});
  const [expandedRemarks, setExpandedRemarks] = useState({});
  const MAX_CHARS = 40;

  // Add popupRemarks state
  const [popupRemarks, setPopupRemarks] = useState({
    show: false,
    index: null,
    value: "",
  });

  const [dateRange, setDateRange] = useState([
    startOfMonth(new Date()),
    endOfMonth(new Date()),
  ]);
  const [startDate, endDate] = dateRange;
  const datePickerRef = useRef(null);

  // Optimize the first useEffect to make sure we're not repeating logic
  useEffect(() => {
    if (!attendanceData || attendanceData.length === 0) return;

    // Apply all filters (date + employee + mispunch) in a single function
    let filtered = [...attendanceData];

    // Date range filter (if date is selected)
    if (dateRange[0]) {
      filtered = filtered.filter((record) => {
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

    // Employee filter
    if (user) {
      filtered = filtered.filter((record) => record.USRID === user.id);
    } else if (selectedEmployee !== "-1") {
      filtered = filtered.filter((record) => record.USRID === selectedEmployee);
    }

    // Mispunch filter
    if (showMispunchesOnly) {
      filtered = filtered.filter((record) => isMispunch(record));
    }

    setFilteredData(filtered);

    // Set isFiltered to true if any filter is active
    const hasActiveFilter =
      selectedEmployee !== "-1" || showMispunchesOnly || dateRange[0] !== null;

    setIsFiltered(hasActiveFilter);
  }, [dateRange, selectedEmployee, showMispunchesOnly, attendanceData, user]);

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

  // Improve the isMispunch function to properly detect missing punch times
  const isMispunch = (record) => {
    // First check for undefined or null values
    if (!record) return false;

    // Check for InTime and OutTime properties
    const missingInTime =
      !record.InTime || record.InTime === "" || record.InTime === "--";
    const missingOutTime =
      !record.OutTime || record.OutTime === "" || record.OutTime === "--";

    // Also check FirstPunch and LastPunch in case the API returns these
    const missingFirstPunch =
      record.FirstPunch &&
      (record.FirstPunch === "" || record.FirstPunch === "--");
    const missingLastPunch =
      record.LastPunch &&
      (record.LastPunch === "" || record.LastPunch === "--");

    return (
      missingInTime || missingOutTime || missingFirstPunch || missingLastPunch
    );
  };

  // Fix the handleMispunchFilterChange function to work directly with state
  const handleMispunchFilterChange = (e) => {
    const isChecked = e.target.checked;
    setShowMispunchesOnly(isChecked);

    // Get currently filtered data based on date range and employee
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

    // Apply employee filter
    if (user) {
      baseData = baseData.filter((record) => record.USRID === user.id);
    } else if (selectedEmployee !== "-1") {
      baseData = baseData.filter((record) => record.USRID === selectedEmployee);
    }

    // Apply mispunches filter if checked
    if (isChecked) {
      baseData = baseData.filter((record) => isMispunch(record));
    }

    setFilteredData(baseData);
    setIsFiltered(
      isChecked || selectedEmployee !== "-1" || dateRange[0] !== null
    );
  };

  // Add a function to fetch button status
  const fetchButtonStatus = async (userId, date) => {
    try {
      console.log(`Fetching button status for ${userId} - ${date}`);
      const response = await axios.get(
        `${API_BASE_URL}/api/check-button-status`,
        {
          params: { userId, date },
        }
      );

      // Create a unique key for this record
      const recordKey = `${userId}_${date}`;

      // Log the response for debugging
      console.log(`Button status response for ${recordKey}:`, response.data);

      // Update the buttonStatus state
      setButtonStatus((prev) => ({
        ...prev,
        [recordKey]: response.data,
      }));

      return response.data;
    } catch (error) {
      console.error("Error fetching button status:", error);

      // If it's an axios error with a response, log more details
      if (error.response) {
        console.error("Error response data:", error.response.data);
        console.error("Error response status:", error.response.status);
      }

      // Return default values that won't disable the buttons
      return {
        saveButtonDisabled: false,
        requestApprovalDisabled: false,
        error: error.message,
      };
    }
  };

  // Simplified and optimized fetchAttendanceData function
  const fetchAttendanceData = async () => {
    setIsLoading(true);
    try {
      // Only proceed if we have a user
      if (!user || !user.id) {
        console.log("No user found, cannot fetch attendance data");
        setFilteredData([]);
        setAttendanceData([]);
        setIsLoading(false);
        return;
      }

      console.log(`Fetching attendance data for user: ${user.id}`);

      // Pass the user ID as a query parameter to filter on the server side
      const response = await axios.get(`${API_BASE_URL}/api/attendance`, {
        params: { userId: user.id },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.data && response.data.length > 0) {
        const formattedData = response.data.map((record) => ({
          ...record,
          formattedDate: format(parseISO(record.PunchDate), "yyyy-MM-dd"),
        }));

        console.log(
          `Loaded ${formattedData.length} records for user ${user.id}`
        );

        setAttendanceData(formattedData);

        // Extract unique months from data
        const months = [
          ...new Set(
            formattedData.map((record) => {
              const date = parseISO(record.PunchDate);
              return format(date, "yyyy-MM");
            })
          ),
        ].sort();

        // Create month ranges
        const ranges = months.map((monthStr) => {
          const [year, month] = monthStr.split("-").map(Number);
          const firstDay = new Date(year, month - 1, 1);
          const lastDay = new Date(year, month, 0);
          return {
            start: firstDay,
            end: lastDay,
            label: format(firstDay, "MMMM yyyy"),
          };
        });

        setAvailableMonthRanges(ranges);

        // Set default date range to most recent month and filter data
        if (ranges.length > 0) {
          const mostRecentMonth = ranges[ranges.length - 1];
          setDateRange([mostRecentMonth.start, mostRecentMonth.end]);

          const filteredForMonth = formattedData.filter((record) => {
            const recordDate = parseISO(record.PunchDate);
            return isWithinInterval(recordDate, {
              start: mostRecentMonth.start,
              end: mostRecentMonth.end,
            });
          });

          setFilteredData(filteredForMonth);
        } else {
          setFilteredData(formattedData);
        }
      } else {
        console.log("No attendance data found for user");
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

  //SAVING ROUTE
  const HandleSave = async (index) => {
    const record = filteredData[index];
    const timeInput = timeInputs[index] || {};
    const statusInput = statusInputs[index] || record.Status;
    const reasonInput = reasonInputs[index] || "";
    const DEPARTMENT = record.DEPARTMENT;
    const EmpDate = sqlDateTime;

    // Check if required fields are present
    if (
      !record.USRID ||
      !record.PunchDate ||
      !timeInput.inTime ||
      !timeInput.outTime
    ) {
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
        `Error saving attendance: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  };

  const HandleApprove = async (index) => {
    const record = filteredData[index];
    const approveData = {
      // Use UserID (not USRID) to match server column name
      UserID: record.USRID,
      // Use Date (not PunchDate) to match server column name
      Date: record.PunchDate,
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

  // Update handleReset to use the applyFilters function with reset parameters
  const handleReset = () => {
    setSelectedEmployee("-1");
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
      const filtered = attendanceData.filter((record) => {
        const recordDate = parseISO(record.PunchDate);
        return isWithinInterval(recordDate, {
          start: currentMonth.start,
          end: currentMonth.end,
        });
      });

      setFilteredData(filtered);
    } else {
      // If no months available, just show all data
      setFilteredData(attendanceData);
    }

    setIsFiltered(false);
  };

  // Function to calculate row background color based on status
  const getRowStyle = (record) => {
    switch (record.Status) {
      case "MIS PUNCH":
        return { backgroundColor: "rgba(210, 236, 17, 0.8)" }; // Dark gray
      case "HALF DAY":
        return { backgroundColor: "rgba(255, 193, 7, 0.2)" }; // Orange
      case "PRESENT":
        return { backgroundColor: "rgba(40, 167, 69, 0.2)" }; // Green
      case "ABSENT":
        return { backgroundColor: "rgba(220, 53, 69, 0.2)" }; // Darker gray
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
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Add pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    // Scroll to top of table when changing pages
    const tableContainer = document.querySelector(".table-container");
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
      value: currentValue || "",
    });
  };

  const handlePopupClose = () => {
    setPopupRemarks({ show: false, index: null, value: "" });
  };

  const handlePopupSave = () => {
    if (popupRemarks.index !== null) {
      handleReasonChange(popupRemarks.index, popupRemarks.value);
    }
    handlePopupClose();
  };

  const [buttonStatus, setButtonStatus] = useState({}); // Add state for button status

  const handleDatePickerClick = () => {
    if (datePickerRef.current) {
      datePickerRef.current.setOpen(true);
    }
  };

  // Add state for available month ranges
  const [availableMonthRanges, setAvailableMonthRanges] = useState([]);

  // Update the helper function to apply filters when a month is selected
  const selectMonthRange = (e) => {
    const monthIndex = parseInt(e.target.value);
    if (
      isNaN(monthIndex) ||
      monthIndex < 0 ||
      monthIndex >= availableMonthRanges.length
    )
      return;

    const selectedRange = availableMonthRanges[monthIndex];
    const newDateRange = [selectedRange.start, selectedRange.end];

    // Set the date range
    setDateRange(newDateRange);

    // Filter data for selected month
    let filtered = attendanceData.filter((record) => {
      const recordDate = parseISO(record.PunchDate);
      return isWithinInterval(recordDate, {
        start: selectedRange.start,
        end: selectedRange.end,
      });
    });

    // Apply other active filters
    if (user) {
      filtered = filtered.filter((record) => record.USRID === user.id);
    } else if (selectedEmployee !== "-1") {
      filtered = filtered.filter((record) => record.USRID === selectedEmployee);
    }

    if (showMispunchesOnly) {
      filtered = filtered.filter((record) => isMispunch(record));
    }

    setFilteredData(filtered);
    setIsFiltered(true);
  };

  // Make sure the filter functions integrate both date range and mispunches filter
  const applyFilters = (data, options = {}) => {
    const {
      employee = selectedEmployee,
      dateRange = [startDate, endDate],
      showMispunches = showMispunchesOnly,
    } = options;

    let filtered = [...data];

    // Apply date range filter if both dates are set
    if (dateRange[0] && dateRange[1]) {
      filtered = filtered.filter((record) => {
        const recordDate = parseISO(record.PunchDate);
        return isWithinInterval(recordDate, {
          start: dateRange[0],
          end: dateRange[1],
        });
      });
    }

    // Apply employee filter if selected
    if (employee !== "-1" && employee) {
      filtered = filtered.filter((record) => record.USRID === employee);
    }

    // Apply mispunches filter if enabled
    if (showMispunches) {
      filtered = filtered.filter((record) => isMispunch(record));
    }

    return filtered;
  };

  // Add the handleFilter function back, but simplified to use the existing state
  const handleFilter = () => {
    if (!attendanceData || attendanceData.length === 0) return;

    // Simply trigger a filtering based on current filter state values
    // This is just a manual trigger for the same filtering that useEffect handles
    let filtered = [...attendanceData];

    // Date range filter
    if (dateRange[0]) {
      filtered = filtered.filter((record) => {
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

    // Employee filter
    if (user) {
      filtered = filtered.filter((record) => record.USRID === user.id);
    } else if (selectedEmployee !== "-1") {
      filtered = filtered.filter((record) => record.USRID === selectedEmployee);
    }

    // Mispunch filter
    if (showMispunchesOnly) {
      filtered = filtered.filter((record) => isMispunch(record));
    }

    setFilteredData(filtered);
    setIsFiltered(true);
  };

  return (
    <div className="attendance-container">
      <header className="attendance-header">
        <div className="header-content">
          <h1>Regularize Attendance</h1>
          <button className="logout-btn" onClick={handleLogout}>
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </header>

      {isLoading && (
        <div className="loading-message">
          <i className="fas fa-spinner fa-spin"></i> Data is loading, please
          wait...
        </div>
      )}

      <div className="filters-section">
        <div className="filter-wrapper">
          <div className="filter-header">
            <h3>
              <FaFilter /> Filter Options
            </h3>
            <button className="reset-btn action-button" onClick={handleReset}>
              <FaUndo /> Reset
            </button>
          </div>

          <div className="filter-grid">
            <div className="filter-item employee-select">
              <label>Manager Name</label>
              <div className="select-container">
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="filter-select"
                >
                  <option value="-1">All Managers</option>
                  {uniqueEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="filter-item date-range-picker">
              <label>Date Range</label>
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
                  }}
                  monthsShown={2}
                  className="hidden-date-picker"
                  highlightDates={availableMonthRanges.map((range) => ({
                    start: range.start,
                    end: range.end,
                  }))}
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
              <label>&nbsp;</label>
              <button
                className="filter-btn action-button"
                onClick={handleFilter}
              >
                <FaFilter /> Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="attendance-table">
          <thead>
            <tr>
              <th colSpan="7">Devices</th>
              <th colSpan="7">Regularized</th>
            </tr>
            <tr>
              <th width="2%">Select</th>
              <th width="7%">Poornata ID</th>
              <th width="9%">Name</th>
              <th width="7%">Department</th>
              <th width="5%">Date</th>
              <th width="5%">IN</th>
              <th width="5%">OUT</th>
              <th width="4%">Hours</th>
              <th className="settimeE" width="6%">
                IN
              </th>
              <th className="settimeE" width="6%">
                OUT
              </th>
              <th width="5%">Hours</th>
              <th width="7%">Status</th>
              <th width="7%">Remarks</th>
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
                className={`character-counter ${
                  popupRemarks.value.length >= MAX_CHARS ? "warning" : ""
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
