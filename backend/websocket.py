import json
import asyncio
import uuid
from fastapi import WebSocket
from typing import Dict

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, dict] = {}
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        client_id = str(uuid.uuid4())
        ip = websocket.client.host if websocket.client else "Unknown"
        
        async with self.lock:
            self.active_connections[websocket] = {
                "id": client_id,
                "ip": ip,
                "user_agent": None,
                "device_name": ip
            }

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            if websocket in self.active_connections:
                del self.active_connections[websocket]
                
    async def update_client(self, websocket: WebSocket, user_agent: str):
        async with self.lock:
            if websocket in self.active_connections:
                self.active_connections[websocket]["user_agent"] = user_agent
                
                # Try to parse a friendly name from User-Agent
                name = self.active_connections[websocket]["ip"]
                if "iPhone" in user_agent: name = f"iPhone ({name})"
                elif "iPad" in user_agent: name = f"iPad ({name})"
                elif "Android" in user_agent: name = f"Android ({name})"
                elif "Macintosh" in user_agent or "Mac OS" in user_agent: name = f"Mac ({name})"
                elif "Windows" in user_agent: name = f"Windows ({name})"
                elif "Linux" in user_agent: name = f"Linux ({name})"
                
                self.active_connections[websocket]["device_name"] = name
                
    def get_client_list(self):
        return [info for ws, info in self.active_connections.items() if info.get("user_agent") is not None]
        
    def get_websocket_by_id(self, client_id: str):
        for ws, info in self.active_connections.items():
            if info["id"] == client_id:
                return ws
        return None

    async def broadcast(self, message: dict):
        text_message = json.dumps(message)
        async with self.lock:
            # Create a copy to iterate safely
            connections = list(self.active_connections.keys())
            
        for connection in connections:
            try:
                await connection.send_text(text_message)
            except Exception:
                pass
                
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            pass

manager = ConnectionManager()
