#!/usr/bin/env bash
# download_ptau.sh — Baixa o Powers of Tau da cerimônia Hermez para uso local e CI
# Faz download apenas se o arquivo não existir ou tiver tamanho incorreto.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PTAU_DIR="$PROJECT_DIR/ptau"
PTAU_FILE="$PTAU_DIR/powersOfTau28_hez_final_14.ptau"
PTAU_URL="https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau"
# Approximate expected size: ~120MB (exact: 124,723,477 bytes)
EXPECTED_MIN_SIZE=120000000

echo "=== Download Powers of Tau (Hermez, 2^14) ==="

mkdir -p "$PTAU_DIR"

# Check if file exists and has reasonable size
if [ -f "$PTAU_FILE" ]; then
    FILE_SIZE=$(stat --printf="%s" "$PTAU_FILE" 2>/dev/null || stat -f%z "$PTAU_FILE" 2>/dev/null || echo "0")
    if [ "$FILE_SIZE" -gt "$EXPECTED_MIN_SIZE" ]; then
        echo "✅ Powers of Tau já presente ($FILE_SIZE bytes): $PTAU_FILE"
        exit 0
    else
        echo "⚠️  Arquivo ptau existe mas parece incompleto ($FILE_SIZE bytes). Re-baixando..."
        rm -f "$PTAU_FILE"
    fi
fi

echo "Baixando Powers of Tau 2^14 (~120 MB)..."
echo "URL: $PTAU_URL"
echo ""

if command -v curl &> /dev/null; then
    curl -L --progress-bar --retry 3 --retry-delay 5 "$PTAU_URL" -o "$PTAU_FILE"
elif command -v wget &> /dev/null; then
    wget -q --show-progress --tries=3 "$PTAU_URL" -O "$PTAU_FILE"
else
    echo "❌ curl ou wget não encontrado."
    echo "   Baixe manualmente: $PTAU_URL"
    echo "   Salve em: $PTAU_FILE"
    exit 1
fi

# Verify download
FILE_SIZE=$(stat --printf="%s" "$PTAU_FILE" 2>/dev/null || stat -f%z "$PTAU_FILE" 2>/dev/null || echo "0")
if [ "$FILE_SIZE" -lt "$EXPECTED_MIN_SIZE" ]; then
    echo "❌ Download parece incompleto ($FILE_SIZE bytes). Tente novamente."
    rm -f "$PTAU_FILE"
    exit 1
fi

echo ""
echo "✅ Powers of Tau baixado com sucesso!"
echo "   Arquivo: $PTAU_FILE"
echo "   Tamanho: $(du -h "$PTAU_FILE" | cut -f1)"
