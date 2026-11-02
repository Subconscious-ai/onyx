"""Sign in to the local Craft stack as a test user and screenshot one artifact URL."""
import sys
from playwright.sync_api import sync_playwright

env = dict(line.strip().split("=", 1) for line in open(sys.argv[1]) if "=" in line)
email = env.get("U_EMAIL") or env.get("CRAFT_USER_EMAIL")
password = env.get("U_PASSWORD") or env.get("CRAFT_USER_PASSWORD")
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1000, "height": 700})
    print("login", ctx.request.post("http://localhost:3390/api/auth/login", form={"username": email, "password": password}).status)
    page = ctx.new_page()
    html = ctx.request.get("http://localhost:3390" + sys.argv[2]).text()
    page.set_content(html, wait_until="networkidle")
    page.screenshot(path=sys.argv[3], full_page=True)
    browser.close()
