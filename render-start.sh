#!/bin/bash

if [ ! -d "model/vosk-model-en-us-0.22" ]; then
  echo "Model not found → downloading..."
  chmod +x download_model.sh
  ./download_model.sh
fi

node index.js
