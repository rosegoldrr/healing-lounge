#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 가 없어요. https://nodejs.org 에서 LTS 를 설치한 뒤 다시 실행하세요."
  open https://nodejs.org; read -p "엔터를 누르면 닫혀요"; exit 1
fi
[ -d node_modules ] || { echo "처음 한 번만 설치 중..."; npm install --omit=dev; }
(sleep 3; open http://localhost:3000) &
node server/index.js
