#!/bin/bash

# Invoice.AI Startup Script

echo "🚀 Starting Invoice.AI..."

# Get the directory where the script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "⚠️  Virtual environment not found. Creating one..."
    python3 -m venv venv
    source venv/bin/activate
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Check if port 8000 is in use and kill it
PID=$(lsof -t -i:8000)
if [ ! -z "$PID" ]; then
    echo "🔄 Freeing port 8000..."
    kill -9 $PID
fi

echo "✅ Server starting at http://localhost:8000"
echo "📝 Press Ctrl+C to stop"

# Run the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
