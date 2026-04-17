# =============================================================================
# Makefile — pi-votacao-zk-circuits
#
# Single-command build pipeline for ZK circuit development.
#
# Usage:
#   make              — full pipeline (compile + setup + test)
#   make compile      — compile circuit only
#   make setup        — PLONK setup (downloads ptau if needed)
#   make test         — witness-only tests (fast)
#   make test-full    — full PLONK proof tests
#   make lint         — run circomspect
#   make export       — export Verifier.sol
#   make clean        — remove build artifacts
#   make artifacts    — copy deployment artifacts to artifacts/
# =============================================================================

.PHONY: all compile setup test test-full lint export clean artifacts install \
        download-ptau inspect help

# Default target
all: lint compile setup test-full export
	@echo ""
	@echo "✅ Pipeline completo executado com sucesso!"

help:
	@echo "Alvos disponíveis:"
	@echo "  make              Pipeline completo (lint → compile → setup → test → export)"
	@echo "  make install      Instalar dependências Node"
	@echo "  make lint         Análise estática (circomspect)"
	@echo "  make compile      Compilar circuito (circom → r1cs + wasm + sym)"
	@echo "  make setup        PLONK setup (gerar zkey + verification_key)"
	@echo "  make test         Testes witness-only (rápido)"
	@echo "  make test-full    Testes completos com prova PLONK"
	@echo "  make export       Exportar Verifier.sol"
	@echo "  make artifacts    Copiar artefatos para distribuição"
	@echo "  make inspect      Inspecionar constraints do R1CS"
	@echo "  make clean        Limpar build/"
	@echo "  make download-ptau  Baixar Powers of Tau"

# -- Dependencies --
install:
	npm ci

# -- Lint --
lint:
	@chmod +x scripts/run_circomspect.sh
	./scripts/run_circomspect.sh

# -- Download ptau --
download-ptau:
	@chmod +x scripts/download_ptau.sh
	./scripts/download_ptau.sh

# -- Compile --
compile:
	@chmod +x scripts/01_compile.sh
	./scripts/01_compile.sh

# -- Setup (includes ptau download) --
setup: download-ptau
	@chmod +x scripts/02_setup.sh
	./scripts/02_setup.sh

# -- Tests --
test:
	@chmod +x scripts/run_tests.sh
	./scripts/run_tests.sh --skip-lint

test-full:
	@chmod +x scripts/run_tests.sh
	./scripts/run_tests.sh --skip-lint --full

# -- Export --
export:
	@chmod +x scripts/03_export_verifier.sh
	./scripts/03_export_verifier.sh

# -- Inspect --
inspect:
	@chmod +x scripts/inspect_r1cs.sh
	./scripts/inspect_r1cs.sh

# -- Artifacts for distribution --
artifacts: build/voter_proof_js/voter_proof.wasm build/voter_proof.zkey build/verification_key.json build/Verifier.sol
	@mkdir -p artifacts
	cp build/voter_proof_js/voter_proof.wasm artifacts/
	cp build/voter_proof.zkey artifacts/
	cp build/verification_key.json artifacts/
	cp build/Verifier.sol artifacts/
	@echo ""
	@echo "✅ Artefatos copiados para artifacts/"
	@echo "   → Verifier.sol        → blockchain repo"
	@echo "   → voter_proof.wasm    → frontend repo"
	@echo "   → voter_proof.zkey    → frontend repo"
	@echo "   → verification_key.json → backend repo"

# -- Clean --
clean:
	rm -rf build/
	rm -f circomspect.sarif
	@echo "✅ build/ limpo"
