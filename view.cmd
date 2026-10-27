@echo off
rem Open the live viewer for a project file: view.cmd path\to\project.json
rem Without an argument the viewer starts on its welcome screen.
setlocal
if not "%~1"=="" set "SCENARIO_FILE=%~f1"
pushd "%~dp0apps\viewer"
call pnpm exec vite --open
popd
