const sql = require("mssql");

const dbConfig = {
  user: "sa", // Replace with your DB username
  password: "neerajll", // Replace with your DB password
  server: "DESKTOP-OAA5O5H", // Example: "localhost" or "127.0.0.1"
  database: "BioStar2_ac", // The restored database name
  port: parseInt(process.env.DB_PORT, 10) || 1433, // Ensure port is defined
  options: {
    encrypt: false, // Set to true if using Azure
    trustServerCertificate: true, // Required for self-signed certificates
  },
};

async function connectDB() {
  try {
    const pool = await sql.connect(dbConfig);
    console.log("Connected to SQL Server successfully!");
    return pool;
  } catch (err) {
    console.error("Database connection failed!", err);
  }
}

module.exports = { connectDB, sql };
