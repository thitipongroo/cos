"""Construction OS — AI Service (FastAPI stub)
Phase 11+: AI Foundation
See: context/00_master_construction_os.md §Phase 11
"""
from fastapi import FastAPI
import uvicorn
import os

app = FastAPI(title="COS AI Service", version="0.1.0")

@app.get("/health/live")
async def liveness():
    return {"status": "ok", "service": os.environ.get("OTEL_SERVICE_NAME", "ai-service")}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
