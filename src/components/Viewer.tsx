import React, { useState, useEffect, useRef } from "react";
import YouTube, { YouTubeEvent, YouTubePlayer } from "react-youtube";
import { socket } from "../lib/socket";
import { VideoState, Subtitle } from "../types";
import { Play, Pause, Settings, Volume2, Maximize2, SkipBack, SkipForward, Users, MessageCircle, BookOpen, Search } from "lucide-react";
import { Link, useParams, useLocation } from "react-router-dom";

export default function Viewer() {
  const { roomId = "default" } = useParams();
  const location = useLocation();
  const userName = location.state?.name || "익명 성도";
  const initialRoleHost = location.state?.isHost || false;

  const [videoState, setVideoState] = useState<VideoState | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isHost, setIsHost] = useState(initialRoleHost);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  
  const [activeTab, setActiveTab] = useState<"chat" | "bible">("chat");
  const [bibleVerses, setBibleVerses] = useState<any[][]>([]);
  const [bibleError, setBibleError] = useState("");
  const [selectedBook, setSelectedBook] = useState<string>("");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [startVerse, setStartVerse] = useState<string>("");
  const [endVerse, setEndVerse] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [participantsCount, setParticipantsCount] = useState(1);

  const timerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const extractYouTubeId = (urlOrId: string) => {
    if (urlOrId.length === 11 && !urlOrId.includes("://")) {
      return urlOrId;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = urlOrId.match(regExp);
    return (match && match[2].length === 11) ? match[2] : urlOrId;
  };

  const handleUpdateVideo = async () => {
    if (!newVideoUrl) return;
    const parsedId = extractYouTubeId(newVideoUrl);
    try {
      await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, videoId: parsedId, title: newVideoTitle || "새로운 영상" })
      });
      setNewVideoUrl("");
      setNewVideoTitle("");
    } catch (e) {
      console.error("Failed to update video", e);
    }
  };

  const fetchBible = async () => {
    try {
      const res = await fetch(`/api/bible?roomId=${encodeURIComponent(roomId)}`);
      const data = await res.json();
      if (res.ok) {
        setBibleVerses(data.values || []);
        setBibleError("");
      } else {
        setBibleError(data.error || "성경 데이터를 불러오지 못했습니다.");
      }
    } catch (e) {
      setBibleError("서버 오류로 성경 데이터를 불러오지 못했습니다.");
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    socket.emit("chat:message", { roomId, text: newMessage, author: userName });
    setNewMessage("");
  };

  // Initial fetch and socket setup
  useEffect(() => {
    fetch(`/api/state?roomId=${encodeURIComponent(roomId)}`)
      .then((res) => res.json())
      .then((data) => {
        setVideoState(data.currentVideo);
        setSubtitles(data.subtitles);
        setMessages(data.messages || []);
      });

    fetchBible();

    socket.connect();
    
    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join:room", roomId);
    });
    socket.on("disconnect", () => setIsConnected(false));
    
    socket.on("video:change", (state: VideoState) => setVideoState(state));
    
    socket.on("video:sync", (state: VideoState) => {
      setVideoState(state);
      if (!isHost && player) {
        player.seekTo(state.currentTime);
        if (state.status === "playing") {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      }
    });

    socket.on("video:play", (state: VideoState) => {
      setVideoState(state);
      if (!isHost && player) {
        player.seekTo(state.currentTime);
        player.playVideo();
      }
    });
    socket.on("video:pause", (state: VideoState) => {
      setVideoState(state);
      if (!isHost && player) {
        player.seekTo(state.currentTime);
        player.pauseVideo();
      }
    });
    socket.on("video:seek", (state: VideoState) => {
      setVideoState(state);
      if (!isHost && player) {
        player.seekTo(state.currentTime);
      }
    });
    
    socket.on("subtitles:update", (newSubs: Subtitle[]) => {
      setSubtitles(newSubs);
    });

    socket.on("chat:message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("room:participants", (count: number) => {
      setParticipantsCount(count);
    });

    return () => {
      socket.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [player, isHost, roomId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Update current time continuously
  useEffect(() => {
    if (player) {
      timerRef.current = window.setInterval(async () => {
        const time = await player.getCurrentTime();
        if (time !== undefined) {
          setCurrentTime(time);
        }
      }, 100);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [player]);

  const onReady = (event: YouTubeEvent) => {
    setPlayer(event.target);
    // Initial sync
    if (videoState) {
      event.target.seekTo(videoState.currentTime);
      if (videoState.status === "playing") {
        event.target.playVideo();
      } else {
        event.target.pauseVideo();
      }
    }
  };

  const onStateChange = (event: YouTubeEvent) => {
    if (!isHost) return; // Only host dictates state changes

    const time = event.target.getCurrentTime();
    // YouTube Player States: 1 = Playing, 2 = Paused
    if (event.data === 1) {
      socket.emit("host:play", { roomId, currentTime: time });
    } else if (event.data === 2) {
      socket.emit("host:pause", { roomId, currentTime: time });
    }
  };

  const seekHost = (seconds: number) => {
    if (!isHost || !player) return;
    const newTime = currentTime + seconds;
    player.seekTo(newTime);
    socket.emit("host:seek", { roomId, currentTime: newTime });
  };

  const isSearching = searchQuery.trim().length >= 2;
  const hasSelection = isSearching || (selectedBook && selectedChapter);
  
  let filteredVerses: any[][] = [];
  if (isSearching) {
    filteredVerses = bibleVerses.slice(1).filter(row => {
      const text = row[4] ? String(row[4]) : "";
      return text.includes(searchQuery.trim());
    }).slice(0, 100);
  } else if (selectedBook && selectedChapter) {
    filteredVerses = bibleVerses.slice(1).filter(row => {
      const bookMatch = String(row[0]) === String(selectedBook);
      const chapterMatch = String(row[2]) === String(selectedChapter);
      let verseMatch = true;
      if (startVerse && endVerse) {
        const verseNum = parseInt(String(row[3]), 10);
        const startNum = parseInt(startVerse, 10);
        const endNum = parseInt(endVerse, 10);
        verseMatch = !isNaN(verseNum) && !isNaN(startNum) && !isNaN(endNum) && verseNum >= startNum && verseNum <= endNum;
      } else if (startVerse) {
        verseMatch = String(row[3]) === String(startVerse);
      }
      return bookMatch && chapterMatch && verseMatch;
    });
  }

  return (
    <div className="h-screen overflow-hidden bg-[var(--color-milk-bg)] text-[var(--color-milk-text)] font-sans flex flex-col">
      {/* Top Navbar */}
      <header className="px-6 h-16 flex items-center justify-between border-b border-[var(--color-milk-border)] bg-[var(--color-milk-bg)] sticky top-0 z-50 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[var(--color-milk-accent)] rounded-lg flex items-center justify-center">
              <div className="w-3 h-3 bg-[var(--color-milk-bg)] rounded-full" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-semibold tracking-tight leading-none">밀크 테이블</h1>
                <div className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider flex items-center space-x-1 border ${isConnected ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                  <div className={`w-1 h-1 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span>{isConnected ? "동기화" : "끊김"}</span>
                </div>
              </div>
              <p className="text-[10px] text-[var(--color-milk-muted)] mt-1 hidden md:block italic">
                "두세 사람이 내 이름으로 모인 곳에는 나도 그들 중에 있느니라" <span className="font-bold non-italic">(Matthew 18: 20)</span>
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-sm text-[var(--color-milk-muted)] bg-[var(--color-milk-bg)] px-3 py-1.5 rounded-lg border border-[var(--color-milk-border)]">
            <Users className="w-4 h-4" />
            <span className="font-medium">{roomId} (접속: {participantsCount}명)</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-[var(--color-milk-muted)]">{userName}</span>
            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isHost ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
              {isHost ? '방장' : '시청자'}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row p-6 lg:p-8 gap-6 max-w-screen-2xl mx-auto w-full min-h-0">
        
        {/* Left Column: Video */}
        <div className="w-full lg:flex-1 flex flex-col space-y-6 overflow-y-auto pr-2 scrollbar-hide min-h-0">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border-4 border-[var(--color-milk-border)] shadow-2xl flex items-center justify-center shrink-0">
            {videoState?.videoId ? (
              <YouTube
                videoId={videoState.videoId}
                opts={{
                  width: '100%',
                  height: '100%',
                  playerVars: {
                    autoplay: 0,
                    controls: isHost ? 1 : 0, // Only host gets native controls
                    disablekb: isHost ? 0 : 1, // Disable keyboard for viewers
                    modestbranding: 1,
                    rel: 0,
                  },
                }}
                onReady={onReady}
                onStateChange={onStateChange}
                className="absolute inset-0 w-full h-full"
                iframeClassName="w-full h-full"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center flex-col text-[var(--color-milk-muted)] space-y-4">
                <Play className="w-12 h-12 opacity-50" />
                <p>방장이 설교를 시작하기를 기다리고 있습니다...</p>
              </div>
            )}
            
            {/* Viewer Overlay to prevent interaction if not host */}
            {!isHost && videoState?.videoId && (
              <div className="absolute inset-0 z-10 cursor-default" />
            )}
          </div>
          
          <div className="shrink-0 pb-6">
            <h2 className="text-2xl font-medium tracking-tight text-[var(--color-milk-text)]">
              {videoState?.title || "제목 없는 영상"}
            </h2>
            
            <div className="mt-4 flex flex-col space-y-4 p-4 bg-[var(--color-milk-panel)] rounded-xl border border-[var(--color-milk-border)] shadow-sm">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-milk-muted)]">영상 변경</span>
                </div>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    placeholder="영상 제목 (선택)" 
                    className="w-1/3 px-3 py-2 text-sm border border-[var(--color-milk-border)] rounded-lg outline-none focus:ring-2 focus:ring-[var(--color-milk-accent)] bg-[var(--color-milk-bg)]"
                    value={newVideoTitle}
                    onChange={(e) => setNewVideoTitle(e.target.value)}
                  />
                  <input 
                    type="text" 
                    placeholder="유튜브 링크 또는 ID 입력..." 
                    className="flex-1 px-3 py-2 text-sm border border-[var(--color-milk-border)] rounded-lg outline-none focus:ring-2 focus:ring-[var(--color-milk-accent)] bg-[var(--color-milk-bg)]"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                  />
                  <button onClick={handleUpdateVideo} className="px-4 py-2 bg-[var(--color-milk-text)] text-[var(--color-milk-bg)] text-sm font-medium rounded-lg hover:bg-[var(--color-milk-dark)] transition-colors shrink-0">
                    변경하기
                  </button>
                </div>
              </div>
              
              {isHost && (
                <div className="flex items-center space-x-3 pt-4 border-t border-[var(--color-milk-border)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-milk-muted)] mr-2">방장 컨트롤:</span>
                  <button 
                    onClick={() => seekHost(-10)}
                    className="p-2 bg-[var(--color-milk-bg)] border border-[var(--color-milk-border)] text-[var(--color-milk-dark)] rounded-lg hover:bg-[var(--color-milk-panel)] transition"
                    title="10초 뒤로"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => seekHost(10)}
                    className="p-2 bg-[var(--color-milk-bg)] border border-[var(--color-milk-border)] text-[var(--color-milk-dark)] rounded-lg hover:bg-[var(--color-milk-panel)] transition"
                    title="10초 앞으로"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <div className="text-[10px] text-[var(--color-milk-muted)] uppercase tracking-wider ml-auto">
                    시청자는 자동으로 동기화됩니다
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Chat & Bible */}
        <div className="flex-1 flex flex-col bg-[var(--color-milk-bg)] rounded-2xl border border-[var(--color-milk-border)] shadow-sm overflow-hidden h-[400px] lg:h-full">
          {/* Tab Header */}
          <div className="flex border-b border-[var(--color-milk-border)] bg-[var(--color-milk-panel)] shrink-0">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center space-x-2 py-4 text-xs font-bold uppercase tracking-wider transition-colors ${
                activeTab === "chat" 
                  ? "text-[var(--color-milk-text)] border-b-2 border-[var(--color-milk-text)]" 
                  : "text-[var(--color-milk-muted)] hover:text-[var(--color-milk-dark)]"
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>나눔 및 Q&A</span>
            </button>
            <button
              onClick={() => setActiveTab("bible")}
              className={`flex-1 flex items-center justify-center space-x-2 py-4 text-xs font-bold uppercase tracking-wider transition-colors ${
                activeTab === "bible" 
                  ? "text-[var(--color-milk-text)] border-b-2 border-[var(--color-milk-text)]" 
                  : "text-[var(--color-milk-muted)] hover:text-[var(--color-milk-dark)]"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>성경 보기</span>
            </button>
          </div>
          
          {/* Content Area */}
          {activeTab === "chat" ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth scrollbar-hide" id="chat-container">
                {messages.length > 0 ? (
                  messages.map((msg) => (
                    <div key={msg.id} className="space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-bold text-[var(--color-milk-dark)]">{msg.author}</span>
                        <span className="text-[10px] text-[var(--color-milk-muted)]">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="bg-[var(--color-milk-panel)] border border-[var(--color-milk-border)] p-3 rounded-xl rounded-tl-none inline-block max-w-[90%]">
                        <p className="text-sm text-[var(--color-milk-text)] break-keep leading-relaxed">{msg.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-[var(--color-milk-muted)]">
                    <p className="text-sm break-keep">아직 나누어진 은혜가 없습니다.<br/>첫 번째로 질문이나 소감을 남겨보세요.</p>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              
              <div className="p-4 border-t border-[var(--color-milk-border)] bg-[var(--color-milk-bg)] shrink-0">
                <form onSubmit={handleSendMessage} className="flex space-x-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="질문이나 은혜를 나누어주세요..."
                    className="flex-1 px-4 py-3 bg-[var(--color-milk-bg)] border border-[var(--color-milk-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-milk-accent)] focus:border-transparent outline-none transition-all text-sm"
                  />
                  <button
                    type="submit"
                    className="px-5 py-3 bg-[var(--color-milk-text)] text-[var(--color-milk-bg)] font-medium text-sm rounded-xl hover:bg-[var(--color-milk-dark)] transition-colors shadow-sm"
                  >
                    전송
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 bg-[var(--color-milk-bg)] scrollbar-hide flex flex-col">
              {bibleError ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3">
                  <BookOpen className="w-8 h-8 text-[var(--color-milk-muted)] opacity-50" />
                  <p className="text-sm text-[var(--color-milk-muted)] break-keep">{bibleError}</p>
                </div>
              ) : bibleVerses.length > 0 ? (
                <div className="flex flex-col h-full pb-6">
                  <div className="flex flex-col space-y-3 mb-4 shrink-0 bg-[var(--color-milk-panel)] p-3 rounded-xl border border-[var(--color-milk-border)]">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-milk-muted)]" />
                      <input 
                        type="text"
                        placeholder="말씀 내용으로 검색 (2글자 이상)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-[var(--color-milk-border)] rounded-lg bg-[var(--color-milk-bg)] outline-none focus:ring-2 focus:ring-[var(--color-milk-accent)] transition-all"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select 
                        value={selectedBook}
                        onChange={(e) => {
                          setSelectedBook(e.target.value);
                          setSelectedChapter("");
                          setStartVerse("");
                          setEndVerse("");
                          setSearchQuery("");
                        }}
                        className="min-w-[100px] flex-1 px-3 py-2 text-sm border border-[var(--color-milk-border)] rounded-lg bg-[var(--color-milk-bg)] outline-none focus:ring-2 focus:ring-[var(--color-milk-accent)] transition-all"
                      >
                        <option value="">📖 책 선택</option>
                        {Array.from(new Set(bibleVerses.slice(1).map(row => row[0]).filter(Boolean))).map(b => (
                          <option key={b as string} value={b as string}>{b as string}</option>
                        ))}
                      </select>
                      <select 
                        value={selectedChapter}
                        onChange={(e) => {
                          setSelectedChapter(e.target.value);
                          setStartVerse("");
                          setEndVerse("");
                          setSearchQuery("");
                        }}
                        disabled={!selectedBook}
                        className="flex-1 min-w-[70px] px-2 py-2 text-sm border border-[var(--color-milk-border)] rounded-lg bg-[var(--color-milk-bg)] outline-none focus:ring-2 focus:ring-[var(--color-milk-accent)] disabled:opacity-50 transition-all"
                      >
                        <option value="">장</option>
                        {selectedBook && Array.from(new Set(bibleVerses.slice(1).filter(row => String(row[0]) === String(selectedBook)).map(row => String(row[2])).filter(Boolean))).map(c => (
                          <option key={c} value={c}>{c}장</option>
                        ))}
                      </select>
                      <select 
                        value={startVerse}
                        onChange={(e) => {
                          setStartVerse(e.target.value);
                          setSearchQuery("");
                          if (endVerse && parseInt(e.target.value, 10) > parseInt(endVerse, 10)) {
                            setEndVerse("");
                          }
                        }}
                        disabled={!selectedChapter}
                        className="flex-1 min-w-[80px] px-2 py-2 text-sm border border-[var(--color-milk-border)] rounded-lg bg-[var(--color-milk-bg)] outline-none focus:ring-2 focus:ring-[var(--color-milk-accent)] disabled:opacity-50 transition-all"
                      >
                        <option value="">시작절</option>
                        {selectedChapter && Array.from(new Set(bibleVerses.slice(1).filter(row => String(row[0]) === String(selectedBook) && String(row[2]) === String(selectedChapter)).map(row => String(row[3])).filter(Boolean))).map(v => (
                          <option key={v} value={v}>{v}절</option>
                        ))}
                      </select>
                      <span className="text-[var(--color-milk-muted)] self-center">-</span>
                      <select 
                        value={endVerse}
                        onChange={(e) => {
                          setEndVerse(e.target.value);
                          setSearchQuery("");
                        }}
                        disabled={!startVerse}
                        className="flex-1 min-w-[80px] px-2 py-2 text-sm border border-[var(--color-milk-border)] rounded-lg bg-[var(--color-milk-bg)] outline-none focus:ring-2 focus:ring-[var(--color-milk-accent)] disabled:opacity-50 transition-all"
                      >
                        <option value="">끝절</option>
                        {selectedChapter && startVerse && Array.from(new Set<string>(bibleVerses.slice(1).filter(row => String(row[0]) === String(selectedBook) && String(row[2]) === String(selectedChapter)).map(row => String(row[3])).filter(Boolean) as string[]))
                          .filter((v: string) => parseInt(v, 10) >= parseInt(startVerse, 10))
                          .map((v: string) => (
                          <option key={v} value={v}>{v}절</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {!hasSelection ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center text-[var(--color-milk-muted)] py-10">
                      <BookOpen className="w-8 h-8 mb-3 opacity-20" />
                      <p className="text-sm break-keep">위에서 읽으실 성경 책과 장을 선택하거나,<br/>말씀 내용으로 검색해보세요.</p>
                    </div>
                  ) : filteredVerses.length > 0 ? (
                    <div className="space-y-4 overflow-y-auto pr-2 flex-1 scrollbar-hide">
                      {isSearching && (
                        <p className="text-xs text-[var(--color-milk-muted)] mb-2">
                          검색 결과 {filteredVerses.length}건 (최대 100건 표시)
                        </p>
                      )}
                      {filteredVerses.map((row, i) => {
                        const bookKr = row[0];
                        const bookEn = row[1];
                        const chapter = row[2];
                        const verse = row[3];
                        const text = row[4];
                        
                        if (!text) return null;

                        return (
                          <div key={i} className="flex items-start space-x-4 group hover:bg-[var(--color-milk-panel)] p-3 -mx-3 rounded-xl transition-colors">
                            <div className="shrink-0 w-24 pt-1">
                              <div className="text-xs font-bold text-[var(--color-milk-muted)] uppercase tracking-wider" title={bookEn}>{bookKr}</div>
                              <div className="text-sm font-semibold text-[var(--color-milk-dark)] mt-1">{chapter}:{verse}</div>
                            </div>
                            <p className="text-base md:text-lg leading-relaxed text-[var(--color-milk-text)] break-keep font-medium">
                              {text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-center text-[var(--color-milk-muted)] py-10">
                      <p className="text-sm">결과가 없습니다.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className="text-sm text-[var(--color-milk-muted)]">성경 데이터를 불러오는 중입니다...</p>
                </div>
              )}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
