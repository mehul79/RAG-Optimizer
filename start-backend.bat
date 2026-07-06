@echo off
cd /d "%~dp0backend"
.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
