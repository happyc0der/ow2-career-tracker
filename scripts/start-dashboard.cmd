@echo off
rem Starts the OW2 career dashboard (syncs first, then opens http://127.0.0.1:8765 in your browser).
rem Close this window to stop the dashboard.
title OW2 Career Tracker
cd /d "%~dp0.."
uv run owdash serve
