#!/bin/bash

echo ""
echo "  Starting TriageFlow..."
echo ""

# Get the directory this script lives in, so it works from anywhere
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start backend
(cd "$ROOT/backend" && node server.js) &
BACKEND_PID=$!

# Start frontend
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

echo "  Backend  →  http://localhost:3001"
echo "  Frontend →  http://localhost:5173"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# When Ctrl+C is pressed, kill both servers cleanly
trap "echo ''; echo '  Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait $BACKEND_PID $FRONTEND_PID
