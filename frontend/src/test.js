import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  format,
  parseISO,
  addMonths,
  isBefore,
  isAfter,
  isEqual,
} from "date-fns";

const API_BASE_URL = "https://your-api-url.com"; // Replace with your API

// Utility: Generate salary periods like "March 17 - April 16"
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

const AttendanceComponent = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [monthRanges, setMonthRanges] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");

  // Your existing fetch function (unchanged)
  const fetchAttendanceData = async () => {
    try {
      console.log("Fetching from:", API_BASE_URL);
      const response = await axios.get(`${API_BASE_URL}/api/test-db`);
      setAttendanceData(response.data);
      setFilteredData(response.data);
      console.log(response.data);
    } catch (error) {
      console.error("Error fetching attendance data:", error);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
  }, []);

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

  return (
    <div className="column">
      <label>
        Month:
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          {monthRanges.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginTop: "20px" }}>
        <h3>Filtered Attendance Data:</h3>
        <table border="1" cellPadding="8">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Punch Date</th>
              <th>Status</th>
              <th>In Time</th>
              <th>Out Time</th>
              <th>Working Hours</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((entry, index) => (
              <tr key={index}>
                <td>{entry.Employee_Name}</td>
                <td>{entry.PunchDate}</td>
                <td>{entry.Status}</td>
                <td>{entry.InTime}</td>
                <td>{entry.OutTime}</td>
                <td>{entry.Actual_Working_Hours}</td>
              </tr>
            ))}
            {filteredData.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: "center" }}>
                  No data for selected period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendanceComponent;
