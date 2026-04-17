# Estratégia de Testes

> Documentação da estratégia de testes automatizados para o circuito VoterProof.

---

## Arquitetura de testes

### Tiers de teste

| Tier | Ferramenta | O que testa | Requer build? | Tempo |
|------|-----------|-------------|---------------|-------|
| **Tier 1: Witness** | `circom_tester` | Geração de witness + satisfação de constraints (R1CS) | Não (compila sozinho) | ~30s (1ª vez), ~5s (cache) |
| **Tier 2: Prova** | `snarkjs.plonk` | Geração e verificação de prova PLONK completa | Sim (WASM + zkey) | ~60-120s |

A suite principal (`npm test`) usa **Tier 1** para executar sem dependência de artefatos de build.

---

## Categorias de teste (11 categorias, 26 testes)

| # | Categoria | Testes | Descrição |
|---|-----------|--------|-----------|
| 1 | Happy path | 2 | Eleitor válido, witness gerada, constraints satisfeitas |
| 2 | Wrong merkle_root | 2 | Raiz adulterada ou zerada → falha |
| 3 | Invalid Merkle path | 3 | Irmãos errados, zerados, ou índice não-binário |
| 4 | Nullifier binding | 3 | Determinístico; rejeita nullifier errado ou com 2 inputs |
| 5 | Nullifier distinctness | 3 | Diferentes (voter, election, race) → nullifiers distintos |
| 6 | Relay attack guard | 2 | Troca de race_id invalida a prova |
| 7 | Blank vote | 1 | candidate_id=0 funciona normalmente |
| 8 | Null vote | 1 | candidate_id=999 funciona normalmente |
| 9 | Constraint coverage | 2 | Num2Bits(40) rejeita overflow; todos os sinais públicos participam |
| 10 | Cross-verification | 3 | Saídas do circuito batem com circomlibjs independente |
| 11 | Edge cases | 4 | voter_id=0, não-cadastrado, candidate_id grande, último índice |

---

## Estrutura de arquivos

```
test/
├── helpers/
│   ├── poseidon.js     # Singleton Poseidon (circomlibjs)
│   ├── merkle.js       # buildTestTree, buildMerkleProof
│   ├── input.js        # buildValidInput, TEST_VOTER_IDS, constantes
│   └── circuit.js      # Singleton circom_tester instance
├── voter_proof.test.js # Suite principal (11 categorias)
└── generate_test_inputs.js  # Helper legado (compatível)
```

---

## Como executar

```bash
# Suite completa (Tier 1 — sem build necessário)
npm test

# Equivalente explícito
npx mocha test/voter_proof.test.js --timeout 300000
```

### Pré-requisitos

| Ferramenta | Versão | Nota |
|-----------|--------|------|
| Node.js | ≥18 | LTS recomendado |
| circom | 2.x | Necessário pelo circom_tester para compilar |
| Rust | stable | Necessário para instalar o circom |

```bash
# Verificar que circom está no PATH
source "$HOME/.cargo/env"
circom --version
```

---

## Padrão de teste: expectWitnessSuccess / expectWitnessFailure

Todos os testes seguem um padrão consistente:

```javascript
// Caso positivo: witness + checkConstraints devem ter sucesso
async function expectWitnessSuccess(input) {
  const w = await circuit.calculateWitness(input, true);
  await circuit.checkConstraints(w);
  return w;
}

// Caso negativo: deve lançar exceção (witness inválida ou constraint violada)
async function expectWitnessFailure(input, message) {
  let threw = false;
  try {
    const w = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(w);
  } catch {
    threw = true;
  }
  expect(threw, message).to.equal(true);
}
```

O `checkConstraints(w)` é **crítico** — testes sem ele verificam apenas "não deu throw", não que as constraints R1CS são satisfeitas. Isso foi a principal lacuna da suite anterior.

---

## Cross-verificação com circomlibjs

Os testes da categoria 10 verificam que os hashes computados **fora** do circuito (via `circomlibjs`) batem com os esperados **dentro** do circuito:

1. **Nullifier**: `Poseidon([voter_id, election_id, race_id])` off-circuit = `nullifier_hash` no input
2. **Leaf hash**: `Poseidon([voter_id])` off-circuit = `tree[0][index]`
3. **Merkle root**: Recomputação completa da árvore = `tree.root`

Isso previne o failure mode crítico onde o helper de teste e o circuito divergem silenciosamente.
