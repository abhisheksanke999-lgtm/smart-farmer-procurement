import subprocess
import time
import urllib.request
import json
import base64
import os
import sys
import asyncio
import websockets

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
USER_DATA_DIR = os.path.abspath("edge_test_profile_auto2")
PORT = 9224
ARTIFACTS_DIR = r"C:\Users\MANIKANTA\.gemini\antigravity-ide\brain\5d105ddf-7c40-498b-9643-118dcc700463"

class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 1
        self.futures = {}

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url)
        asyncio.create_task(self.reader())

    async def reader(self):
        try:
            async for raw in self.ws:
                data = json.loads(raw)
                mid = data.get("id")
                if mid and mid in self.futures:
                    self.futures[mid].set_result(data)
                elif data.get("method") == "Page.javascriptDialogOpening":
                    print(f"[CDP Dialog]: {data.get('params', {}).get('message')}")
                    asyncio.create_task(self.send("Page.handleJavaScriptDialog", {"accept": True}))
        except Exception:
            pass

    async def send(self, method, params=None):
        mid = self.msg_id
        self.msg_id += 1
        msg = {"id": mid, "method": method, "params": params or {}}
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self.futures[mid] = fut
        await self.ws.send(json.dumps(msg))
        res = await fut
        self.futures.pop(mid, None)
        if "error" in res:
            raise Exception(f"CDP Error ({method}): {res['error']}")
        return res.get("result", {})

    async def eval(self, expression):
        res = await self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True
        })
        return res.get("result", {}).get("value")

    async def screenshot(self, filepath):
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        b64 = res.get("data")
        if b64:
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(b64))
            print(f"Screenshot saved: {os.path.basename(filepath)}")

    async def close(self):
        if self.ws:
            await self.ws.close()

