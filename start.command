#!/bin/bash
# تشغيل mycanva (الواجهة + API + MCP على 127.0.0.1:3333) في الخلفية وفتح المتصفح
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-3333}"
mkdir -p .cache
if [ -f .cache/server.pid ] && kill -0 "$(cat .cache/server.pid)" 2>/dev/null; then
  echo "السيرفر شغّال أصلاً (PID $(cat .cache/server.pid)) → http://127.0.0.1:$PORT  (MCP: /mcp)"
  open "http://127.0.0.1:$PORT" 2>/dev/null
  exit 0
fi
if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "المنفذ $PORT مشغول بعملية ثانية. غيّره بـ: PORT=3400 ./start.command"
  exit 1
fi
PORT="$PORT" nohup node --import tsx src/server.ts >> .cache/server.log 2>&1 &
echo $! > .cache/server.pid
sleep 2
if kill -0 "$(cat .cache/server.pid)" 2>/dev/null; then
  echo "تم التشغيل ✅  http://127.0.0.1:$PORT  (MCP: /mcp)  (PID $(cat .cache/server.pid))"
  echo "السجل: .cache/server.log"
  open "http://127.0.0.1:$PORT" 2>/dev/null
else
  echo "فشل التشغيل ❌ — شوف .cache/server.log"; tail -n 15 .cache/server.log; rm -f .cache/server.pid; exit 1
fi
