#!/usr/bin/env bash
# 01_compile.sh – Compila o circuito voter_proof.circom com Circom 2
# Gera: .r1cs  .wasm  .sym  (na pasta build/)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CIRCUIT="$PROJECT_DIR/circuits/voter_proof.circom"
BUILD_DIR="$PROJECT_DIR/build"

echo "=== 01 – Compilando circuito Circom 2 ==="
echo "Circuito : $CIRCUIT"
echo "Saída    : $BUILD_DIR"
echo ""

# ── Verificar pré-requisito: circom ─────────────────────────────────────────
if ! command -v circom &> /dev/null; then
    echo "❌ circom não encontrado."
    echo ""
    echo "   Instale Rust e circom:"
    echo "     curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh"
    echo "     source \"\$HOME/.cargo/env\"   # ou reinicie o terminal"
    echo "     cargo install --git https://github.com/iden3/circom.git"
    exit 1
fi

mkdir -p "$BUILD_DIR"

# ── Compilar ─────────────────────────────────────────────────────────────────
circom "$CIRCUIT" \
    --r1cs \
    --wasm \
    --sym \
    --output "$BUILD_DIR" \
    -l "$PROJECT_DIR/node_modules"

echo ""
echo "✅ Compilação concluída!"
echo "   R1CS : $BUILD_DIR/voter_proof.r1cs"
echo "   WASM : $BUILD_DIR/voter_proof_js/voter_proof.wasm"
echo "   Sym  : $BUILD_DIR/voter_proof.sym"
echo ""
echo "Próximo passo: npm run setup"
