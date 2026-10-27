@echo off
rem Run the CLI without installing it globally: scenario.cmd <command>
node "%~dp0packages\cli\dist\index.js" %*
