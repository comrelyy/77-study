@echo off
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto run
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
  "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" -m venv .venv
) else (
  py -3 -m venv .venv
)
if errorlevel 1 goto failed
:run
echo Open http://127.0.0.1:8765 after the server starts.
".venv\Scripts\python.exe" app.py
if errorlevel 1 goto failed
exit /b
:failed
echo Python startup failed. Please copy the error above.
pause
