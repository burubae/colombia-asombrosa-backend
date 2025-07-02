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

// 🌍 Permitir solicitudes desde GitHub Pages
app.use(cors({ origin: "https://burubae.github.io" }));
app.use(express.json());

// 🧱 Crear directorio temporal si no existe
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

// 🗂️ Configuración de almacenamiento con streamId embebido en el nombre
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

// 🔹 Subir un frame
app.post("/upload-frame", upload, (req, res) => {
  console.log("🖼️ Frame recibido:", req.files?.[0]?.originalname);
  res.status(200).send("✅ Frame recibido");
});

// 🔹 Subir audio
app.post("/upload-audio", upload, (req, res) => {
  console.log("🎤 Audio recibido:", req.files?.[0]?.originalname);
  res.status(200).send("✅ Audio recibido");
});

// 🔹 Finalizar grabación y ensamblar el video
app.post("/finalize", async (req, res) => {
  const { streamId, fps = 10 } = req.body;
  if (!streamId) return res.status(400).send("❌ Falta streamId");

  const sessionDir = path.join(BASE_DIR, String(streamId));
  const outputVideo = path.join(sessionDir, "final.mp4");

  try {
    const files = fs.readdirSync(sessionDir)
      .filter(f => f.startsWith(`${streamId}_frame_`))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/frame_(\d+)/)?.[1] || "0");
        const bNum = parseInt(b.match(/frame_(\d+)/)?.[1] || "0");
        return aNum - bNum;
      });

    if (files.length === 0) {
      return res.status(400).send("❌ No hay frames para procesar");
    }

    // 📏 Detectar tamaño del primer frame
    const firstFramePath = path.join(sessionDir, files[0]);
    const meta = await sharp(firstFramePath).metadata();
    const resolution = `${meta.width}x${meta.height}`;

    const command = ffmpeg();
    files.forEach(f => {
      command.input(path.join(sessionDir, f));
    });

    command
      .inputFPS(fps)
      .videoCodec("libx264")
      .outputFPS(fps)
      .outputOptions("-pix_fmt yuv420p")
      .outputOptions("-s", resolution); // ⬅️ usa la resolución real

    const audioPath = path.join(sessionDir, `${streamId}_audio.webm`);
    if (fs.existsSync(audioPath)) {
      command.input(audioPath);
    }

    command
      .on("start", cmd => {
        console.log(`🎞️ Generando video de ${resolution} @${fps}fps para streamId ${streamId}`);
      })
      .on("end", () => {
        res.download(outputVideo, "grabacion_final.mp4", () => {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(`✅ Video entregado y limpieza completa para ${streamId}`);
        });
      })
      .on("error", err => {
        console.error("❌ Error FFmpeg:", err.message);
        res.status(500).send("⚠️ Error al generar el video");
      })
      .save(outputVideo);

  } catch (err) {
    console.error("💥 Error general:", err);
    res.status(500).send("⚠️ Fallo en la fase de finalización");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});