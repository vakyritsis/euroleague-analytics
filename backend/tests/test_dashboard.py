import re

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_dashboard_and_assets_are_served_by_fastapi():
    page = client.get("/")

    assert page.status_code == 200
    assert "EuroLeague — Courtvision" in page.text
    asset_paths = re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', page.text)
    assert len(asset_paths) >= 2

    assets = [client.get(path) for path in asset_paths]

    assert all(asset.status_code == 200 for asset in assets)
    assert any("createRoot" in asset.text for asset in assets if "javascript" in asset.headers.get("content-type", ""))
    assert any(
        re.search(r"@media\s*\(max-width:\s*560px\)", asset.text)
        for asset in assets
        if "css" in asset.headers.get("content-type", "")
    )
