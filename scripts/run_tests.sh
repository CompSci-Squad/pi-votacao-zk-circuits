#!/usr/bin/env bash
# run_tests.sh — Executa circomspect + testes Mocha em sequência
# Uso: ./scripts/run_tests.sh [--skip-lint] [--full]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BUILD_DIR="$PROJECT_DIR/build"
WASM_PATH="$BUILD_DIR/voter_proof_js/voter_proof.wasm"
ZKEY_PATH="$BUILD_DIR/voter_proof.zkey"

SKIP_LINT=false
FULL=false

for arg in "$@"; do
    case $arg in
        --skip-lint) SKIP_LINT=true ;;
        --full)      FULL=true ;;
        --help|-h)
            echo "Uso: $0 [--skip-lint] [--full]"
            echo ""
            echo "  --skip-lint   Pula circomspect (requer cargo install circomspect)"
            echo "  --full        Inclui testes de prova PLONK completa (requer build + setup)"
            exit 0
            ;;
    esac
done

echo "=== Pipeline de Testes — pi-votacao-zk-circuits ==="
echo ""

# ── 1. Circomspect (linting) ─────────────────────────────────────────────────
if [ "$SKIP_LINT" = false ]; then
    if command -v circomspect &> /dev/null; then
        echo "── Passo 1/3: circomspect ──"
        bash "$SCRIPT_DIR/run_circomspect.sh"
        echo ""
    else
        echo "⚠️  circomspect não instalado, pulando análise estática."
        echo "   Instale com: cargo install circomspect"
        echo ""
    fi
else
    echo "── Passo 1/3: circomspect (PULADO) ──"
    echo ""
fi

# ── 2. Verificar artefatos de build ──────────────────────────────────────────
echo "── Passo 2/3: Verificar artefatos ──"
if [ ! -f "$WASM_PATH" ]; then
    echo "⚠️  WASM não encontrado. Compilando circuito..."
    bash "$SCRIPT_DIR/01_compile.sh"
fi

if [ "$FULL" = true ] && [ ! -f "$ZKEY_PATH" ]; then
    echo "⚠️  zkey não encontrado. Executando setup..."
    bash "$SCRIPT_DIR/02_setup.sh"
fi
echo ""

# ── 3. Testes Mocha ──────────────────────────────────────────────────────────
echo "── Passo 3/3: Testes Mocha ──"

if [ "$FULL" = true ]; then
    echo "Modo: COMPLETO (witness + PLONK proofs)"
    npx mocha test/*.test.js --timeout 120000 --reporter spec
else
    echo "Modo: WITNESS ONLY (sem provas PLONK)"
    npx mocha test/*.test.js --timeout 60000 --reporter spec
fi

echo ""
echo "✅ Todos os testes passaram!"
