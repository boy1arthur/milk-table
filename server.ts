import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import { google } from "googleapis";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // --- IN-MEMORY STORAGE (No external database used) ---
  const rooms = new Map<string, any>();
  const getRoom = (roomId: string) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        currentVideo: {
          videoId: "W6NZfCO5SIk", // Default video (e.g., sample video)
          title: "샘플 설교",
          status: "paused", // 'playing' | 'paused'
          currentTime: 0,
          timestamp: Date.now()
        },
        subtitles: [
          { id: 1, startTime: 0, endTime: 5, text: "밀크 테이블에 오신 것을 환영합니다." },
          { id: 2, startTime: 5, endTime: 12, text: "이곳은 생명의 양식을 함께 나누는 공간입니다." },
          { id: 3, startTime: 12, endTime: 18, text: "설교를 함께 보며 우리의 마음과 생각이 하나로 맞춰집니다." },
          { id: 4, startTime: 18, endTime: 25, text: "초대 교회처럼 우리는 말씀 주위로 모입니다." },
          { id: 5, startTime: 25, endTime: 35, text: "이 함께하는 시간이 여러분 모두에게 축복이 되기를 바랍니다." }
        ],
        messages: [],
        sheetConfig: {
          spreadsheetId: "1QnbkDS2rmBzDaM9KRONvDmyG4UCFfu06oV4gPDqSLfw",
          range: "Sheet1!A:E"
        }
      });
    }
    return rooms.get(roomId);
  };

  // API Routes
  app.get("/api/state", (req, res) => {
    const roomId = (req.query.roomId as string) || "default";
    res.json(getRoom(roomId));
  });

  app.post("/api/video", (req, res) => {
    const { roomId = "default", videoId, title } = req.body;
    const room = getRoom(roomId);
    if (videoId) {
      room.currentVideo.videoId = videoId;
      if (title) room.currentVideo.title = title;
      room.currentVideo.status = "paused";
      room.currentVideo.currentTime = 0;
      room.currentVideo.timestamp = Date.now();
      
      io.to(roomId).emit("video:change", room.currentVideo);
    }
    res.json({ success: true, currentVideo: room.currentVideo });
  });

  app.post("/api/subtitles", (req, res) => {
    const { roomId = "default", newSubtitles } = req.body;
    const room = getRoom(roomId);
    if (Array.isArray(newSubtitles)) {
      room.subtitles = newSubtitles;
      io.to(roomId).emit("subtitles:update", room.subtitles);
    }
    res.json({ success: true, subtitles: room.subtitles });
  });

  app.post("/api/sheet-config", (req, res) => {
    const { roomId = "default", spreadsheetId, range } = req.body;
    const room = getRoom(roomId);
    if (spreadsheetId !== undefined) room.sheetConfig.spreadsheetId = spreadsheetId;
    if (range !== undefined) room.sheetConfig.range = range;
    res.json({ success: true, sheetConfig: room.sheetConfig });
  });

  app.get("/api/bible", async (req, res) => {
    const roomId = (req.query.roomId as string) || "default";
    const room = getRoom(roomId);
    const { spreadsheetId, range } = room.sheetConfig;

    if (!spreadsheetId) {
      return res.status(400).json({ error: "스프레드시트 ID가 설정되지 않았습니다. 관리자 페이지에서 설정해주세요." });
    }

    try {
      // 1. Try to fetch as public sheet using Google Visualization API
      // This doesn't require any API keys or OAuth, just that the sheet is "Anyone with the link can view"
      const sheetName = range ? range.split('!')[0] : "Sheet1";
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
      
      const response = await fetch(url);
      const text = await response.text();
      
      if (text.includes("google.visualization.Query.setResponse")) {
        // Parse the JSONP response
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonString);
        
        if (data.status === "error") {
          throw new Error(data.errors[0]?.message || "Sheet error");
        }

        // Convert gviz table format to simple 2D array
        const values: any[][] = [];
        
        // Add headers
        if (data.table.cols) {
          values.push(data.table.cols.map((col: any) => col.label || ""));
        }
        
        // Add rows
        if (data.table.rows) {
          data.table.rows.forEach((row: any) => {
            values.push(row.c.map((cell: any) => cell ? cell.v : ""));
          });
        }
        
        return res.json({ values });
      } else {
        throw new Error("스프레드시트가 공개로 설정되어 있지 않거나 형식이 다릅니다.");
      }
    } catch (error: any) {
      console.error("Failed to fetch from Google Sheets:", error);
      res.status(500).json({ error: "데이터를 불러오지 못했습니다. 스프레드시트가 '링크가 있는 모든 사용자 보기 가능'으로 설정되어 있는지 확인해주세요." });
    }
  });

  // WebSocket for Real-time Co-watching
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    
    const broadcastParticipantCount = (roomId: string) => {
      const roomClients = io.sockets.adapter.rooms.get(roomId);
      const count = roomClients ? roomClients.size : 0;
      io.to(roomId).emit("room:participants", count);
    };

    socket.on("join:room", (roomId: string) => {
      socket.join(roomId);
      const room = getRoom(roomId);
      socket.emit("video:sync", room.currentVideo);
      broadcastParticipantCount(roomId);
    });

    // Host controls
    socket.on("host:play", (data) => {
      const room = getRoom(data.roomId);
      room.currentVideo.status = "playing";
      room.currentVideo.currentTime = data.currentTime;
      room.currentVideo.timestamp = Date.now();
      socket.to(data.roomId).emit("video:play", room.currentVideo);
    });

    socket.on("host:pause", (data) => {
      const room = getRoom(data.roomId);
      room.currentVideo.status = "paused";
      room.currentVideo.currentTime = data.currentTime;
      room.currentVideo.timestamp = Date.now();
      socket.to(data.roomId).emit("video:pause", room.currentVideo);
    });

    socket.on("host:seek", (data) => {
      const room = getRoom(data.roomId);
      room.currentVideo.currentTime = data.currentTime;
      room.currentVideo.timestamp = Date.now();
      socket.to(data.roomId).emit("video:seek", room.currentVideo);
    });

    socket.on("host:sync", (data) => {
      const room = getRoom(data.roomId);
      room.currentVideo.currentTime = data.currentTime;
      room.currentVideo.timestamp = Date.now();
      // Only broadcast sync to others, don't force them to pause/play immediately unless diff is large
      socket.to(data.roomId).emit("video:sync", room.currentVideo);
    });

    // Chat
    socket.on("chat:message", (data) => {
      const room = getRoom(data.roomId);
      const newMessage = {
        id: Math.random().toString(36).substring(7),
        text: data.text,
        author: data.author,
        timestamp: Date.now()
      };
      room.messages.push(newMessage);
      io.to(data.roomId).emit("chat:message", newMessage);
    });

    socket.on("disconnecting", () => {
      socket.rooms.forEach(roomId => {
        if (roomId !== socket.id) {
          setTimeout(() => {
             const roomClients = io.sockets.adapter.rooms.get(roomId);
             const count = roomClients ? roomClients.size : 0;
             io.to(roomId).emit("room:participants", count);
          }, 0);
        }
      });
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
