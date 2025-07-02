const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");

const app = express();
const PORT = 3000;
const BASE_DIR = path.join(__dirname, "tmp");

app.use(cors({ origin: "https://burubae.github.io" }));
app.use(express.json());

if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const match = file.originalname.match(/^(\d+)_/);
    if (!match) return cb(new Error("❌ No se pudo extraer streamId"), null);
    const sessionDir = path.join(BASE_DIR, match[1]);
    fs.mkdirSync(sessionDir, { recursive: true });
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage }).any();

app.post("/upload-frame", upload, (req, res) => {
  console.log("🖼️ Frame recibido:", req.files?.[0]?.originalname);
  res.send("✅ Frame recibido");
});

app.post("/upload-audio", upload, (req, res) => {
  console.log("🎤 Audio recibido:", req.files?.[0]?.originalname);
  res.send("✅ Audio recibido");
});

app.post("/finalize", async (req, res) => {
  const { streamId, fps = 10 } = req.body;
  if (!streamId) return res.status(400).send("❌ Falta streamId");

  const sessionDir = path.join(BASE_DIR, String(streamId));
  const outputVideo = path.join(sessionDir, "final.mp4");

  try {
    const patternPath = path.join(sessionDir, `${streamId}_frame_%04d.jpg`);
    const firstFrame = path.join(sessionDir, `${streamId}_frame_0000.jpg`);
    if (!fs.existsSync(firstFrame)) {
      return res.status(400).send("❌ El primer frame no existe o tiene nombre incorrecto");
    }

    const meta = await sharp(firstFrame).metadata();
    const width = meta.width % 2 === 0 ? meta.width : meta.width - 1;
    const height = meta.height % 2 === 0 ? meta.height : meta.height - 1;
    const resolution = `${width}x${height}`;
    console.log(`🧮 Resolución corregida: ${meta.width}x${meta.height} → ${resolution}`);

    const command = ffmpeg()
      .input(patternPath)
      .inputOptions([`-framerate ${fps}`])
      .videoCodec("libx264")
      .outputFPS(fps)
      .outputOptions([
        "-pix_fmt yuv420p",
        `-s ${resolution}`
      ]);

    const audioPath = path.join(sessionDir, `${streamId}_audio.webm`);
    if (fs.existsSync(audioPath)) {
      command.input(audioPath);
    }

    command
      .on("start", cmd => {
        console.log(`🎞️ Renderizando video con patrón %04d @${fps}fps para streamId ${streamId}`);
      })
      .on("end", () => {
        res.download(outputVideo, "grabacion_final.mp4", () => {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(`✅ Video finalizado y limpiado para ${streamId}`);
        });
      })
      .on("error", err => {
        console.error("❌ FFmpeg error:", err.message);
        res.status(500).send("⚠️ Fallo al generar el video");
      })
      .save(outputVideo);
  } catch (err) {
    console.error("💥 Error general:", err);
    res.status(500).send("⚠️ Fallo en la etapa de finalización");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});