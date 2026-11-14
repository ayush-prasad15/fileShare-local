import secrets
import string
import socket
from fastapi import APIRouter, HTTPException, Response, Request, Depends

# No PIN required for local network
SESSION_TOKEN = secrets.token_urlsafe(32)

auth_router = APIRouter()

# Login endpoint removed as PIN is disabled

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def is_localhost(request: Request):
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_host = forwarded.split(',')[0].strip()
    else:
        client_host = request.client.host
    return client_host in ("127.0.0.1", "::1", "localhost")

def verify_session(request: Request):
    return True

@auth_router.get("/api/server-info")
async def get_server_info(request: Request):
    return {
        "local_ip": get_local_ip(),
        "port": 8000
    }
