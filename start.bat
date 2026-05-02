@echo off
echo ========================================
echo  VNFood Platform - Start Dev Environment
echo ========================================

cd /d D:\Download_D\ĐATN 20252\demo\vnfood-platform

echo [1/4] Starting Docker (PostgreSQL + pgAdmin)...
docker-compose up -d
if %errorlevel% neq 0 (
    echo ERROR: docker-compose failed. Is Docker Desktop running?
    pause
    exit /b 1
)

echo [2/4] Activating Python venv...
cd backend
call .venv\Scripts\activate
if %errorlevel% neq 0 (
    echo ERROR: .venv not found. Run: python -m venv .venv ^&^& pip install -r requirements.txt
    pause
    exit /b 1
)

echo [3/4] Seeding admin user (skip if exists)...
python scripts/seed_admin.py

echo.
echo --- NOTE: First run? Import 22k recipes if not done yet: ---
echo       python scripts/import_recipes.py --dry-run
echo       python scripts/import_recipes.py
echo       python scripts/check_recipes.py
echo ------------------------------------------------------------
echo.

echo [4/4] Starting FastAPI backend on http://localhost:8000 ...
echo       Swagger UI: http://localhost:8000/docs
echo.
echo --- To start frontend (separate terminal): ---
echo       cd frontend ^&^& npm run dev
echo ----------------------------------------------
echo.
uvicorn app.main:app --reload --port 8000
