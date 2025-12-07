import express from "express";
import multer from "multer";
import fs from "fs";               // fs bình thường để dùng existsSync, createReadStream
import fsPromises from "fs/promises"; // fs/promises để dùng unlink async
import path from "path";
import { fileURLToPath } from "url";
import vosk from "vosk";
import wav from "wav";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Multer tạm
const upload = multer({ dest: "uploads/" });

// Vosk
const MODEL_PATH = path.join(__dirname, "model", "vosk-model-en-us-0.22");
const SAMPLE_RATE = 16000;

// Sử dụng fs bình thường để check file/directory tồn tại
if (!fs.existsSync(MODEL_PATH)) {
  console.error("❌ Model not found! Please check path:", MODEL_PATH);
  process.exit(1);
}

vosk.setLogLevel(0);
let model;
try {
  model = new vosk.Model(MODEL_PATH);
  console.log("✅ Vosk model loaded!");
} catch (err) {
  console.error("❌ Failed to load model:", err.message);
  process.exit(1);
}

// ffmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Transcribe
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

  const inputPath = req.file.path;
  const convertedPath = `${inputPath}_converted.wav`;

  try {
    // Convert sang PCM S16LE mono 16kHz
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1)
        .audioFrequency(SAMPLE_RATE)
        .audioCodec("pcm_s16le")
        .toFormat("wav")
        .on("end", resolve)
        .on("error", reject)
        .save(convertedPath);
    });

    await fsPromises.unlink(inputPath);

    // Đọc audio bằng wav
    const reader = new wav.Reader();
    const recognizer = new vosk.Recognizer({ model, sampleRate: SAMPLE_RATE });

    reader.on("data", (chunk) => recognizer.acceptWaveform(chunk));

    reader.on("end", async () => {
      const result = recognizer.finalResult();
      const text = (result.text || "").trim();
      recognizer.free();

      await fsPromises.unlink(convertedPath);

      console.log(`🎙️ Recognized: "${text}"`);
      res.json({ text });
    });

    reader.on("error", async (err) => {
      console.error("❌ Reader error:", err);
      recognizer.free();
      await fsPromises.unlink(convertedPath).catch(() => {});
      res.status(500).json({ error: "Reader error", details: err.message });
    });

    fs.createReadStream(convertedPath).pipe(reader);
  } catch (err) {
    console.error("❌ Transcription error:", err);
    await fsPromises.unlink(inputPath).catch(() => {});
    await fsPromises.unlink(convertedPath).catch(() => {});
    res.status(500).json({ error: "Transcription failed", details: err.message });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "✅ Vosk API is running",
    model: path.basename(MODEL_PATH),
    sampleRate: SAMPLE_RATE,
  });
});

// Node version check
app.get("/node-version", (req, res) => {
  res.send({ node: process.version });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
