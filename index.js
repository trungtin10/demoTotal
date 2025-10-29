import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vosk from "vosk";
import wav from "wav";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

// ---------------------
// ⚙️ Setup cơ bản
// ---------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// ---------------------
// 💾 Multer: upload file tạm
// ---------------------
const upload = multer({ dest: "uploads/" });

// ---------------------
// 🧠 Model Vosk
// ---------------------
const MODEL_PATH = path.join(__dirname, "model", "vosk-model-small-en-us-0.15");
const SAMPLE_RATE = 16000;

if (!fs.existsSync(MODEL_PATH)) {
  console.error("❌ Model not found! Please check path:", MODEL_PATH);
  process.exit(1);
}

console.log("⏳ Loading Vosk model, please wait...");
vosk.setLogLevel(0);

let model;
try {
  model = new vosk.Model(MODEL_PATH);
  console.log("✅ Vosk model loaded successfully!");
} catch (err) {
  console.error("❌ Failed to load model:", err.message);
  process.exit(1);
}

// ---------------------
// 🔧 Setup ffmpeg
// ---------------------
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ---------------------
// 🎧 API chính: /transcribe
// ---------------------
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

  const inputPath = req.file.path;
  const convertedPath = `${inputPath}_converted.wav`;

  try {
    // 🌀 B1: Convert file sang PCM S16LE, mono, 16kHz
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

    // ✅ Xóa file gốc sau khi convert xong
    fs.unlinkSync(inputPath);

    // 🌀 B2: Đọc file convert bằng wav.Reader
    const reader = new wav.Reader();
    const recognizer = new vosk.Recognizer({ model, sampleRate: SAMPLE_RATE });

    reader.on("format", (format) => {
      console.log("🎧 Audio format after conversion:", format);
    });

    reader.on("data", (chunk) => {
      recognizer.acceptWaveform(chunk);
    });

    reader.on("end", () => {
      const result = recognizer.finalResult();
      const text = (result.text || "").trim();

      recognizer.free();
      fs.unlinkSync(convertedPath);

      console.log(`🎙️ Recognized: "${text}"`);
      res.json({ text });
    });

    reader.on("error", (err) => {
      console.error("❌ Reader error:", err);
      if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath);
      recognizer.free();
      res.status(500).json({ error: "Reader error", details: err.message });
    });

    fs.createReadStream(convertedPath).pipe(reader);
  } catch (err) {
    console.error("❌ Transcription error:", err);
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath);
    res.status(500).json({ error: "Transcription failed", details: err.message });
  }
});

// ---------------------
// 🧪 Route kiểm tra server
// ---------------------
app.get("/", (req, res) => {
  res.json({
    status: "✅ Vosk API is running",
    model: path.basename(MODEL_PATH),
    sampleRate: SAMPLE_RATE,
  });
});

// ---------------------
// 🚀 Khởi động server
// ---------------------
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
  console.log(`👉 Test with:`);
  console.log(`curl -X POST http://localhost:${port}/transcribe -F "audio=@audio/test.wav"`);
});
