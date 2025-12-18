from pathlib import Path
import json

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

APP_DIR = Path(__file__).parent
DATA_PATH = APP_DIR / "data" / "spots.json"

app = FastAPI(title="Komainu Map")

# static / templates
app.mount("/static", StaticFiles(directory=str(APP_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(APP_DIR / "templates"))


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/spots")
def get_spots():
    if not DATA_PATH.exists():
        return JSONResponse({"spots": []})

    with DATA_PATH.open("r", encoding="utf-8") as f:
        spots = json.load(f)

    # ここで軽いバリデーション（最低限）
    cleaned = []
    for s in spots:
        if "name" in s and "lat" in s and "lon" in s:
            cleaned.append(s)
    return {"spots": cleaned}


@app.get("/healthz")
def healthz():
    return {"ok": True}
