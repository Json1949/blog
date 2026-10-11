#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

if pwd -W >/dev/null 2>&1; then
  win=$(pwd -W)
  win=${win//\//\\}
else
  win=$(pwd)
fi

printf '\n正在打开三个窗口：\n'
printf '  接口    http://127.0.0.1:8787\n'
printf '  前台    http://127.0.0.1:5173/#/\n'
printf '  后台    http://127.0.0.1:5174/#/\n'
printf '\n关掉对应窗口就会停掉那一项。\n\n'

if command -v cmd.exe >/dev/null 2>&1; then
  {
    printf '@echo off\r\n'
    printf 'start "NIke API" /D "%s\\api" cmd /k "go run ."\r\n' "$win"
    printf 'start "NIke WWW" /D "%s\\www" cmd /k "npm run dev"\r\n' "$win"
    printf 'start "NIke Admin" /D "%s\\admin" cmd /k "npm run dev"\r\n' "$win"
  } > .start-run.bat
  cmd.exe //c .start-run.bat
  rm -f .start-run.bat
else
  (cd api && go run .) &
  (cd www && npm run dev) &
  (cd admin && npm run dev) &
  wait
fi
