const sql = require("mssql");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Validate required environment variables
const requiredEnvVars = ['DB_SERVER', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Current environment variables:', process.env);
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT),
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

const connectDB = async () => {
  try {
    console.log('Attempting to connect to database with config:', {
      server: config.server,
      database: config.database,
      port: config.port,
      user: config.user
    });
    
    await sql.connect(config);
    console.log("✅ Database connected successfully!");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    throw error;
  }
};

module.exports = { connectDB, sql };
