@echo off
:: ============================================
:: Team Camera App - Backup Script
:: ============================================
:: Δημιουργεί backup του project σε zip αρχείο
:: Εξαιρεί: node_modules, .git, BackUp folder
:: Αποθηκεύει στο: C:\Users\Michael\BackUp
:: ============================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   Team Camera App - Backup Script
echo ========================================
echo.

:: Ορισμός φακέλων
set "PROJECT_DIR=%~dp0"
set "BACKUP_DIR=C:\Users\Michael\BackUp"
set "TEMP_BACKUP=%TEMP%\my-team-app-backup"

:: Δημιουργία φακέλου BackUp αν δεν υπάρχει
if not exist "%BACKUP_DIR%" (
    echo [*] Δημιουργία φακέλου BackUp...
    mkdir "%BACKUP_DIR%"
)

:: Δημιουργία ονόματος αρχείου με ημερομηνία (Format: my-team-app_2026-02-02_153045.zip)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set "YEAR=%datetime:~0,4%"
set "MONTH=%datetime:~4,2%"
set "DAY=%datetime:~6,2%"
set "HOUR=%datetime:~8,2%"
set "MINUTE=%datetime:~10,2%"
set "SECOND=%datetime:~12,2%"

set "BACKUP_NAME=my-team-app_%YEAR%-%MONTH%-%DAY%_%HOUR%-%MINUTE%-%SECOND%.zip"
set "BACKUP_PATH=%BACKUP_DIR%\%BACKUP_NAME%"

echo [*] Project Directory: %PROJECT_DIR%
echo [*] Backup Directory:  %BACKUP_DIR%
echo [*] Backup Filename:   %BACKUP_NAME%
echo.

:: Καθαρισμός προσωρινού φακέλου αν υπάρχει
if exist "%TEMP_BACKUP%" (
    echo [*] Καθαρισμός προσωρινού φακέλου...
    rmdir /s /q "%TEMP_BACKUP%" 2>nul
)

:: Δημιουργία προσωρινού φακέλου
echo [*] Δημιουργία προσωρινού φακέλου...
mkdir "%TEMP_BACKUP%"

:: Αντιγραφή αρχείων (εξαιρώντας node_modules, .git, BackUp)
echo [*] Αντιγραφή αρχείων project...
echo     (Εξαιρώντας: node_modules, .git, .expo)
echo.

xcopy "%PROJECT_DIR%*" "%TEMP_BACKUP%\" /E /H /C /I /Q /EXCLUDE:%~dp0backup_exclude.txt 2>nul

if not exist "%~dp0backup_exclude.txt" (
    :: Αν δεν υπάρχει exclude list, χρησιμοποίησε robocopy με excludes
    robocopy "%PROJECT_DIR%" "%TEMP_BACKUP%" /E /XD "node_modules" ".git" ".expo" "BackUp" /XF "backup.bat" "*.log" /NFL /NDL /NJH /NJS
) else (
    :: Χρησιμοποίησε το exclude file
    echo [!] Χρήση backup_exclude.txt για εξαιρέσεις
)

:: Δημιουργία ZIP με PowerShell
echo [*] Δημιουργία ZIP αρχείου...
echo     Αυτό μπορεί να πάρει λίγα δευτερόλεπτα...
echo.

powershell -command "Compress-Archive -Path '%TEMP_BACKUP%\*' -DestinationPath '%BACKUP_PATH%' -CompressionLevel Optimal -Force"

if %errorlevel% equ 0 (
    :: Επιτυχία
    echo.
    echo ========================================
    echo   ✓ BACKUP ΟΛΟΚΛΗΡΩΘΗΚΕ ΕΠΙΤΥΧΩΣ!
    echo ========================================
    echo.
    echo [✓] Αρχείο:  %BACKUP_NAME%
    echo [✓] Μέγεθος:

    :: Εμφάνιση μεγέθους αρχείου
    for %%A in ("%BACKUP_PATH%") do (
        set "size=%%~zA"
        set /a "sizeMB=!size! / 1048576"
        echo     !sizeMB! MB ^(%%~zA bytes^)
    )

    echo [✓] Τοποθεσία: %BACKUP_DIR%
    echo.

    :: Καθαρισμός προσωρινού φακέλου
    echo [*] Καθαρισμός προσωρινών αρχείων...
    rmdir /s /q "%TEMP_BACKUP%" 2>nul

    echo [✓] Ολοκληρώθηκε!
    echo.

    :: Άνοιγμα φακέλου BackUp
    echo [*] Άνοιγμα φακέλου BackUp...
    explorer "%BACKUP_DIR%"

) else (
    :: Σφάλμα
    echo.
    echo ========================================
    echo   ✗ ΣΦΑΛΜΑ ΚΑΤΑ ΤΟ BACKUP
    echo ========================================
    echo.
    echo [✗] Το backup απέτυχε.
    echo [✗] Error Code: %errorlevel%
    echo.

    :: Καθαρισμός προσωρινού φακέλου
    if exist "%TEMP_BACKUP%" (
        rmdir /s /q "%TEMP_BACKUP%" 2>nul
    )
)

echo.
echo Πάτησε οποιοδήποτε πλήκτρο για έξοδο...
pause >nul

endlocal
