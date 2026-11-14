import os
import time
import asyncio
import shutil
import aiofiles
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException

from backend.auth import verify_session
from backend.utils import sanitize_path, UPLOAD_DIR
from backend.websocket import manager

upload_router = APIRouter(dependencies=[Depends(verify_session)])

TEMP_DIR = os.path.join(UPLOAD_DIR, "_temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# In-memory dictionary to track progress: 
# upload_id -> {"total_size": int, "uploaded_size": int, "start_time": float, "filename": str, "last_update": float}
upload_progress = {}

@upload_router.post("/api/upload/chunk")
async def upload_chunk(
    file: UploadFile = File(...),
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    relative_path: str = Form(...),
    total_size: int = Form(...)
):
    try:
        # Sanitize path to prevent directory traversal
        target_file_path = sanitize_path(UPLOAD_DIR, relative_path)
    except HTTPException as e:
        raise e
        
    temp_file_dir = os.path.join(TEMP_DIR, upload_id)
    os.makedirs(temp_file_dir, exist_ok=True)
    
    # Save chunk
    chunk_path = os.path.join(temp_file_dir, f"chunk_{chunk_index}")
    
    chunk_size = 0
    async with aiofiles.open(chunk_path, 'wb') as out_file:
        content = await file.read()
        chunk_size = len(content)
        await out_file.write(content)
        
    # Update progress
    if upload_id not in upload_progress:
        upload_progress[upload_id] = {
            "total_size": total_size,
            "uploaded_size": 0,
            "start_time": time.time(),
            "filename": relative_path,
            "last_update": time.time()
        }
        
    upload_progress[upload_id]["uploaded_size"] += chunk_size
    upload_progress[upload_id]["last_update"] = time.time()
    
    # Calculate speed and ETA
    elapsed = time.time() - upload_progress[upload_id]["start_time"]
    speed = upload_progress[upload_id]["uploaded_size"] / elapsed if elapsed > 0 else 0
    progress = (upload_progress[upload_id]["uploaded_size"] / total_size) * 100 if total_size > 0 else 0
    eta = (total_size - upload_progress[upload_id]["uploaded_size"]) / speed if speed > 0 else 0
    
    # Broadcast progress asynchronously so it doesn't block
    asyncio.create_task(manager.broadcast({
        "type": "progress",
        "upload_id": upload_id,
        "filename": relative_path,
        "progress": round(progress, 2),
        "speed": speed,
        "eta": eta,
        "uploaded": upload_progress[upload_id]["uploaded_size"],
        "total": total_size
    }))
    
    # Check if all chunks are received
    chunks_saved = len(os.listdir(temp_file_dir))
    if chunks_saved == total_chunks:
        # Merge chunks
        os.makedirs(os.path.dirname(target_file_path), exist_ok=True)
        async with aiofiles.open(target_file_path, 'wb') as merged_file:
            for i in range(total_chunks):
                c_path = os.path.join(temp_file_dir, f"chunk_{i}")
                async with aiofiles.open(c_path, 'rb') as c_file:
                    await merged_file.write(await c_file.read())
        
        # Cleanup temporary files
        shutil.rmtree(temp_file_dir, ignore_errors=True)
        if upload_id in upload_progress:
            del upload_progress[upload_id]
            
        asyncio.create_task(manager.broadcast({
            "type": "complete",
            "upload_id": upload_id,
            "filename": relative_path
        }))
        return {"status": "completed"}
        
    return {"status": "chunk_received", "received": chunks_saved, "total": total_chunks}

@upload_router.post("/api/upload/cancel")
async def cancel_upload(upload_id: str = Form(...)):
    temp_file_dir = os.path.join(TEMP_DIR, upload_id)
    if os.path.exists(temp_file_dir):
        shutil.rmtree(temp_file_dir, ignore_errors=True)
    
    if upload_id in upload_progress:
        del upload_progress[upload_id]
        
    return {"status": "canceled"}

async def cleanup_temp_uploads():
    """Background task to remove incomplete uploads older than 1 hour"""
    while True:
        try:
            await asyncio.sleep(3600) # Run every hour
            now = time.time()
            if os.path.exists(TEMP_DIR):
                for item in os.listdir(TEMP_DIR):
                    item_path = os.path.join(TEMP_DIR, item)
                    if os.path.isdir(item_path):
                        stat = os.stat(item_path)
                        # If older than 1 hour (3600 seconds)
                        if now - stat.st_mtime > 3600:
                            shutil.rmtree(item_path, ignore_errors=True)
                            if item in upload_progress:
                                del upload_progress[item]
        except Exception as e:
            print(f"Error in cleanup task: {e}")
