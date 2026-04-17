#!/usr/bin/env bash
# run_circomspect.sh — Executa análise estática circomspect no circuito principal
# Falha se houver sinais não-constrained (vulnerabilidade de segurança).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CIRCUIT="$PROJECT_DIR/circuits/voter_proof.circom"

echo "=== Análise Estática — circomspect ==="
echo "Circuito: $CIRCUIT"
echo ""

# ── Verificar pré-requisito: circomspect ─────────────────────────────────────
if ! command -v circomspect &> /dev/null; then
    echo "❌ circomspect não encontrado."
    echo ""
    echo "   Instale via cargo:"
    echo "     cargo install circomspect"
    exit 1
fi

# ── Executar circomspect ─────────────────────────────────────────────────────
OUTPUT_FILE=$(mktemp)
SARIF_FILE="$PROJECT_DIR/circomspect.sarif"

echo "Executando circomspect..."
echo ""

# Run with SARIF output for CI integration
circomspect "$CIRCUIT" \
    --level warning \
    --sarif-file "$SARIF_FILE" \
    2>&1 || true

# Run again for human-readable output
circomspect "$CIRCUIT" --level warning 2>&1 | tee "$OUTPUT_FILE"

echo ""

# ── Verificar resultados ─────────────────────────────────────────────────────
ERRORS=0

if grep -qi "signal may be unconstrained" "$OUTPUT_FILE"; then
    echo "❌ FALHA: Sinais não-constrained detectados!"
    echo "   Isso é uma VULNERABILIDADE DE SEGURANÇA."
    echo "   Cada sinal deve aparecer em pelo menos um constraint (===)."
    ERRORS=1
fi

if grep -qi "unused variable" "$OUTPUT_FILE"; then
    echo "⚠️  AVISO: Variáveis não utilizadas detectadas."
    echo "   Limpe ou justifique com comentário."
fi

rm -f "$OUTPUT_FILE"

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "❌ Análise estática FALHOU. Corrija os problemas acima antes do commit."
    exit 1
fi

echo ""
echo "✅ circomspect: nenhum problema crítico encontrado."
echo "   SARIF report: $SARIF_FILE"
