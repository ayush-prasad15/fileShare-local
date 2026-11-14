@echo off
echo Starting Nexus Share...

IF NOT EXIST backend\venv (
    echo Creating virtual environment...
    python -m venv backend\venv
)

echo Installing backend dependencies...
backend\venv\Scripts\pip install -r backend\requirements.txt

echo Starting server...
set PYTHONPATH=.
backend\venv\Scripts\uvicorn backend.main:app --host 0.0.0.0 --port 8000

echo.
pause
