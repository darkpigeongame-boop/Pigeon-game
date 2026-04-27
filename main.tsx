import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/secret-chat")({
  component: SecretChat,
});

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
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      "d_" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36).slice(-4);
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

function fmtSize(b: number | null) {
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function SecretChat() {
  const navigate = useNavigate();
  const [deviceId, setDeviceId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuFor, setMenuFor] = useState<Msg | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Init device + load + subscribe
  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);

    let mounted = true;
    supabase
      .from("secret_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) console.error("Load error:", error);
        else if (data) setMessages(data as Msg[]);
        setLoading(false);
      });

    const channel = supabase
      .channel("secret_messages_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "secret_messages" },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "secret_messages" },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
          );
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !deviceId) return;
    setSending(true);
    setInput("");
    const { error } = await supabase
      .from("secret_messages")
      .insert({ sender: deviceId, text, kind: "text" });
    if (error) {
      console.error("Send error:", error);
      setInput(text);
      alert("Message bhejne mein dikkat: " + error.message);
    }
    setSending(false);
  };

  const handleFile = async (file: File | undefined | null) => {
    setShowAttach(false);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert("File 20 MB se choti honi chahiye");
      return;
    }
    setUploading(true);
    try {
      const kind = detectKind(file);
      const ext = file.name.split(".").pop() || "bin";
      const path = `${deviceId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-files")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("chat-files")
        .getPublicUrl(path);
      const { error: insErr } = await supabase.from("secret_messages").insert({
        sender: deviceId,
        text: null,
        kind,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_size: file.size,
      });
      if (insErr) throw insErr;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", err);
      alert("Upload fail: " + msg);
    } finally {
      setUploading(false);
    }
  };

  const startLongPress = (m: Msg) => {
    if (m.deleted) return;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      setMenuFor(m);
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const copyMsg = async (m: Msg) => {
    setMenuFor(null);
    const txt = m.text || m.file_url || "";
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const deleteForMe = (m: Msg) => {
    setMenuFor(null);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    // Track locally so re-fetch doesn't bring it back
    const hidden = JSON.parse(
      localStorage.getItem("darkpigeon_hidden_msgs") || "[]",
    ) as string[];
    if (!hidden.includes(m.id)) {
      hidden.push(m.id);
      localStorage.setItem("darkpigeon_hidden_msgs", JSON.stringify(hidden));
    }
  };

  const unsendForAll = async (m: Msg) => {
    setMenuFor(null);
    if (m.sender !== deviceId) return;
    const { error } = await supabase
      .from("secret_messages")
      .update({ deleted: true })
      .eq("id", m.id);
    if (error) {
      console.error("Unsend error:", error);
      alert("Unsend fail: " + error.message);
    }
  };

  // Filter locally hidden
  const hiddenIds = (() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      return new Set<string>(
        JSON.parse(localStorage.getItem("darkpigeon_hidden_msgs") || "[]"),
      );
    } catch {
      return new Set<string>();
    }
  })();
  const visibleMessages = messages.filter((m) => !hiddenIds.has(m.id));

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const exitToGame = () => navigate({ to: "/" });

  return (
    <div className="min-h-screen flex flex-col bg-[#0b141a] relative">
      {/* Header */}
      <header className="bg-[#202c33] text-white px-3 py-2.5 flex items-center gap-3 shadow-md sticky top-0 z-10">
        <button
          onClick={exitToGame}
          className="text-white/80 hover:text-white text-2xl px-1"
          aria-label="Back"
        >
          ←
        </button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-lg shadow shrink-0">
          🔒
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate leading-tight">Secret Chat</p>
          <p className="text-[11px] text-emerald-300/80 truncate leading-tight">
            end-to-end • online
          </p>
        </div>
        <button className="text-white/70 hover:text-white text-xl px-2" title="Video call">
          📹
        </button>
        <button className="text-white/70 hover:text-white text-xl px-2" title="Voice call">
          📞
        </button>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 pb-24"
        style={{
          backgroundColor: "#0b141a",
          backgroundImage:
            "radial-gradient(circle at 20% 10%, rgba(16,185,129,0.06) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(16,185,129,0.05) 0, transparent 40%)",
        }}
      >
        {loading && (
          <p className="text-center text-white/40 text-sm mt-10">
            Messages load ho rahe hain…
          </p>
        )}
        {!loading && visibleMessages.length === 0 && (
          <div className="text-center mt-12">
            <div className="inline-block bg-yellow-900/30 text-yellow-200 text-xs px-4 py-2 rounded-lg border border-yellow-700/30">
              🔒 Yeh chat sirf aap dono ke beech hai. Pehla message bhejen.
            </div>
          </div>
        )}
        {visibleMessages.map((m, i) => {
          const isMe = m.sender === deviceId;
          const prev = visibleMessages[i - 1];
          const showGap = !prev || prev.sender !== m.sender;
          const bubbleBase = `max-w-[80%] px-2 py-1.5 rounded-lg shadow-sm whitespace-pre-wrap break-words cursor-pointer select-none ${
            isMe
              ? "bg-[#005c4b] text-white rounded-br-sm"
              : "bg-[#202c33] text-white rounded-bl-sm"
          }`;
          return (
            <div
              key={m.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"} ${showGap ? "mt-2" : ""}`}
            >
              <div
                className={bubbleBase}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!m.deleted) setMenuFor(m);
                }}
                onTouchStart={() => startLongPress(m)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onMouseDown={() => startLongPress(m)}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
              >
                {m.deleted ? (
                  <p className="italic text-white/50 text-sm pr-12 inline">
                    🚫 Yeh message delete kar diya gaya
                  </p>
                ) : (
                  <>
                    {m.kind === "image" && m.file_url && (
                      <a
                        href={m.file_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <img
                          src={m.file_url}
                          alt="sent"
                          className="rounded-md max-w-[260px] max-h-[320px] object-cover mb-1"
                          loading="lazy"
                        />
                      </a>
                    )}
                    {m.kind === "video" && m.file_url && (
                      <video
                        src={m.file_url}
                        controls
                        className="rounded-md max-w-[260px] max-h-[320px] mb-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {m.kind === "audio" && m.file_url && (
                      <audio
                        src={m.file_url}
                        controls
                        className="mb-1 max-w-[240px]"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {m.kind === "file" && m.file_url && (
                      <a
                        href={m.file_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 bg-black/30 rounded-md px-2 py-2 mb-1 hover:bg-black/40"
                      >
                        <span className="text-2xl">📄</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">
                            {m.file_name || "File"}
                          </span>
                          <span className="block text-[11px] text-white/60">
                            {fmtSize(m.file_size)}
                          </span>
                        </span>
                        <span className="text-white/70 text-lg">⬇</span>
                      </a>
                    )}
                    {m.text && (
                      <p className="leading-snug pr-12 inline text-[15px]">
                        {m.text}
                      </p>
                    )}
                    <span className="text-[10px] text-white/50 float-right mt-1 ml-2 leading-snug">
                      {formatTime(m.created_at)}
                      {isMe && <span className="text-sky-300 ml-0.5">✓✓</span>}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {uploading && (
          <div className="text-center text-white/60 text-xs mt-2">
            📤 File upload ho rahi hai…
          </div>
        )}
      </div>

      {/* Attach menu */}
      {showAttach && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setShowAttach(false)}
        >
          <div
            className="absolute bottom-20 left-3 bg-[#233138] rounded-2xl shadow-2xl p-2 grid grid-cols-3 gap-2 w-[calc(100%-1.5rem)] max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <AttachBtn
              icon="🖼️"
              label="Photo"
              color="bg-purple-600"
              onClick={() => imgInputRef.current?.click()}
            />
            <AttachBtn
              icon="🎬"
              label="Video"
              color="bg-pink-600"
              onClick={() => vidInputRef.current?.click()}
            />
            <AttachBtn
              icon="📄"
              label="Document"
              color="bg-blue-600"
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={vidInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {/* Long-press action menu */}
      {menuFor && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setMenuFor(null)}
        >
          <div
            className="bg-[#233138] rounded-xl shadow-2xl w-full max-w-xs overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => copyMsg(menuFor)}
              className="w-full text-left px-5 py-3.5 text-white hover:bg-white/10 border-b border-white/10 flex items-center gap-3"
            >
              <span className="text-xl">📋</span> Copy
            </button>
            <button
              onClick={() => deleteForMe(menuFor)}
              className="w-full text-left px-5 py-3.5 text-white hover:bg-white/10 border-b border-white/10 flex items-center gap-3"
            >
              <span className="text-xl">🗑️</span> Delete (sirf mere liye)
            </button>
            {menuFor.sender === deviceId && (
              <button
                onClick={() => unsendForAll(menuFor)}
                className="w-full text-left px-5 py-3.5 text-red-400 hover:bg-red-500/10 flex items-center gap-3"
              >
                <span className="text-xl">↩️</span> Unsend (dono ke liye)
              </button>
            )}
            <button
              onClick={() => setMenuFor(null)}
              className="w-full text-center px-5 py-3 text-white/60 hover:bg-white/5 border-t border-white/10 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <form
        onSubmit={sendText}
        className="bg-[#0b141a] px-2 py-2 flex items-end gap-2 sticky bottom-0 z-20"
      >
        <button
          type="button"
          onClick={() => setShowAttach((v) => !v)}
          className="h-11 w-11 rounded-full bg-[#2a3942] text-white text-xl flex items-center justify-center shrink-0 hover:bg-[#34464f]"
          aria-label="Attach"
        >
          📎
        </button>
        <div className="flex-1 flex items-center gap-1 bg-[#2a3942] rounded-full px-3 py-1.5">
          <span className="text-white/50 text-lg">😊</span>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message"
            className="flex-1 bg-transparent border-none text-white placeholder:text-white/50 h-9 px-1 focus-visible:ring-0 shadow-none"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={sending || !input.trim()}
          className="rounded-full h-11 w-11 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shrink-0 disabled:opacity-60"
        >
          ➤
        </Button>
      </form>

      {/* RED EXIT BUTTON — bottom-left, always visible */}
      <button
        onClick={exitToGame}
        className="fixed bottom-20 left-3 z-30 h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-white text-2xl shadow-2xl border-2 border-white/20 flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Game pe wapas jaayein"
        title="Game pe wapas"
      >
        🎮
      </button>
    </div>
  );
}

function AttachBtn({
  icon,
  label,
  color,
  onClick,
}: {
  icon: string;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl hover:bg-white/5"
    >
      <span
        className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-2xl shadow-lg`}
      >
        {icon}
      </span>
      <span className="text-white text-xs">{label}</span>
    </button>
  );
      }
    
