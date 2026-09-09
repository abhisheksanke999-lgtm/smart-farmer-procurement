import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print("Starting Smart Farmer Procurement Management System...")
    print(f"Access application at: http://localhost:{port}")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=port, reload=False)

