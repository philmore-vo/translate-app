@echo off
echo ============================================
echo   EngiLink Dictionary - Setup
echo ============================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download from: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js found
node --version

:: Install dependencies
echo.
echo Installing dependencies...
npm install

if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Setup complete!
echo   Run: npm run dev
echo   Or double-click: start-app.bat
echo ============================================
pause
