#!/usr/bin/env bash
# Instalador para Linux, macOS e Git Bash no Windows.
#
#   curl -fsSL https://raw.githubusercontent.com/azpthiago/claude-statusline/main/install.sh | bash
#
# Dentro de um clone do repositorio, basta executar ./install.sh
set -euo pipefail

REPO="https://github.com/azpthiago/claude-statusline"
RAW="https://raw.githubusercontent.com/azpthiago/claude-statusline/main"

# cores no mesmo tom do instalador em Node (desligadas sem TTY ou com NO_COLOR)
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  CORAL=$'\033[38;5;209m'; GRAY=$'\033[38;5;245m'; RED=$'\033[38;5;203m'; FAINT=$'\033[2m'; OFF=$'\033[0m'
else
  CORAL=""; GRAY=""; RED=""; FAINT=""; OFF=""
fi

if ! command -v node >/dev/null 2>&1; then
  printf '\n  %s✗%s Node.js 18+ e necessario e nao foi encontrado no PATH.\n' "$RED" "$OFF" >&2
  printf '    %sInstale em https://nodejs.org e rode novamente.%s\n\n' "$GRAY" "$OFF" >&2
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
  printf '\n  %s✻%s %sbaixando de %s%s\n' "$CORAL" "$OFF" "$FAINT" "$REPO" "$OFF"
  for f in statusline.js scripts/setup.js; do
    curl -fsSL "$RAW/$f" -o "$SRC/$f"
  done
fi

node "$SRC/scripts/setup.js" "$@"

if [ -n "$CLEANUP" ]; then rm -rf "$CLEANUP"; fi
