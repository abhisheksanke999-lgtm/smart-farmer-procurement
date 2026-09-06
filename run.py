import os
from pathlib import Path
from dotenv import load_dotenv
import uvicorn

# Load local .env before starting server
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE_PATH = BASE_DIR / ".env"
if ENV_FILE_PATH.is_file():
    load_dotenv(dotenv_path=str(ENV_FILE_PATH), override=False)
else:
    load_dotenv(override=False)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print("Starting Smart Farmer Procurement Management System...")
    print(f"Access application at: http://localhost:{port}")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=port, reload=False)

