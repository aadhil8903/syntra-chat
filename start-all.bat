@echo off
title Enter-Chat Multi-Service Launcher
echo ===================================================
echo        STARTING ENTER-CHAT FULL STACK
echo ===================================================
echo.

echo [1/3] Starting Python AI Service (Port 8000)...
start "Enter-Chat AI Service (Port 8000)" cmd /k "cd apps\ai-service && uv run python main.py"

echo [2/3] Starting NestJS Backend API (Port 3000)...
start "Enter-Chat Backend (Port 3000)" cmd /k "npm run start:dev --prefix apps/backend"

echo [3/3] Starting Angular Frontend UI (Port 4200)...
start "Enter-Chat Frontend (Port 4200)" cmd /k "npm run start --prefix apps/frontend"

echo.
echo ===================================================
echo All 3 services have been launched in separate terminals!
echo.
echo   Frontend URL:   http://localhost:4200
echo   Backend API:    http://localhost:3000/api
echo   AI Service API: http://localhost:8000/health
echo ===================================================
pause

