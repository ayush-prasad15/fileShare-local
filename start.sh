#!/bin/bash
echo "Starting Nexus Share..."

if [ ! -d "backend/venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv backend/venv
fi

echo "Installing backend dependencies..."
backend/venv/bin/pip install -r backend/requirements.txt

echo "Starting server..."
export PYTHONPATH=.
backend/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
