@echo off
REM QuickLink service control helper (ASCII only: cmd.exe reads batch files in the OEM code page,
REM so non-ASCII text here would turn into mojibake on non-English systems)
setlocal EnableExtensions
set "SERVICE=QuickLink"
set "NSSM=%~dp0nssm\nssm.exe"
set "URL=http://localhost:3000"
set "LOGDIR=%ProgramData%\QuickLink\logs"
set "DATADIRFILE=%ProgramData%\QuickLink\data_dir.txt"

net session >nul 2>&1
if errorlevel 1 (
  echo [WARN] Not running as administrator: start/stop/restart will fail.
  echo        Right-click and choose "Run as administrator".
  echo.
)

:menu
cls
echo ==================================================
echo   QuickLink Service Control
echo ==================================================
sc query "%SERVICE%" 2>nul | findstr /C:"STATE"
if errorlevel 1 echo   Service is NOT installed.
echo.
echo   [1] Start service
echo   [2] Stop service
echo   [3] Restart service
echo   [4] Detailed status
echo   [5] Open QuickLink in browser
echo   [6] Open log folder
echo   [7] Tail error log (Ctrl+C to stop)
echo   [8] Show data directory
echo   [0] Exit
echo.
set "CHOICE="
set /p CHOICE=Select an option:

REM Only the first character is compared: input redirected from a file or pasted can leave a
REM trailing CR or embedded newlines in the variable, and expanding those into the if-lines
REM below makes cmd abort the whole script with "The syntax of the command is incorrect".
set "CHOICE=%CHOICE:~0,1%"

if "%CHOICE%"=="1" goto start
if "%CHOICE%"=="2" goto stop
if "%CHOICE%"=="3" goto restart
if "%CHOICE%"=="4" goto status
if "%CHOICE%"=="5" goto browser
if "%CHOICE%"=="6" goto logdir
if "%CHOICE%"=="7" goto tail
if "%CHOICE%"=="8" goto datadir
if "%CHOICE%"=="0" goto end
goto menu

:start
echo.
"%NSSM%" start "%SERVICE%"
goto pause

:stop
echo.
"%NSSM%" stop "%SERVICE%"
goto pause

:restart
echo.
"%NSSM%" restart "%SERVICE%"
goto pause

:status
echo.
sc qc "%SERVICE%"
echo.
sc query "%SERVICE%"
goto pause

:browser
start "" "%URL%"
goto menu

:logdir
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
start "" "%LOGDIR%"
goto menu

:tail
echo.
if not exist "%LOGDIR%\service.err.log" (
  echo No error log yet: %LOGDIR%\service.err.log
  goto pause
)
powershell -NoProfile -Command "Get-Content -Tail 40 -Wait -LiteralPath '%LOGDIR%\service.err.log'"
goto pause

:datadir
echo.
echo Config directory: %ProgramData%\QuickLink
if exist "%DATADIRFILE%" (
  echo data_dir.txt is written as UTF-16LE by the installer, decoded below:
  powershell -NoProfile -Command "Get-Content -LiteralPath '%DATADIRFILE%' -Encoding Unicode"
) else (
  echo data_dir.txt not found - the service falls back to %ProgramData%\QuickLink\data
)
goto pause

:pause
echo.
pause
goto menu

:end
endlocal
