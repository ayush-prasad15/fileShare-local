"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, FolderUp, FileUp, CheckCircle2, AlertCircle, Loader2, Pause, Play, XCircle } from "lucide-react";

interface FileUploadProps {
  onUploadComplete: () => void;
}

export default function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ [id: string]: any }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const abortControllers = useRef<{ [id: string]: AbortController }>({});
  const pausedUploads = useRef<{ [id: string]: boolean }>({});
  const activeChunks = useRef<{ [id: string]: Set<number> }>({});

  // Initialize WebSocket for progress tracking
  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: NodeJS.Timeout;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connectWs = () => {
      if (!isMounted) return;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "progress") {
            setProgress(prev => ({ ...prev, [data.upload_id]: { ...(prev[data.upload_id] || {}), ...data } }));
          } else if (data.type === "complete") {
            setProgress(prev => ({ 
              ...prev, 
              [data.upload_id]: { ...(prev[data.upload_id] || {}), ...data, progress: 100, completed: true } 
            }));
            setTimeout(() => {
              if (!isMounted) return;
              setProgress(prev => {
                const newObj = { ...prev };
                delete newObj[data.upload_id];
                return newObj;
              });
              onUploadComplete();
            }, 3000); // clear after 3 seconds
          }
        } catch (e) {
          console.error("WebSocket message error:", e);
        }
      };

      wsRef.current.onclose = () => {
        if (isMounted) {
          reconnectTimeout = setTimeout(connectWs, 2000);
        }
      };
    };

    connectWs();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        // Prevent onclose from triggering a reconnect
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [onUploadComplete]);

  const uploadFileChunks = async (file: File, relativePath: string) => {
    const CHUNK_SIZE = 1024 * 1024 * 10; // 10MB chunks for better speed
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const CONCURRENCY = 4; // Upload 4 chunks in parallel

    const controller = new AbortController();
    abortControllers.current[uploadId] = controller;
    pausedUploads.current[uploadId] = false;
    activeChunks.current[uploadId] = new Set();

    setProgress(prev => ({
      ...prev,
      [uploadId]: {
        upload_id: uploadId,
        filename: relativePath,
        progress: 0,
        uploaded: 0,
        total: file.size,
        status: 'uploading',
        speed: 0,
        eta: 0
      }
    }));

    let nextChunk = 0;
    const completedChunks = new Set<number>();
    let failed = false;

    const uploadWorker = async () => {
      while (nextChunk < totalChunks && !failed && !controller.signal.aborted) {
        // Handle pause
        if (pausedUploads.current[uploadId]) {
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        const chunkIndex = nextChunk++;
        activeChunks.current[uploadId].add(chunkIndex);
        
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append("file", chunk);
        formData.append("upload_id", uploadId);
        formData.append("chunk_index", chunkIndex.toString());
        formData.append("total_chunks", totalChunks.toString());
        formData.append("relative_path", relativePath);
        formData.append("total_size", file.size.toString());

        let retryCount = 0;
        let success = false;
        
        while (!success && retryCount < 3 && !controller.signal.aborted) {
          try {
            const res = await fetch("/api/upload/chunk", {
              method: "POST",
              body: formData,
              signal: controller.signal
            });
            if (!res.ok) throw new Error("Chunk upload failed");
            success = true;
            completedChunks.add(chunkIndex);
            activeChunks.current[uploadId].delete(chunkIndex);
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            retryCount++;
            await new Promise(r => setTimeout(r, 1000 * retryCount));
          }
        }

        if (!success && !controller.signal.aborted) {
          failed = true;
          setProgress(prev => ({
            ...prev,
            [uploadId]: { ...prev[uploadId], status: 'error', error: 'Upload failed after retries' }
          }));
        }
      }
    };

    // Start workers
    const workers = Array(Math.min(CONCURRENCY, totalChunks)).fill(null).map(() => uploadWorker());
    await Promise.all(workers);

    delete abortControllers.current[uploadId];
    delete pausedUploads.current[uploadId];
    delete activeChunks.current[uploadId];
  };

  const handlePause = (id: string) => {
    pausedUploads.current[id] = !pausedUploads.current[id];
    setProgress(prev => ({
      ...prev,
      [id]: { ...prev[id], status: pausedUploads.current[id] ? 'paused' : 'uploading' }
    }));
  };

  const handleCancel = async (id: string) => {
    if (abortControllers.current[id]) {
      abortControllers.current[id].abort();
    }
    
    // Notify backend to cleanup
    const formData = new FormData();
    formData.append("upload_id", id);
    fetch("/api/upload/cancel", { method: "POST", body: formData }).catch(() => {});

    setProgress(prev => {
      const newObj = { ...prev };
      delete newObj[id];
      return newObj;
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setUploading(true);
    
    // Process files sequentially to avoid overwhelming browser, 
    // but the backend can handle them async
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Try to get the relative path (if folder upload), otherwise use filename
      const relativePath = file.webkitRelativePath || file.name;
      await uploadFileChunks(file, relativePath);
    }
    
    setUploading(false);
    onUploadComplete();
  };

  const formatSize = (bytes?: any) => {
    try {
      if (bytes === undefined || bytes === null || isNaN(Number(bytes))) return '0 Bytes';
      const b = Number(bytes);
      if (b <= 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      if (isNaN(i) || i < 0) return '0 Bytes';
      return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + (sizes[i] || 'Bytes');
    } catch(e) {
      return '0 Bytes';
    }
  };

  const formatTime = (seconds?: any) => {
    try {
      if (seconds === undefined || seconds === null || isNaN(Number(seconds)) || seconds === Infinity) return 'Calculating...';
      const s = Number(seconds);
      if (s < 0) return 'Calculating...';
      if (s < 60) return `${Math.round(s)}s`;
      return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    } catch(e) {
      return 'Calculating...';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div 
        className={`glass-panel rounded-3xl p-12 text-center transition-all duration-300 border-2 ${
          isDragging ? 'border-neon-blue bg-white/5' : 'border-dashed border-white/20 hover:border-white/40'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex justify-center mb-6">
          <div className="p-6 rounded-full bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 text-white">
            <UploadCloud size={48} className="text-neon-blue drop-shadow-[0_0_15px_rgba(0,240,255,0.5)]" />
          </div>
        </div>
        
        <h3 className="text-2xl font-bold mb-2">Drag & Drop files here</h3>
        <p className="text-gray-400 mb-8">or choose a transfer method below</p>
        
        <div className="flex flex-wrap justify-center gap-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2 transition-all"
          >
            <FileUp size={20} className="text-neon-blue" />
            Upload Files
          </button>
          
          <button 
            onClick={() => folderInputRef.current?.click()}
            className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2 transition-all"
          >
            <FolderUp size={20} className="text-neon-purple" />
            Upload Folder
          </button>
        </div>

        <input 
          type="file" 
          multiple 
          ref={fileInputRef} 
          className="hidden" 
          onChange={(e) => handleFiles(e.target.files)} 
        />
        <input 
          type="file" 
          // @ts-ignore - webkitdirectory is non-standard but supported in all modern browsers
          webkitdirectory="true" 
          directory="true" 
          ref={folderInputRef} 
          className="hidden" 
          onChange={(e) => handleFiles(e.target.files)} 
        />
      </div>

      <AnimatePresence>
        {Object.keys(progress).length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {Object.values(progress).map((p: any) => {
              if (!p || typeof p !== 'object' || !p.upload_id) return null;
              const safeProgress = Math.min(100, Math.max(0, Number(p.progress) || 0));
              
              return (
              <div key={p.upload_id} className="glass-panel p-6 rounded-2xl relative overflow-hidden">
                <div 
                  className="absolute left-0 top-0 h-full bg-white/5 transition-all duration-300 ease-out"
                  style={{ width: `${safeProgress}%` }}
                />
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1 truncate pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      {p.completed ? (
                        <CheckCircle2 size={18} className="text-green-400" />
                      ) : (
                        <Loader2 size={18} className="text-neon-blue animate-spin" />
                      )}
                      <h4 className="font-medium text-white truncate">{p.filename || 'Unknown File'}</h4>
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatSize(p.uploaded)} / {formatSize(p.total)}
                    </div>
                  </div>
                  
                  {!p.completed && (
                    <div className="flex flex-row md:flex-col justify-between items-end gap-3">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handlePause(p.upload_id)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                          title={p.status === 'paused' ? 'Resume' : 'Pause'}
                        >
                          {p.status === 'paused' ? <Play size={16} /> : <Pause size={16} />}
                        </button>
                        <button 
                          onClick={() => handleCancel(p.upload_id)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                          title="Cancel"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="text-neon-blue font-mono text-sm">
                          {p.status === 'paused' ? 'PAUSED' : `${formatSize(p.speed)}/s`}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {p.status === 'paused' ? 'Waiting...' : `${formatTime(p.eta)} remaining`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="relative z-10 w-full h-1.5 bg-black/50 rounded-full mt-4 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-neon-blue to-neon-purple transition-all duration-300"
                    style={{ width: `${safeProgress}%` }}
                  />
                </div>
              </div>
            )})}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
