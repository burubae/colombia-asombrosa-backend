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

// 📁 Asegurar carpeta temporal
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

// 🧰 Configuración de almacenamiento dinámico
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const match = file.originalname.match(/^(\d+)_/);
    if (!match) return cb(new Error("❌ No se pudo extraer streamId"), null);
    const sessionDir = path.join(BASE_DIR, match[1]);
    fs.mkdirSync(sessionDir, { recursive: true });
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage }).any();

// 🖼️ Recepción de frames
app.post("/upload-frame", upload, (req, res) => {
  console.log("🖼️ Frame recibido:", req.files?.[0]?.originalname);
  res.send("✅ Frame recibido");
});

// 🎧 Recepción de audio
app.post("/upload-audio", upload, (req, res) => {
  console.log("🎤 Audio recibido:", req.files?.[0]?.originalname);
  res.send("✅ Audio recibido");
});

// 🎬 Finalización y ensamblaje del video
app.post("/finalize", async (req, res) => {
  const { streamId, fps = 10 } = req.body;
  if (!streamId) return res.status(400).send("❌ Falta streamId");

  const sessionDir = path.join(BASE_DIR, String(streamId));
  const outputVideo = path.join(sessionDir, "final.mp4");

  try {
    // 🗂️ Buscar y ordenar todos los frames
    const allFiles = fs.readdirSync(sessionDir)
      .filter(f => f.startsWith(`${streamId}_frame_`) && f.endsWith(".jpg"))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/frame_(\d+)/)?.[1] || "0");
        const bNum = parseInt(b.match(/frame_(\d+)/)?.[1] || "0");
        return aNum - bNum;
      });

    // 🧪 Filtrar los que pesen más de 5 KB
    const validFrames = allFiles.filter(f => {
      const size = fs.statSync(path.join(sessionDir, f)).size;
      return size > 5000;
    });

    if (validFrames.length === 0) {
      return res.status(400).send("❌ No hay frames válidos para procesar");
    }

    // 📐 Detectar resolución del primer frame y redondear
    const firstValidPath = path.join(sessionDir, validFrames[0]);
    const meta = await sharp(firstValidPath).metadata();
    const width = meta.width % 2 === 0 ? meta.width : meta.width - 1;
    const height = meta.height % 2 === 0 ? meta.height : meta.height - 1;
    const resolution = `${width}x${height}`;
    console.log(`📏 Resolución: ${meta.width}x${meta.height} → corregida a ${resolution}`);
    console.log(`🧼 Frames válidos: ${validFrames.length}/${allFiles.length}`);

    // 🎥 Construcción del video con FFmpeg
    const command = ffmpeg();
    validFrames.forEach(f => {
      command.input(path.join(sessionDir, f));
    });

    command
      .inputFPS(fps)
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
      .on("start", () => {
        console.log(`🎞️ Iniciando render con FFmpeg para streamId ${streamId}`);
      })
      .on("end", () => {
        res.download(outputVideo, "grabacion_final.mp4", () => {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(`✅ Video entregado y carpeta eliminada para streamId ${streamId}`);
        });
      })
      .on("error", err => {
       