#!/usr/bin/env bash
# Instalador para Linux, macOS e Git Bash no Windows.
#
#   curl -fsSL https://raw.githubusercontent.com/azpthiago/claude-statusline/main/install.sh | bash
#
# Dentro de um clone do repositorio, basta executar ./install.sh
set -euo pipefail

REPO="https://github.com/azpthiago/claude-statusline"
RAW="https://raw.githubusercontent.com/azpthiago/claude-statusline/main"

if ! command -v node >/dev/null 2>&1; then
  echo "erro: Node.js 18+ e necessario e nao foi encontrado no PATH." >&2
  echo "Instale em https://nodejs.org e rode novamente." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/statusline.js" ] && [ -f "$SCRIPT_DIR/scripts/setup.js" ]; then
  # execucao a partir de um clone local
  SRC="$SCRIPT_DIR"
  CLEANUP=""
else
  # execucao via curl: baixa os arquivos necessarios para uma pasta temporaria
  SRC="$(mktemp -d)"
  CLEANUP="$SRC"
  mkdir -p "$SRC/scripts"
  echo "baixando de $REPO ..."
  for f in statusline.js scripts/setup.js; do
    curl -fsSL "$RAW/$f" -o "$SRC/$f"
  done
fi

node "$SRC/scripts/setup.js" "$@"

if [ -n "$CLEANUP" ]; then rm -rf "$CLEANUP"; fi
