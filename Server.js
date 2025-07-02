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

app.post("/finalize", async (req, res) => {
  const { streamId, fps = 10 } = req.body;
  if (!streamId) return res.status(400).send("❌ Falta streamId");

  const sessionDir = path.join(BASE_DIR, String(streamId));
  const outputVideo = path.join(sessionDir, "final.mp4");
  const txtPath = path.join(sessionDir, "frames.txt");

  try {
    // 🔍 Detectar todos los frames válidos
    const allFiles = fs.readdirSync(sessionDir)
      .filter(f => f.startsWith(`${streamId}_frame_`) && f.endsWith(".jpg"))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/frame_(\d+)/)?.[1] || "0");
        const bNum = parseInt(b.match(/frame_(\d+)/)?.[1] || "0");
        return aNum - bNum;
      });

    const validFrames = allFiles.filter(f => {
      const size = fs.statSync(path.join(sessionDir, f)).size;
      return size > 5000;
    });

    if (validFrames.length === 0) {
      return res.status(400).send("❌ No hay frames válidos para procesar");
    }

    // 📏 Resolución del primer frame y corrección par
    const meta = await sharp(path.join(sessionDir, validFrames[0])).metadata();
    const width = meta.width % 2 === 0 ? meta.width : meta.width - 1;
    const height = meta.height % 2 === 0 ? meta.height : meta.height - 1;
    const resolution = `${width}x${height}`;
    console.log(`📐 Resolución ajustada: ${resolution}`);

    // 📝 Crear archivo frames.txt para FFmpeg
    const duration = (1 / fps).toFixed(5);
    const lines = validFrames.map(f => `file '${f}'\nduration ${duration}`);
    lines.push(`file '${validFrames[validFrames.length - 1]}'`); // último frame sin duración
    fs.writeFileSync(txtPath, lines.join("\n"));

    // 🎞️ Comenzar proceso con FFmpeg usando concat
    const command = ffmpeg()
      .input(txtPath)
      .inputOptions("-f", "concat", "-safe", "0")
      .videoCodec("libx264")
      .outputOptions([
        "-pix_fmt yuv420p",
        "-movflags faststart",
        `-r ${fps}`,
        `-s ${resolution}`
      ]);

    const audioPath = path.join(sessionDir, `${streamId}_audio.webm`);
    if (fs.existsSync(audioPath)) {
      command.input(audioPath);
    }

    command
      .on("start", () => {
        console.log(`🛠️ Generando video con ${validFrames.length} frames`);
      })
      .on("end", () => {
        res.download(outputVideo, "grabacion_final.mp4", () => {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(`✅ Video listo y limpieza completa para ${streamId}`);
        });
      })
      .on("error", err => {
        console.error("❌ FFmpeg error:", err.message);
        res.status(500).send("⚠️ Error al generar el video");
      })
      .save(outputVideo);

  } catch (err) {
    console.error("💥 Error en /finalize:", err);
    res.status(500).send("⚠️ Error en la finalización de la grabación");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});