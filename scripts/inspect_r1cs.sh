#!/usr/bin/env bash
# inspect_r1cs.sh — Inspeciona o R1CS compilado: constraints, sinais, etc.
# Útil para verificar se o ptau correto está sendo usado.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
R1CS="$PROJECT_DIR/build/voter_proof.r1cs"
SYM="$PROJECT_DIR/build/voter_proof.sym"

echo "=== Inspeção R1CS — voter_proof ==="
echo ""

if [ ! -f "$R1CS" ]; then
    echo "❌ R1CS não encontrado. Execute: npm run compile"
    exit 1
fi

echo "── Informações gerais ──"
npx snarkjs r1cs info "$R1CS"
echo ""

# Extrair constraint count para validação
CONSTRAINTS=$(npx snarkjs r1cs info "$R1CS" 2>&1 | grep -oP 'Constraints: \K\d+' || echo "unknown")
echo "Constraints: $CONSTRAINTS"

# Verificar se cabe no ptau 2^14
if [ "$CONSTRAINTS" != "unknown" ] && [ "$CONSTRAINTS" -le 16384 ]; then
    echo "✅ Cabe no ptau 2^14 (max 16384 constraints)"
elif [ "$CONSTRAINTS" != "unknown" ] && [ "$CONSTRAINTS" -le 8192 ]; then
    echo "💡 Cabe no ptau 2^13 (menor e mais rápido)"
else
    echo "⚠️  Pode exceder o ptau 2^14. Verifique!"
fi

echo ""

if [ -f "$SYM" ] && [ "${1:-}" = "--print" ]; then
    echo "── Constraints detalhados ──"
    npx snarkjs r1cs print "$R1CS" "$SYM" | head -50
    echo "... (primeiras 50 constraints)"
fi
