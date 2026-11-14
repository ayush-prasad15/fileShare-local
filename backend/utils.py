import os
from fastapi import HTTPException

# Determine the root directory of the project (one level up from backend)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

def sanitize_path(base_dir: str, requested_path: str) -> str:
    """Ensure the requested path is safely within the base directory."""
    # Normalize path and remove leading slashes to prevent absolute path injection
    requested_path = requested_path.lstrip("/\\")
    target_path = os.path.abspath(os.path.join(base_dir, requested_path))
    
    if not target_path.startswith(os.path.abspath(base_dir)):
        raise HTTPException(status_code=403, detail="Invalid path - Directory traversal detected")
        
    return target_path
