@echo off
set JWT_SECRET=test_secret_key_for_local_development_only_32chars
set ALLOWED_ORIGINS=*
set ADMIN_PASSWORD=admin123
set PORT=3001
node server.js
pause
