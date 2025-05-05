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

  return formatted// Output: '2025-05-05 20:00:00.000' (if IST)
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
console.log(sqlDateTime)