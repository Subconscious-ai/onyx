"""Sign in as a test user, open Craft's welcome page and its Market research starter prompts, screenshot.

Usage: python welcome_screenshot.py <user env file> <out.png>
Runs where Playwright's Chromium is installed, for example the sandbox image:
  docker run --rm --network host -v ~/craft-ep:/w -w /w --entrypoint /opt/ep-tools/uxtest/bin/python \
    <sandbox image> welcome_screenshot.py ep-user2.env welcome.png
Prints no secret.
"""
import sys

from playwright.sync_api import sync_playwright

env = dict(line.strip().split("=", 1) for line in open(sys.argv[1]) if "=" in line)
email = env.get("U_EMAIL") or env.get("CRAFT_USER_EMAIL")
password = env.get("U_PASSWORD") or env.get("CRAFT_USER_PASSWORD")
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1200, "height": 800})
    print("login", ctx.request.post("http://localhost:3390/api/auth/login", form={"username": email, "password": password}).status)
    page = ctx.new_page()
    page.goto("http://localhost:3390/craft/v1", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(10000)
    # A first visit opens the "Meet Craft" tour over the page.
    page.keyboard.press("Escape")
    page.wait_for_timeout(800)
    if page.get_by_role("dialog").count():
        page.get_by_role("dialog").get_by_role("button").first.click()
        page.wait_for_timeout(800)
    pill = page.get_by_role("button", name="Market research")
    print("market research prompts", pill.count())
    if pill.count():
        pill.first.click()
        page.wait_for_timeout(800)
    page.screenshot(path=sys.argv[2])
    browser.close()
