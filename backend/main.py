import os
import json
import asyncio
import tempfile
import zipfile
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask

from backend.auth import auth_router, verify_session, SESSION_TOKEN, is_localhost
from backend.upload import upload_router, cleanup_temp_uploads
from backend.websocket import manager
from backend.utils import UPLOAD_DIR, sanitize_path

app = FastAPI(title="Local File Share API")

# Add CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(upload_router)

@app.on_event("startup")
async def startup_event():
    # Start background task for cleaning up temp uploads
    asyncio.create_task(cleanup_temp_uploads())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    # Broadcast updated client list when a new client connects
    asyncio.create_task(manager.broadcast({
        "type": "client_list",
        "clients": manager.get_client_list()
    }))
    
    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
                if data.get("type") == "identify":
                    user_agent = data.get("userAgent", "Unknown")
                    await manager.update_client(websocket, user_agent)
                    
                    # Broadcast the updated list
                    asyncio.create_task(manager.broadcast({
                        "type": "client_list",
                        "clients": manager.get_client_list()
                    }))
                    
                elif data.get("type") == "push_file":
                    # Only localhost should be able to push files
                    if is_localhost(websocket):
                        target_id = data.get("target_id")
                        file_path = data.get("file_path")
                        
                        target_ws = manager.get_websocket_by_id(target_id)
                        if target_ws:
                            asyncio.create_task(manager.send_personal_message({
                                "type": "incoming_file",
                                "url": f"/api/download?path={file_path}"
                            }, target_ws))
                            
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
        # Broadcast updated list after disconnect
        asyncio.create_task(manager.broadcast({
            "type": "client_list",
            "clients": manager.get_client_list()
        }))

@app.get("/api/files", dependencies=[Depends(verify_session)])
async def list_files_at_path(path: str = ""):
    target_dir = sanitize_path(UPLOAD_DIR, path)
    if not os.path.isdir(target_dir):
        return JSONResponse(status_code=404, content={"detail": "Directory not found"})
        
    items = []
    for item in os.listdir(target_dir):
        if item == "_temp":
            continue
            
        item_path = os.path.join(target_dir, item)
        rel_path = os.path.relpath(item_path, UPLOAD_DIR).replace('\\', '/')
        
        if os.path.isdir(item_path):
            items.append({
                "name": item, 
                "path": rel_path, 
                "type": "folder"
            })
        else:
            items.append({
                "name": item, 
                "path": rel_path, 
                "type": "file", 
                "size": os.path.getsize(item_path)
            })
    
    # Sort: folders first, then alphabetically
    items.sort(key=lambda x: (x["type"] != "folder", x["name"].lower()))
    return {"items": items}

@app.get("/api/download", dependencies=[Depends(verify_session)])
async def download(path: str):
    target_path = sanitize_path(UPLOAD_DIR, path)
    
    if not os.path.exists(target_path):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
        
    if os.path.isfile(target_path):
        return FileResponse(
            target_path, 
            filename=os.path.basename(target_path)
        )
    else:
        # It's a folder, create a zip file asynchronously so it doesn't block
        def create_zip():
            temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
            with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(target_path):
                    # Don't zip the _temp folder if we're zipping root
                    if "_temp" in root:
                        continue
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, target_path)
                        zipf.write(file_path, arcname)
            return temp_zip.name

        zip_path = await asyncio.to_thread(create_zip)
                    
        def remove_temp_file():
            if os.path.exists(zip_path):
                os.remove(zip_path)
                
        return FileResponse(
            zip_path, 
            filename=f"{os.path.basename(target_path)}.zip", 
            background=BackgroundTask(remove_temp_file)
        )

# Serve Next.js frontend (static HTML export)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    @app.get("/")
    async def index_fallback():
        return {"message": "Frontend static files not found. Run Next.js build first."}







