@echo off
rem Tunnel guard launcher - invoked by the scheduled task "shop-tunnel-guard".
rem See scripts/tunnel-guard-task.mjs to install or remove that task.
rem
rem Purpose: resolve node at RUNTIME so the task never pins a versioned path.
rem mise keeps node under a versioned installs folder, so a hardcoded node.exe
rem path breaks on the next node major upgrade and the guard silently fails to
rem start at logon. Resolution order: mise shim, then node on PATH, then the
rem newest version folder under mise installs.
rem
rem IMPORTANT: keep every line here pure ASCII and free of cmd metacharacters
rem such as < > & | ( ). cmd parses batch files with the system OEM code page
rem and treats some of those bytes as redirection or command separators, which
rem aborts the script with no output. The full explanation lives in
rem scripts/tunnel-guard-task.mjs and AGENTS.md.
setlocal EnableDelayedExpansion

set "SCRIPT=%~dp0ensure-datastore.mjs"
set "LOG=%USERPROFILE%\.shop-datastore\tunnel-guard.log"

if not exist "%SCRIPT%" goto noscript

set "NODE="

if exist "%LOCALAPPDATA%\mise\shims\node.exe" set "NODE=%LOCALAPPDATA%\mise\shims\node.exe"

if not defined NODE for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE set "NODE=%%N"

if not defined NODE for /f "delims=" %%D in ('dir /b /o-n "%LOCALAPPDATA%\mise\installs\node" 2^>nul') do if not defined NODE if exist "%LOCALAPPDATA%\mise\installs\node\%%D\node.exe" set "NODE=%LOCALAPPDATA%\mise\installs\node\%%D\node.exe"

if not defined NODE goto nonode

echo [%DATE% %TIME%] launcher: node = %NODE% >> "%LOG%"
"%NODE%" "%SCRIPT%" --tunnel-guard
exit /b %ERRORLEVEL%

:noscript
echo [%DATE% %TIME%] launcher: script not found: %SCRIPT% >> "%LOG%"
exit /b 2

:nonode
echo [%DATE% %TIME%] launcher: node not found - tried mise shim then PATH then mise installs >> "%LOG%"
exit /b 3
