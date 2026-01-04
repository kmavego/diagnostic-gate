from __future__ import annotations

from fastapi import FastAPI

from .db import Base, engine
from .routes.projects import router as projects_router
from .routes.evaluate import router as evaluate_router
from .routes.submissions import router as submissions_router
from .routes.ui_schema import router as ui_schema_router


app = FastAPI(title="Diagnostic Gate Backend", version="0.1.0")

# create tables (MVP)
Base.metadata.create_all(bind=engine)

app.include_router(projects_router)
app.include_router(evaluate_router)
app.include_router(submissions_router)
app.include_router(ui_schema_router)



@app.get("/health")
def health():
    return {"ok": True}

