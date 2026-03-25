#!/bin/bash
echo "[staffbot] Starting all services..."

# Docker containers
cd /root/staffbot/docker
docker compose up -d postgres redis qdrant minio 2>/dev/null || \
docker compose up -d postgres redis qdrant 2>/dev/null
sleep 5

# Backend  (< /dev/null prevents tsx watch EBADF crash)
cd /root/staffbot/backend
nohup npm run dev < /dev/null > /tmp/backend.log 2>&1 &
echo "[staffbot] Backend started"

# RAG Engine
cd /root/staffbot/rag-engine
source .venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 < /dev/null > /tmp/rag.log 2>&1 &
echo "[staffbot] RAG Engine started"

# Worker  (< /dev/null prevents tsx watch EBADF crash)
cd /root/staffbot/worker
nohup npm run dev < /dev/null > /tmp/worker.log 2>&1 &
echo "[staffbot] Worker started"

# Frontend
cd /root/staffbot/frontend
nohup npm run start -- -p 3000 < /dev/null > /tmp/frontend.log 2>&1 &
echo "[staffbot] Frontend started"

sleep 5
echo "[staffbot] All services up. Checking health..."
curl -s http://localhost:4000/health && echo ""
curl -s http://localhost:8000/health && echo ""
echo "[staffbot] Done"
