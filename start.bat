@echo off
echo ========================================
echo  VNFood Platform - Start Dev Environment
echo ========================================

cd /d D:\Download_D\ĐATN 20252\demo\vnfood-platform

echo [1/5] Starting Docker (PostgreSQL + pgAdmin)...
docker-compose up -d
if %errorlevel% neq 0 (
    echo ERROR: docker-compose failed. Is Docker Desktop running?
    pause
    exit /b 1
)

echo [2/5] Activating Python venv...
cd backend
call .venv\Scripts\activate
if %errorlevel% neq 0 (
    echo ERROR: .venv not found. Run: python -m venv .venv ^&^& pip install -r requirements.txt
    pause
    exit /b 1
)

echo [3/5] Seeding admin user (skip if exists)...
python scripts/seed_admin.py

echo.
echo --- NOTE: First run? Run these once if not done yet: --------
echo       alembic upgrade head
echo       python scripts/import_recipes.py
echo       python scripts/check_recipes.py
echo ------------------------------------------------------------
echo.

echo [4/5] Starting Frontend (new window) on http://localhost:3000 ...
start "VNFood Frontend" cmd /k "cd /d D:\Download_D\ĐATN 20252\demo\vnfood-platform\frontend && npm run dev"

echo [5/5] Starting FastAPI backend on http://localhost:8000 ...
echo       Swagger UI:  http://localhost:8000/docs
echo       Frontend:    http://localhost:3000
echo       pgAdmin:     http://localhost:5050  (admin@admin.com / admin)
echo.
cd /d D:\Download_D\ĐATN 20252\demo\vnfood-platform\backend
call .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
