#!/usr/bin/env bash
# 03_export_verifier.sh – Exporta Verifier.sol (PLONK) a partir da zkey
# O contrato gerado pode ser implantado no repositório votacao-zk-blockchain.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
VERIFIER_OUT="$BUILD_DIR/Verifier.sol"

echo "=== 03 – Exportar Verifier.sol ==="
echo ""

# ── Verificar pré-requisito: zkey ────────────────────────────────────────────
if [ ! -f "$BUILD_DIR/voter_proof.zkey" ]; then
    echo "❌ Arquivo .zkey não encontrado."
    echo "   Execute primeiro: npm run setup"
    exit 1
fi

# ── Gerar Verifier.sol ───────────────────────────────────────────────────────
echo "Gerando Verifier.sol (PLONK)..."
npx snarkjs zkey export solidityverifier \
    "$BUILD_DIR/voter_proof.zkey" \
    "$VERIFIER_OUT"

# Strip the dead `import "hardhat/console.sol";` line that some snarkjs
# revisions inject. The import is unused (no console.log calls in the file)
# and breaks compilation under non-Hardhat toolchains (e.g. Foundry).
sed -i '/^import "hardhat\/console\.sol";$/d' "$VERIFIER_OUT"

echo ""
echo "✅ Verifier.sol gerado em:"
echo "   $VERIFIER_OUT"
echo ""
echo "=== Integração com outros repositórios ==="
echo ""
echo "📦 Repositório blockchain (votacao-zk-blockchain):"
echo "   cp $VERIFIER_OUT <caminho>/src/Verifier.sol"
echo ""
echo "📦 Repositório frontend (votacao-zk-frontend):"
echo "   cp $BUILD_DIR/voter_proof_js/voter_proof.wasm <caminho>/public/circuits/"
echo "   cp $BUILD_DIR/voter_proof.zkey               <caminho>/public/circuits/"
