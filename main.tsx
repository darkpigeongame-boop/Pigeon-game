import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// --- TYPES ---
type MsgKind = "text" | "image" | "video" | "audio" | "file";
type Msg = {
  id: string;
  sender: string;
  text: string | null;
  kind: MsgKind;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  deleted: boolean;
  created_at: string;
};

const DEVICE_KEY = "darkpigeon_device_id";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// --- HELPERS ---
function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = "d_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function detectKind(file: File): MsgKind {
  const t = file.type;
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "file";
}

// --- MAIN CHAT COMPONENT ---
function SecretChat() {
  const [deviceId, setDeviceId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);

    supabase
      .from("secret_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("Load error:", error);
        else if (data) setMessages(data as Msg[]);
        setLoading(false);
      });

    const channel = supabase
      .channel("chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "secret_messages" }, 
      (payload) => {
        const m = payload.new as Msg;
        setMessages((prev) => [...prev, m]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from("secret_messages").insert({ sender: deviceId, text: input, kind: "text" });
    if (!error) setInput("");
    setSending(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0b141a] text-white">
      <header className="p-4 bg-[#202c33] shadow-md font-bold">🔒 Dark Pigeon Book</header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === deviceId ? "justify-end" : "justify-start"}`}>
            <div className={`p-3 rounded-lg max-w-[80%] ${m.sender === deviceId ? "bg-[#005c4b]" : "bg-[#202c33]"}`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={sendText} className="p-4 bg-[#202c33] flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message likhein..." className="bg-[#2a3942] border-none text-white" />
        <Button type="submit" disabled={sending}>Bhejein</Button>
      </form>
    </div>
  );
}

// --- RENDER ---
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SecretChat />
    </React.StrictMode>
  );
}
