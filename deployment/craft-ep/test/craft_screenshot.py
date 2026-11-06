"""Sign in to the local Craft stack as a test user and screenshot a session's chat.

Usage: python craft_screenshot.py <user env file> <session id> <out.png>
Reads U_EMAIL/U_PASSWORD (or CRAFT_USER_*) from the env file; prints no secret.
"""
import sys

from playwright.sync_api import sync_playwright

env = dict(line.strip().split("=", 1) for line in open(sys.argv[1]) if "=" in line)
email = env.get("U_EMAIL") or env.get("CRAFT_USER_EMAIL")
password = env.get("U_PASSWORD") or env.get("CRAFT_USER_PASSWORD")
base = "http://localhost:3390"
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    r = ctx.request.post(f"{base}/api/auth/login", form={"username": email, "password": password})
    print("login", r.status)
    page = ctx.new_page()
    page.goto(f"{base}/craft/v1?sessionId={sys.argv[2]}", wait_until="networkidle", timeout=90000)
    page.wait_for_timeout(6000)
    for _ in range(2):
        dialog = page.get_by_role("dialog")
        if dialog.count():
            dialog.get_by_role("button").first.click()
            page.wait_for_timeout(800)
    imgs = page.locator("img[src*='/artifacts/outputs/graphs/']")
    n = imgs.count()
    loaded = page.evaluate("Array.from(document.querySelectorAll(\"img[src*='/artifacts/outputs/graphs/']\")).filter(i => i.complete && i.naturalWidth > 0).length")
    print("chart images in chat:", n, "rendered:", loaded)
    if n:
        imgs.first.scroll_into_view_if_needed()
        page.wait_for_timeout(1500)
    page.screenshot(path=sys.argv[3])
    browser.close()
