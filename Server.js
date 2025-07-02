// server.js

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = 3000;
const BASE_DIR = path.join(__dirname, "tmp");

// 🌐 CORS para frontend en GitHub Pages
app.use(cors({ origin: "https://burubae.github.io" }));

app.use(express.json());

// 📁 Crea tmp/ si no existe
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

// 🧪 Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.body.streamId || req.query.streamId;
    if (!sessionId) {
      return cb(new Error("❌ Falta streamId en la solicitud"));
    }
    const sessionDir = path.join(BASE_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    if (file.fieldname === "frame") {
      const frameIndex = Date.now();
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
console.log("📩 Body:", req.body);
  console.log("🔍 Query:", req.query);


  res.status(200).send("🖼️ Frame recibido");
});

// 🔹 2. Recibir audio
app.post("/upload-audio", upload.single("audio"), (req, res) => {
  res.status(200).send("🎤 Audio recibido");
});

// 🔹 3. Finalizar y ensamblar el video
app.post("/finalize", async (req, res) => {
  const { streamId, fps = 10 } = req.body;
  if (!streamId) return res.status(400).send("❌ Falta streamId");

  const sessionDir = path.join(BASE_DIR, streamId);
  const outputVideo = path.join(sessionDir, "final.mp4");

  try {
    const files = fs.readdirSync(sessionDir)
      .filter(f => f.startsWith("frame_"))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)[0]);
        const nb = parseInt(b.match(/\d+/)[0]);
        return na - nb;
      });

    if (files.length === 0) {
      return res.status(400).send("❌ No hay frames para procesar");
    }

    const command = ffmpeg();

    // Agrega todos los frames como entrada
    files.forEach(f => {
      command.input(path.join(sessionDir, f));
    });

    command
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
        console.error("⚠️ FFmpeg error:", err);
        res.status(500).send("⚠️ Error generando el video");
      })
      .save(outputVideo);
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).send("⚠️ Error en el servidor");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = 3000;
const BASE_DIR = path.join(__dirname, "tmp");

// 🌐 Habilitar CORS solo para GitHub Pages
app.use(cors({ origin: "https://burubae.github.io" }));
app.use(express.json());

// 🧱 Asegurar carpeta base
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

// 🗂️ Configurar almacenamiento con validación de streamId
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const streamId = req.body?.streamId || req.query?.streamId;
    if (!streamId || typeof streamId !== "string") {
      return cb(new Error("❌ Falta streamId en el formulario"), null);
    }

    const sessionDir = path.join(BASE_DIR, streamId);
    fs.mkdirSync(sessionDir, { recursive: true });
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    if (file.fieldname === "frame") {
      const timestamp = Date.now();
      cb(null, `frame_${timestamp}.jpg`);
    } else if (file.fieldname === "audio") {
      cb(null, "audio.webm");
    } else {
      cb(null, file.originalname);
    }
  }
});

// 📥 Middleware para recibir uno o ambos campos
const upload = multer({ storage }).fields([
  { name: "frame", maxCount: 1 },
  { name: "audio", maxCount: 1 },
  { name: "streamId", maxCount: 1 } // solo para asegurar compatibilidad
]);

// 🔹 1. Subida de frames
app.post("/upload-frame", upload, (req, res) => {
  if (!req.body?.streamId) {
    return res.status(400).send("❌ Falta streamId");
  }
  console.log(`🖼️ Frame recibido para streamId: ${req.body.streamId}`);
  res.status(200).send("✅ Frame recibido");
});

// 🔹 2. Subida de audio
app.post("/upload-audio", upload, (req, res) => {
  if (!req.body?.streamId) {
    return res.status(400).send("❌ Falta streamId");
  }
  console.log(`🎤 Audio recibido para streamId: ${req.body.streamId}`);
  res.status(200).send("✅ Audio recibido");
});

// 🔹 3. Finalizar y ensamblar video
app.post("/finalize", async (req, res) => {
  const { streamId, fps = 10 } = req.body;

  if (!streamId || typeof streamId !== "string") {
    return res.status(400).send("❌ Falta streamId válido");
  }

  const sessionDir = path.join(BASE_DIR, streamId);
  const outputVideo = path.join(sessionDir, "final.mp4");

  try {
    const files = fs
      .readdirSync(sessionDir)
      .filter(f => f.startsWith("frame_"))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/\d+/)[0]);
        const bNum = parseInt(b.match(/\d+/)[0]);
        return aNum - bNum;
      });

    if (files.length === 0) {
      return res.status(400).send("❌ No se encontraron frames para procesar");
    }

    const command = ffmpeg();
    files.forEach(f => {
      command.input(path.join(sessionDir, f));
    });

    command
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
        console.log(`✅ Video generado para streamId ${streamId}`);
        res.download(outputVideo, "grabacion_final.mp4", () => {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        });
      })
      .on("error", err => {
        console.error("❌ Error FFmpeg:", err);
        res.status(500).send("⚠️ Error procesando el video");
      })
      .save(outputVideo);
  } catch (err) {
    console.error("💥 Error general:", err);
    res.status(500).send("⚠️ Error interno del servidor");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});