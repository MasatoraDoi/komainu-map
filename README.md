# Komainu Map (MVP)

狛犬がいる神社を地図で表示し、クリックで情報を見られる最小構成アプリ。

## Local run
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
