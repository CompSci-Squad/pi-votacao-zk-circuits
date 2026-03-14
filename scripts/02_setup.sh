#!/usr/bin/env bash
# 02_setup.sh – Trusted setup PLONK com Powers of Tau (Hermez)
# Gera: voter_proof.zkey  verification_key.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
PTAU_DIR="$PROJECT_DIR/ptau"
PTAU_FILE="$PTAU_DIR/powersOfTau28_hez_final_14.ptau"
PTAU_URL="https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau"

echo "=== 02 – Trusted Setup PLONK ==="
echo ""

# ── Verificar pré-requisito: R1CS compilado ──────────────────────────────────
if [ ! -f "$BUILD_DIR/voter_proof.r1cs" ]; then
    echo "❌ Arquivo R1CS não encontrado."
    echo "   Execute primeiro: npm run compile"
    exit 1
fi

# ── 1. Obter Powers of Tau ───────────────────────────────────────────────────
if [ -f "$PTAU_FILE" ]; then
    echo "✅ Powers of Tau já presente: $PTAU_FILE"
else
    echo "Baixando Powers of Tau Hermez (2^14, ~120 MB)..."
    mkdir -p "$PTAU_DIR"
    if command -v curl &> /dev/null; then
        curl -L --progress-bar "$PTAU_URL" -o "$PTAU_FILE"
    elif command -v wget &> /dev/null; then
        wget -q --show-progress "$PTAU_URL" -O "$PTAU_FILE"
    else
        echo "❌ curl ou wget não encontrado. Baixe manualmente:"
        echo "   URL : $PTAU_URL"
        echo "   Dest: $PTAU_FILE"
        exit 1
    fi
    echo "✅ Powers of Tau baixado!"
fi

echo ""

# ── 2. Gerar chave de prova PLONK ────────────────────────────────────────────
echo "Gerando chave de prova PLONK (voter_proof.zkey)..."
npx snarkjs plonk setup \
    "$BUILD_DIR/voter_proof.r1cs" \
    "$PTAU_FILE" \
    "$BUILD_DIR/voter_proof.zkey"

echo ""

# ── 3. Exportar chave de verificação ─────────────────────────────────────────
echo "Exportando verification_key.json..."
npx snarkjs zkey export verificationkey \
    "$BUILD_DIR/voter_proof.zkey" \
    "$BUILD_DIR/verification_key.json"

echo ""
echo "✅ Setup concluído!"
echo "   Proving key      : $BUILD_DIR/voter_proof.zkey"
echo "   Verification key : $BUILD_DIR/verification_key.json"
echo ""
echo "Próximo passo: npm run export-verifier"
