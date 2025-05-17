-- SQL Script to add new columns to T_EmpReq table for attendance data

-- Check if HrManagerEmail column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_EmpReq' AND COLUMN_NAME = 'HrManagerEmail')
BEGIN
    ALTER TABLE T_EmpReq ADD HrManagerEmail VARCHAR(100) NULL;
    PRINT 'Added HrManagerEmail column to T_EmpReq table';
END
ELSE
BEGIN
    PRINT 'HrManagerEmail column already exists in T_EmpReq table';
END

-- Check if ManagerName column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_EmpReq' AND COLUMN_NAME = 'ManagerName')
BEGIN
    ALTER TABLE T_EmpReq ADD ManagerName VARCHAR(100) NULL;
    PRINT 'Added ManagerName column to T_EmpReq table';
END
ELSE
BEGIN
    PRINT 'ManagerName column already exists in T_EmpReq table';
END

-- Check if MEmail column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_EmpReq' AND COLUMN_NAME = 'MEmail')
BEGIN
    ALTER TABLE T_EmpReq ADD MEmail VARCHAR(100) NULL;
    PRINT 'Added MEmail column to T_EmpReq table';
END
ELSE
BEGIN
    PRINT 'MEmail column already exists in T_EmpReq table';
END

-- Check if ActualPunch column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_EmpReq' AND COLUMN_NAME = 'ActualPunch')
BEGIN
    ALTER TABLE T_EmpReq ADD ActualPunch VARCHAR(50) NULL;
    PRINT 'Added ActualPunch column to T_EmpReq table';
END
ELSE
BEGIN
    PRINT 'ActualPunch column already exists in T_EmpReq table';
END

-- Check if LastPanch column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_EmpReq' AND COLUMN_NAME = 'LastPanch')
BEGIN
    ALTER TABLE T_EmpReq ADD LastPanch VARCHAR(50) NULL;
    PRINT 'Added LastPanch column to T_EmpReq table';
END
ELSE
BEGIN
    PRINT 'LastPanch column already exists in T_EmpReq table';
END

PRINT 'Database update completed successfully'; 