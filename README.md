# Colombia Asombrosa Backend

Este servidor Node.js recibe frames y audio desde una app Unity WebGL y genera un video `.mp4` ensamblado con FFmpeg.

## Endpoints

- `POST /upload-frame` → Recibe un frame JPEG individual
- `POST /upload-audio` → Recibe la pista de audio como `.webm`
- `POST /finalize` → Ensambla el video final y lo entrega como descarga

## Despliegue sugerido

Este proyecto está listo para ser desplegado en [Render](https://render.com).

## Requisitos

- Node.js 18+
- FFmpeg instalado en el entorno
