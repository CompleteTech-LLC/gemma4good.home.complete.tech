#!/usr/bin/env bash
set -euo pipefail

source_dir="${LLAMA_CPP_SOURCE:-/home/completetrain/llama.cpp-b8740-vulkan}"
commit="${LLAMA_CPP_COMMIT:-d1b16701ac1d1e585ede456e68f99f1deaa3e96d}"
repo_url="${LLAMA_CPP_REPO_URL:-https://github.com/ggml-org/llama.cpp.git}"

if [ ! -d "$source_dir/.git" ]; then
  mkdir -p "$(dirname "$source_dir")"
  git clone "$repo_url" "$source_dir"
fi

git -C "$source_dir" fetch origin "$commit"
git -C "$source_dir" checkout --detach "$commit"
git -C "$source_dir" status --short