async def run_test():
    print("Launching Edge headless instance...")
    args = [
        EDGE_PATH,
        "--headless=new",
        f"--remote-debugging-port={PORT}",
        f"--user-data-dir={USER_DATA_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--guest",
        "--window-size=1280,900",
        "http://127.0.0.1:8000/"
    ]
    proc = subprocess.Popen(args)
    await asyncio.sleep(2.5)

    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")
        tabs = json.loads(req.read().decode("utf-8"))
        page_tab = next(t for t in tabs if t.get("type") == "page" and "syncing" not in t.get("title", "").lower())
        ws_url = page_tab["webSocketDebuggerUrl"]

        client = CDPClient(ws_url)
        await client.connect()

        await client.send("Page.enable")
        await client.send("Runtime.enable")

        print("\n--- STEP 1: Navigate to http://127.0.0.1:8000/ ---")
        await client.send("Page.navigate", {"url": "http://127.0.0.1:8000/"})
        await asyncio.sleep(2.5)

        title = await client.eval("document.title")
        print(f"Loaded page title: {title}")
        assert "Smart Farmer" in title, "Page title mismatch!"

        # 1. Initial State
        current_theme_init = await client.eval("themeManager.getTheme()")
        print(f"Initial theme: '{current_theme_init}'")

        # Save Light Mode screenshot
        light_screenshot = os.path.join(ARTIFACTS_DIR, "screenshot_light_mode.png")
        await client.screenshot(light_screenshot)

        # 2. Test Toggle to Dark Mode
        print("\n--- STEP 2: Toggle to Dark Mode ---")
        toggle_res = await client.eval("themeManager.toggleTheme()")
        print(f"Toggled theme returned: '{toggle_res}'")
        await asyncio.sleep(0.5)

        is_dark = await client.eval("document.documentElement.classList.contains('dark')")
        is_dark_body = await client.eval("document.body.classList.contains('dark-mode')")
        btn_label = await client.eval("document.querySelector('.theme-toggle-btn .theme-toggle-label')?.textContent?.trim()")
        print(f"HTML has 'dark': {is_dark}, Body has 'dark-mode': {is_dark_body}, Toggle button text: '{btn_label}'")
        assert is_dark, "HTML element should have class 'dark'!"
        assert is_dark_body, "Body element should have class 'dark-mode'!"

        dark_screenshot = os.path.join(ARTIFACTS_DIR, "screenshot_dark_mode.png")
        await client.screenshot(dark_screenshot)

        # 3. Test Theme Persistence across Reload
        print("\n--- STEP 3: Test Theme Persistence across Reload ---")
        stored_theme = await client.eval("localStorage.getItem('sf_theme_preference')")
        print(f"Theme in localStorage: '{stored_theme}'")
        assert stored_theme == "dark", f"Expected 'dark' in localStorage, got '{stored_theme}'"

        print("Reloading page...")
        await client.eval("window.location.reload();")
        await asyncio.sleep(2.0)

        is_dark_after_reload = await client.eval("document.documentElement.classList.contains('dark')")
        active_theme_after_reload = await client.eval("themeManager.getTheme()")
        print(f"After reload: HTML has 'dark' = {is_dark_after_reload}, themeManager = '{active_theme_after_reload}'")
        assert is_dark_after_reload, "Theme should stay 'dark' after page reload!"

        # 4. Test Password Show / Hide on Login Form
        print("\n--- STEP 4: Test Password Show / Hide on Login Form ---")
        await client.eval("""
            const pw = document.getElementById('login-password');
            if (pw) pw.value = 'SecretPa$$w0rd2026';
        """)
        pw_type_init = await client.eval("document.getElementById('login-password')?.type")
        pw_val_init = await client.eval("document.getElementById('login-password')?.value")
        print(f"Login password initial type: '{pw_type_init}', value: '{pw_val_init}'")
        assert pw_type_init == "password"

        toggle_btn_exists = await client.eval("!!document.getElementById('toggle-login-password')")
        print(f"Login password toggle button exists: {toggle_btn_exists}")
        assert toggle_btn_exists

        # Click eye button to reveal
        print("Clicking eye icon to reveal password...")
        await client.eval("document.getElementById('toggle-login-password').click()")
        await asyncio.sleep(0.3)

        pw_type_revealed = await client.eval("document.getElementById('login-password')?.type")
        aria_label_revealed = await client.eval("document.getElementById('toggle-login-password')?.getAttribute('aria-label')")
        print(f"Revealed type: '{pw_type_revealed}', Aria label: '{aria_label_revealed}'")
        assert pw_type_revealed == "text"
        assert aria_label_revealed == "Hide password"

        # Screenshot revealed password
        await client.screenshot(os.path.join(ARTIFACTS_DIR, "screenshot_password_revealed.png"))

        # Click eye button again to hide
        print("Clicking eye icon again to hide password...")
        await client.eval("document.getElementById('toggle-login-password').click()")
        await asyncio.sleep(0.3)

        pw_type_hidden = await client.eval("document.getElementById('login-password')?.type")
        aria_label_hidden = await client.eval("document.getElementById('toggle-login-password')?.getAttribute('aria-label')")
        print(f"Hidden type: '{pw_type_hidden}', Aria label: '{aria_label_hidden}'")
        assert pw_type_hidden == "password"
        assert aria_label_hidden == "Show password"

        # 5. Test Password Show / Hide on Registration Form
        print("\n--- STEP 5: Test Password Show / Hide on Registration Form ---")
        await client.eval("toggleAuthMode('register');")
        await asyncio.sleep(0.5)

        await client.eval("""
            const rpw = document.getElementById('reg-password');
            if (rpw) rpw.value = 'MyNewFarmerSecureKey#1';
        """)
        reg_type_init = await client.eval("document.getElementById('reg-password')?.type")
        print(f"Register password initial type: '{reg_type_init}'")
        assert reg_type_init == "password"

        print("Clicking eye icon on registration form...")
        await client.eval("document.getElementById('toggle-reg-password').click()")
        await asyncio.sleep(0.3)

        reg_type_revealed = await client.eval("document.getElementById('reg-password')?.type")
        print(f"Register revealed type: '{reg_type_revealed}'")
        assert reg_type_revealed == "text"

        await client.screenshot(os.path.join(ARTIFACTS_DIR, "screenshot_register_password_revealed.png"))

        print("Clicking eye icon again to hide registration password...")
        await client.eval("document.getElementById('toggle-reg-password').click()")
        await asyncio.sleep(0.3)

        reg_type_hidden = await client.eval("document.getElementById('reg-password')?.type")
        print(f"Register hidden type: '{reg_type_hidden}'")
        assert reg_type_hidden == "password"

        # 6. Test Admin Dashboard in Dark Mode
        print("\n--- STEP 6: Test Admin Dashboard in Dark Mode ---")
        await client.eval("toggleAuthMode('login');")
        await asyncio.sleep(0.3)

        print("Logging in as Admin (abhisheksanke999@gmail.com)...")
        await client.eval("""
            selectLoginRole('ADMIN');
            document.getElementById('login-email').value = 'abhisheksanke999@gmail.com';
            document.getElementById('login-password').value = 'AdminPass@123';
            handleAuthLoginSubmit(new Event('submit'));
        """)

        # Wait for login to finish and dashboard to render
        for _ in range(30):
            has_form = await client.eval("!!document.getElementById('auth-login-form')")
            if not has_form:
                break
            await asyncio.sleep(0.5)
        await asyncio.sleep(1.0)

        user_email = await client.eval("state.currentUser?.email")
        user_role = await client.eval("state.currentUser?.role")
        active_tab = await client.eval("state.activeTab")
        print(f"Logged in as: '{user_email}' (Role: '{user_role}', Active Tab: '{active_tab}')")
        assert user_role == "ADMIN", f"Expected ADMIN, got {user_role}"

        # Capture screenshot of Admin Dashboard in Dark Mode
        admin_dark_screenshot = os.path.join(ARTIFACTS_DIR, "screenshot_admin_dashboard_dark.png")
        await client.screenshot(admin_dark_screenshot)

        # Toggle to Light Mode in Admin Dashboard
        print("Toggling Admin Dashboard to Light Mode...")
        await client.eval("themeManager.toggleTheme()")
        await asyncio.sleep(0.5)
        admin_light_screenshot = os.path.join(ARTIFACTS_DIR, "screenshot_admin_dashboard_light.png")
        await client.screenshot(admin_light_screenshot)

        # Toggle back to Dark Mode
        await client.eval("themeManager.toggleTheme()")
        await asyncio.sleep(0.5)

        # Open Notification Drawer
        print("Opening Notification Drawer in Dark Mode...")
        await client.eval("toggleNotificationDrawer()")
        await asyncio.sleep(0.5)
        drawer_screenshot = os.path.join(ARTIFACTS_DIR, "screenshot_notification_drawer_dark.png")
        await client.screenshot(drawer_screenshot)

        # Close Drawer
        await client.eval("toggleNotificationDrawer()")
        await asyncio.sleep(0.3)

        # Logout before testing farmer
        print("Logging out from Admin...")
        await client.eval("logoutUser();")
        await asyncio.sleep(1.5)

        # 7. Test Farmer View in Dark Mode
        print("\n--- STEP 7: Test Farmer View in Dark Mode ---")
        await client.eval("""
            selectLoginRole('FARMER');
            document.getElementById('login-email').value = 'ramu.farmer.test@agriportal.in';
            document.getElementById('login-password').value = 'FarmerPass123!';
            handleAuthLoginSubmit(new Event('submit'));
        """)

        # Wait for farmer login to finish
        for _ in range(30):
            has_form = await client.eval("!!document.getElementById('auth-login-form')")
            if not has_form:
                break
            await asyncio.sleep(0.5)
        await asyncio.sleep(1.0)

        farmer_role = await client.eval("state.currentUser?.role")
        farmer_name = await client.eval("state.currentUser?.name")
        print(f"Logged in as Farmer: '{farmer_name}' (Role: '{farmer_role}')")
        assert farmer_role == "FARMER"

        farmer_dark_screenshot = os.path.join(ARTIFACTS_DIR, "screenshot_farmer_dashboard_dark.png")
        await client.screenshot(farmer_dark_screenshot)

        # Farmer Slot Booking Wizard in Dark Mode
        print("Navigating to Farmer Slot Booking Wizard in Dark Mode...")
        await client.eval("state.setActiveTab('book_slot'); renderApp();")
        await asyncio.sleep(2.0)
        slot_dark_screenshot = os.path.join(ARTIFACTS_DIR, "screenshot_farmer_slot_booking_dark.png")
        await client.screenshot(slot_dark_screenshot)

        # Logout
        await client.eval("logoutUser();")
        await asyncio.sleep(1.0)
        logged_out = await client.eval("state.currentUser")
        print(f"Logged out currentUser: {logged_out}")
        assert logged_out is None

        print("\n=======================================================")
        print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY WITH 100% PASS!")
        print("=======================================================")

        await client.close()

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(run_test())
