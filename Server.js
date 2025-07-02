// server.js

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = 3000;
const BASE_DIR = path.join(__dirname, "tmp");
app.use(express.json());

// 📁 Asegura el directorio temporal
fs.mkdirSync(BASE_DIR, { recursive: true });

// 🧪 Multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.body.streamId || req.query.streamId;
    const sessionDir = path.join(BASE_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    if (file.fieldname === "frame") {
      const frameIndex = Date.now(); // puedes usar contador si prefieres
      cb(null, `frame_${frameIndex}.jpg`);
    } else if (file.fieldname === "audio") {
      cb(null, "audio.webm");
    } else {
      cb(null, file.originalname);
    }
  }
});
const upload = multer({ storage });

// 🔹 1. Recibir frame individual
app.post("/upload-frame", upload.single("frame"), (req, res) => {
  res.status(200).send("🖼️ Frame recibido");
});

// 🔹 2. Recibir audio
app.post("/upload-audio", upload.single("audio"), (req, res) => {
  res.status(200).send("🎤 Audio recibido");
});

// 🔹 3. Finalizar y ensamblar el video
app.post("/finalize", async (req, res) => {
  const { streamId, fps = 10 } = req.body;
  const sessionDir = path.join(BASE_DIR, streamId);
  const outputVideo = path.join(sessionDir, "final.mp4");

  // 🗂️ Leer y ordenar los frames por nombre
  const files = fs.readdirSync(sessionDir)
    .filter(f => f.startsWith("frame_"))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0]);
      const nb = parseInt(b.match(/\d+/)[0]);
      return na - nb;
    });

  if (files.length === 0) return res.status(400).send("❌ No hay frames");

  const inputPattern = path.join(sessionDir, "frame_%*.jpg");

  const command = ffmpeg()
    .input(`${sessionDir}/frame_%*.jpg`)
    .inputFPS(fps)
    .videoCodec("libx264")
    .outputFPS(fps)
    .outputOptions("-pix_fmt yuv420p");

  const audioPath = path.join(sessionDir, "audio.webm");
  if (fs.existsSync(audioPath)) {
    command.input(audioPath);
  }

  command
    .on("end", () => {
      res.download(outputVideo, "grabacion_final.mp4", () => {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      });
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err);
      res.status(500).send("⚠️ Error generando el video");
    })
    .save(outputVideo);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});