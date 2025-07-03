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
  filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage }).any();

app.post("/upload-frame", upload, (req, res) => {
  res.send("✅ Frame recibido");
});

app.post("/upload-audio", upload, (req, res) => {
  res.send("✅ Audio recibido");
});

app.post("/finalize", async (req, res) => {
  const { streamId, fps = 10 } = req.body;
  if (!streamId) return res.status(400).send("❌ Falta streamId");

  const sessionDir = path.join(BASE_DIR, String(streamId));
  const outputVideo = path.join(sessionDir, "final.mp4");
  const txtPath = path.join(sessionDir, "frames.txt");

  try {
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

    const duration = (1 / fps).toFixed(5);
    const lines = validFrames.map(f => `file '${f}'\nduration ${duration}`);
    lines.push(`file '${validFrames[validFrames.length - 1]}'`);
    fs.writeFileSync(txtPath, lines.join("\n"));

    const resolution = "960x540";
    const command = ffmpeg()
      .input(txtPath)
      .inputOptions("-f", "concat", "-safe", "0")
      .videoCodec("libx264")
      .outputOptions([
        "-pix_fmt yuv420p",
        "-movflags faststart",
        `-r ${fps}`,
        `-s ${resolution}`,
        "-preset ultrafast"
      ]);

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
        res.status(500).send("⚠️ Error al generar el video");
      })
      .save(outputVideo);

  } catch (err) {
    res.status(500).send("⚠️ Error en la finalización");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});