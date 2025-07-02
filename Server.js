const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = 3000;
const BASE_DIR = path.join(__dirname, "tmp");

// 🌍 Habilitar CORS para GitHub Pages
app.use(cors({ origin: "https://burubae.github.io" }));
app.use(express.json());

// 🧱 Crear carpeta temporal si no existe
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

// 🗂️ Configurar almacenamiento usando streamId en el nombre del archivo
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const match = file.originalname.match(/^(\d+)_/);
    if (!match) {
      return cb(new Error("❌ No se pudo extraer streamId del nombre del archivo"), null);
    }
    const sessionId = match[1];
    const sessionDir = path.join(BASE_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage }).any();

// 🔹 1. Subida de frame
app.post("/upload-frame", upload, (req, res) => {
  //console.log("🖼️ Frame recibido:", req.files?.[0]?.originalname);
  res.status(200).send("✅ Frame recibido");
});

// 🔹 2. Subida de audio
app.post("/upload-audio", upload, (req, res) => {
 // console.log("🎤 Audio recibido:", req.files?.[0]?.originalname);
  res.status(200).send("✅ Audio recibido");
});

// 🔹 3. Finalizar y generar .mp4
app.post("/finalize", (req, res) => {
  const { streamId, fps = 10 } = req.body;
  if (!streamId) return res.status(400).send("❌ Falta streamId");

  const sessionDir = path.join(BASE_DIR, String(streamId));
  const outputVideo = path.join(sessionDir, "final.mp4");

  try {
    const files = fs
      .readdirSync(sessionDir)
      .filter(f => f.startsWith(`${streamId}_frame_`))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/frame_(\d+)/)?.[1] || "0");
        const bNum = parseInt(b.match(/frame_(\d+)/)?.[1] || "0");
        return aNum - bNum;
      });

    if (files.length === 0) return res.status(400).send("❌ No se encontraron frames");

    const command = ffmpeg();
    files.forEach(f => command.input(path.join(sessionDir, f)));

    command
      .inputFPS(fps)
      .videoCodec("libx264")
      .outputFPS(fps)
      .outputOptions("-pix_fmt yuv420p");

    const audioPath = path.join(sessionDir, `${streamId}_audio.webm`);
    if (fs.existsSync(audioPath)) {
      command.input(audioPath);
    }

    command
      .on("end", () => {
        res.download(outputVideo, "grabacion_final.mp4", () => {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        });
      })
      .on("error", err => {
        console.error("⚠️ FFmpeg error:", err);
        res.status(500).send("⚠️ Error generando el video");
      })
      .save(outputVideo);
  } catch (err) {
    console.error("💥 Error finalizando:", err);
    res.status(500).send("⚠️ Error interno del servidor");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});