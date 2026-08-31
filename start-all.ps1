# Enter-Chat PowerShell Launcher
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "       STARTING ENTER-CHAT FULL STACK" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Starting Python AI Service (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'apps/ai-service'; uv run python main.py"

Write-Host "[2/3] Starting NestJS Backend API (Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run start:dev --prefix apps/backend"

Write-Host "[3/3] Starting Angular Frontend UI (Port 4200)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run start --prefix apps/frontend"

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "All 3 services launched in separate windows!" -ForegroundColor Green
Write-Host "  Frontend URL:   http://localhost:4200" -ForegroundColor White
Write-Host "  Backend API:    http://localhost:3000/api" -ForegroundColor White
Write-Host "  AI Service API: http://localhost:8000/health" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Green

