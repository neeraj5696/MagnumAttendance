WITH Punches AS (
    SELECT USRID,
            FORMAT(SRVDT, 'yyyy-MM-dd') AS PunchDate,  -- Only Date
           FORMAT(SRVDT, 'HH:mm:ss') AS PunchTime,    -- Only Time
           DEVUID
    FROM BioStar2_ac.dbo.T_LG202502
    WHERE DEVUID IN (547239461, 939342251, 546203817, 538167579, 541654478, 538210081, 788932322, 111111111)
),
FirstLastPunch AS (
    SELECT USRID, PunchDate,
           MIN(CASE WHEN DEVUID IN (547239461, 939342251, 546203817, 538167579) THEN PunchTime END) AS InTime,
           MAX(CASE WHEN DEVUID IN (541654478, 538210081, 788932322, 111111111) THEN PunchTime END) AS OutTime
    FROM Punches
    GROUP BY USRID, PunchDate
),
TimeInnings AS (
    SELECT USRID, PunchDate, PunchTime,
           LEAD(PunchTime) OVER (PARTITION BY USRID, PunchDate ORDER BY PunchTime) AS NextPunch,
           CASE
               WHEN (ROW_NUMBER() OVER (PARTITION BY USRID, PunchDate ORDER BY PunchTime) % 2) = 1
               THEN DATEDIFF(SECOND, PunchTime, LEAD(PunchTime) OVER (PARTITION BY USRID, PunchDate ORDER BY PunchTime))
               ELSE NULL
           END AS InTimeInnings
    FROM Punches
),
UserDetails AS (
    SELECT 
        u.USRID,
        u.NM AS Employee_Name,
        u.USRUID,
        u.DEPARTMENT,
        u.TITLE,
        f5.VAL AS HR_Mail,
        f6.VAL AS Manager_Name,
        f7.VAL AS Manager_Email 
    FROM BioStar2_ac.dbo.T_USR u
    LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f5 ON u.USRUID = f5.USRUID AND f5.CUSFLDUID = 5
    LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f6 ON u.USRUID = f6.USRUID AND f6.CUSFLDUID = 6
    LEFT JOIN BioStar2_ac.dbo.T_USRCUSFLD f7 ON u.USRUID = f7.USRUID AND f7.CUSFLDUID = 7
    WHERE u.NM IS NOT NULL
)
SELECT 
    FLP.USRID,
    ud.Employee_Name,
    ud.DEPARTMENT,
    ud.TITLE,
    FLP.PunchDate,
    COALESCE(FLP.InTime, '--') AS InTime,
    COALESCE(FLP.OutTime, '--') AS OutTime,
    FORMAT(DATEADD(SECOND, COALESCE(SUM(TI.InTimeInnings), 0), 0), 'HH:mm:ss') AS Total_InTime,
    FORMAT(DATEADD(SECOND, COALESCE(DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) - SUM(TI.InTimeInnings), 0), 0), 'HH:mm:ss') AS Total_OutTime,
    FORMAT(DATEADD(SECOND, COALESCE(DATEDIFF(SECOND, FLP.InTime, FLP.OutTime), 0), 0), 'HH:mm:ss') AS Actual_Working_Hours,
    CASE
        WHEN FLP.InTime IS NULL THEN 'ABSENT'
        WHEN DATEDIFF(SECOND, FLP.InTime, FLP.OutTime) <= 5 * 3600 THEN 'HALF DAY'  -- Less than 5 hours
        ELSE 'PRESENT'
    END AS Status,
    ud.Manager_Name,
    ud.Manager_Email,
    ud.HR_Mail
FROM FirstLastPunch FLP
LEFT JOIN TimeInnings TI ON FLP.USRID = TI.USRID AND FLP.PunchDate = TI.PunchDate
LEFT JOIN UserDetails ud ON FLP.USRID = ud.USRID
WHERE ud.Employee_Name IS NOT NULL
GROUP BY 
    FLP.USRID, 
    ud.Employee_Name, 
    FLP.PunchDate, 
    FLP.InTime, 
    FLP.OutTime, 
    ud.DEPARTMENT, 
    ud.TITLE, 
    ud.Manager_Name, 
    ud.Manager_Email, 
    ud.HR_Mail
ORDER BY FLP.USRID, FLP.PunchDate;