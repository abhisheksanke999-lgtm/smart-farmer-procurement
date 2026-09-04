import uvicorn

if __name__ == "__main__":
    print("Starting Smart Farmer Procurement Management System...")
    print("Default Admin Credentials: abhisheksanke999@gmail.com / AdminPass@123")
    print("Access application at: http://localhost:8000")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
