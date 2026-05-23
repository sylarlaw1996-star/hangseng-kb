@echo off
cd /d C:\Users\Administrator
set PATH=%PATH%;C:\Program Files\Git\bin
"C:\Program Files\Git\bin\git.exe" add -A
"C:\Program Files\Git\bin\git.exe" diff --cached --quiet && exit /b 0
"C:\Program Files\Git\bin\git.exe" commit -m "auto: %date% %time%"
