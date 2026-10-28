#!/bin/bash
# إيقاف سيرفر mycanva MCP
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-3333}"
if [ -f .cache/server.pid ]; then
  PID="$(cat .cache/server.pid)"
  kill "$PID" 2>/dev/null && echo "تم الإيقاف ✅ (PID $PID)" || echo "العملية $PID مو شغّالة"
  rm -f .cache/server.pid
else
  echo "ما في ملف PID — بحاول أوقف أي شي على المنفذ $PORT"
fi
PIDS="$(lsof -ti tcp:"$PORT" 2>/dev/null)"
[ -n "$PIDS" ] && kill $PIDS && echo "أُغلقت العملية على المنفذ $PORT"
exit 0
