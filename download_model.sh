#!/bin/bash

echo "⬇️ Downloading Vosk model..."

mkdir -p model
cd model

wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip -O model.zip

unzip model.zip
rm model.zip

echo "✅ Model downloaded!"
