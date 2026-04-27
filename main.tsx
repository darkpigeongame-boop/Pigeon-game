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

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = "d_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// --- APP COMPONENT ---
function SecretChat() {
  const [deviceId, setDeviceId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);

    supabase
      .from("secret_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setMessages(data as Msg[]);
        setLoading(false);
      });

    const channel = supabase.channel("realtime").on("postgres_changes", 
      { event: "INSERT", schema: "public", table: "secret_messages" }, 
      (payload) => {
        setMessages((prev) => [...prev, payload.new as Msg]);
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const textToSend = input;
    setInput("");
    await supabase.from("secret_messages").insert({ sender: deviceId, text: textToSend, kind: "text" });
  };

  return (
    <div className="flex flex-col h-screen bg-[#0b141a] text-white font-sans">
      <header className="p-4 bg-[#202c33] flex items-center gap-3 shadow-lg">
        <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">🔒</div>
        <div>
          <p className="font-bold">Secret Chat</p>
          <p className="text-xs text-emerald-400">online</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === deviceId ? "justify-end" : "justify-start"}`}>
            <div className={`p-2.5 rounded-lg max-w-[85%] ${m.sender === deviceId ? "bg-[#005c4b]" : "bg-[#202c33]"}`}>
              <p className="text-[15px]">{m.text}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendText} className="p-3 bg-[#202c33] flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message..." className="bg-[#2a3942] border-none text-white rounded-full" />
        <Button type="submit" className="rounded-full bg-emerald-600">➤</Button>
      </form>
    </div>
  );
}

// --- RENDER ---
const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<SecretChat />);
}
