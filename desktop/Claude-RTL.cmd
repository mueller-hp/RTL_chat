@echo off
setlocal EnableDelayedExpansion
rem Starts Claude Desktop with the RTL script. Use this instead of the regular shortcut.
set "PORT=9333"

rem 1. a path saved next to this file wins
if exist "%~dp0claude-path.txt" set /p CLAUDE_EXE=<"%~dp0claude-path.txt"

rem 2. otherwise look in the usual install places
if not defined CLAUDE_EXE call :find "%LOCALAPPDATA%\AnthropicClaude\claude.exe"
if not defined CLAUDE_EXE for /d %%D in ("%LOCALAPPDATA%\AnthropicClaude\app-*") do call :find "%%D\claude.exe"
if not defined CLAUDE_EXE call :find "%LOCALAPPDATA%\Programs\Claude\Claude.exe"
if not defined CLAUDE_EXE call :find "%LOCALAPPDATA%\Programs\claude-desktop\Claude.exe"
if not defined CLAUDE_EXE call :find "%ProgramFiles%\Claude\Claude.exe"
if not defined CLAUDE_EXE call :find "%ProgramFiles%\AnthropicClaude\claude.exe"

if not defined CLAUDE_EXE (
  echo Claude Desktop was not found in the usual places.
  echo Open Claude, then Task Manager ^> Details ^> right-click claude.exe ^> Open file location.
  echo Put the full path of claude.exe as the only line of:
  echo   %~dp0claude-path.txt
  pause
  exit /b 1
)
if not exist "!CLAUDE_EXE!" (
  echo The path in claude-path.txt does not exist: !CLAUDE_EXE!
  pause
  exit /b 1
)

where node >nul 2>nul || (
  echo Node.js was not found. Install Node.js 22 or newer from nodejs.org
  pause
  exit /b 1
)

tasklist /fi "imagename eq claude.exe" | find /i "claude.exe" >nul && (
  echo Claude is already running. Close it fully, including the tray icon, then run again.
  pause
  exit /b 1
)

echo Starting: !CLAUDE_EXE!
start "" "!CLAUDE_EXE!" --remote-debugging-port=%PORT%
start "Claude RTL" /min node "%~dp0inject.mjs" %PORT%
exit /b 0

:find
if exist "%~1" set "CLAUDE_EXE=%~1"
exit /b 0
