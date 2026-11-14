"use strict";
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import FileList from "@/components/FileList";
import { motion } from "framer-motion";
import { Activity, Wifi, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [serverInfo, setServerInfo] = useState<{local_ip: string, pin: string, port: number} | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Check server info on mount
  useEffect(() => {
    const checkServerInfo = async () => {
      try {
        const res = await fetch("/api/server-info");
        if (res.ok) {
          const data = await res.json();
          setServerInfo(data);
        }
      } catch (err) {}
    };
    checkServerInfo();
  }, []);

  // WebSocket for client tracking and receiving pushes
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "identify", userAgent: navigator.userAgent }));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "client_list") {
          // Filter out our own device from the list based on IP/UserAgent if possible, 
          // or just show all. We'll show all to be safe.
          setClients(data.clients);
        } else if (data.type === "incoming_file") {
          // Trigger file download
          const a = document.createElement("a");
          a.href = data.url;
          a.download = "";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch (e) {}
    };
    
    return () => ws.close();
  }, [isAuthenticated]);

  const handleUploadComplete = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);
  
  const handlePushFile = useCallback((path: string, clientId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "push_file",
        target_id: clientId,
        file_path: path
      }));
    }
  }, []);

  return (
    <main className="min-h-screen relative p-4 md:p-8 lg:p-12 overflow-x-hidden">
      {/* Background glowing orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-neon-blue/10 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-neon-purple/10 blur-[120px] pointer-events-none" />
      

      <div className="max-w-7xl mx-auto space-y-12 relative z-10">
        {/* Header */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
              <Activity className="text-neon-blue" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white text-glow">
                Nexus <span className="text-gray-400 font-light text-shadow-none">Share</span>
              </h1>
              <p className="text-neon-blue text-sm font-mono mt-1">SECURE LOCAL TRANSFER</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Connection Secure
            </div>
          </div>
        </motion.header>

        {serverInfo && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col lg:flex-row gap-6 p-6 rounded-3xl bg-white/5 border border-white/10 relative overflow-hidden"
          >
            {/* Background decoration */}
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-neon-purple/20 rounded-full blur-[50px] pointer-events-none" />
            
            <div className="flex flex-col sm:flex-row gap-6 flex-1 items-center justify-between">
              <div className="flex flex-col gap-6 w-full">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-neon-blue/20 rounded-xl text-neon-blue">
                    <Wifi size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 font-medium tracking-wide">CONNECT DEVICES AT</p>
                    <p className="text-xl md:text-2xl font-mono text-white mt-1">http://{serverInfo.local_ip}:{serverInfo.port}</p>
                  </div>
                </div>
              </div>

              {/* QR Code */}
              <div className="flex-shrink-0 bg-white p-3 rounded-2xl shadow-xl shadow-black/50 hidden sm:block">
                <QRCodeSVG value={`http://${serverInfo.local_ip}:${serverInfo.port}`} size={120} />
              </div>
            </div>

            <div className="w-full lg:w-px h-px lg:h-auto bg-white/10" />

            {/* Connected Devices Panel */}
            <div className="flex-1 flex flex-col">
              <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2 tracking-wide uppercase">
                <Smartphone size={16} className="text-neon-blue" /> Connected Clients
              </h3>
              <div className="flex-1 bg-black/40 rounded-xl border border-white/5 p-3 overflow-y-auto max-h-[150px]">
                {clients.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Waiting for devices...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clients.map(c => (
                      <div key={c.id} className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-lg">
                        <span className="text-sm text-white truncate max-w-[200px]">{c.device_name}</span>
                        <span className="text-xs text-neon-blue bg-neon-blue/10 px-2 py-1 rounded">Active</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Main Content Layout */}
        {isAuthenticated && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Upload Area */}
            <div className="lg:col-span-5 flex flex-col">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="text-neon-purple">01.</span> Transfer Protocol
              </h2>
              <FileUpload onUploadComplete={handleUploadComplete} />
            </div>
            
            {/* File List Area */}
            <div className="lg:col-span-7 flex flex-col h-full">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="text-neon-blue">02.</span> Available Assets
              </h2>
              <FileList refreshTrigger={refreshTrigger} clients={serverInfo ? clients : []} onPushFile={handlePushFile} />
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
