"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, FileText, Download, ChevronRight, CornerUpLeft, Loader2, Send } from "lucide-react";

interface FileItem {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
}

interface FileListProps {
  refreshTrigger: number;
  clients?: any[];
  onPushFile?: (path: string, clientId: string) => void;
}

export default function FileList({ refreshTrigger, clients, onPushFile }: FileListProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pushModalItem, setPushModalItem] = useState<FileItem | null>(null);

  const fetchFiles = async (path: string = "") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setItems(data.items || []);
      setCurrentPath(path);
    } catch (err) {
      setError("Unable to load directory contents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, refreshTrigger]);

  const handleNavigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.join("/"));
  };

  const handleDownload = (path: string) => {
    window.location.href = `/api/download?path=${encodeURIComponent(path)}`;
  };

  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="glass-panel rounded-3xl overflow-hidden flex flex-col h-[500px]">
      <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleNavigateUp}
            disabled={!currentPath || loading}
            className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <CornerUpLeft size={20} />
          </button>
          
          <div className="flex items-center text-sm font-medium text-gray-300">
            <span className="text-neon-blue cursor-pointer" onClick={() => setCurrentPath("")}>
              Root
            </span>
            {currentPath && (
              <>
                <ChevronRight size={16} className="mx-2 text-gray-600" />
                <span className="text-white truncate max-w-[200px]">
                  {currentPath.split('/').pop()}
                </span>
              </>
            )}
          </div>
        </div>
        
        {loading && <Loader2 size={18} className="animate-spin text-neon-purple" />}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error ? (
          <div className="h-full flex items-center justify-center text-red-400">
            {error}
          </div>
        ) : items.length === 0 && !loading ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            This folder is empty
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
              {items.map((item) => (
                <motion.div
                  key={item.path}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ scale: 1.02 }}
                  className="group relative flex items-center gap-4 p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all cursor-pointer"
                  onClick={() => item.type === 'folder' ? setCurrentPath(item.path) : null}
                >
                  <div className={`p-3 rounded-lg ${
                    item.type === 'folder' 
                      ? 'bg-neon-purple/10 text-neon-purple' 
                      : 'bg-neon-blue/10 text-neon-blue'
                  }`}>
                    {item.type === 'folder' ? <Folder size={24} /> : <FileText size={24} />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      {item.type === 'folder' ? 'Folder' : formatSize(item.size)}
                    </p>
                  </div>
                  
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all focus-within:opacity-100">
                    {clients && clients.length > 0 && onPushFile && item.type === 'file' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setPushModalItem(item); }}
                        className="p-2 rounded-full hover:bg-white/10 text-neon-blue transition-all" 
                        title="Push to Device"
                      >
                        <Send size={18} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(item.path);
                      }}
                      className="p-2 rounded-full hover:bg-white/10 text-white transition-all"
                      title={`Download ${item.name}`}
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Push File Modal */}
      <AnimatePresence>
        {pushModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-gray-900 border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue to-neon-purple" />
              
              <h3 className="text-lg font-semibold text-white mb-2">Send to Device</h3>
              <p className="text-sm text-gray-400 mb-6 truncate flex items-center gap-2">
                <FileText size={16} className="text-neon-blue" />
                {pushModalItem.name}
              </p>
              
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {clients?.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (onPushFile) onPushFile(pushModalItem.path, c.id);
                      setPushModalItem(null);
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all text-left group"
                  >
                    <span className="text-white font-medium truncate">{c.device_name}</span>
                    <Send size={16} className="text-gray-500 group-hover:text-neon-blue transition-colors" />
                  </button>
                ))}
              </div>
              
              <button 
                onClick={() => setPushModalItem(null)}
                className="w-full mt-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition-all"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
