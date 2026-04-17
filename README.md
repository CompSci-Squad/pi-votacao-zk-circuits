# votacao-zk-circuits

Circuitos **Circom 2** com **ZK-SNARKs** (protocolo PLONK) para um sistema de urna eletrônica brasileira com anonimato verificável.

> **Contexto acadêmico (TCC/PoC):** Este projeto implementa uma prova de conceito de votação eletrônica com 15 eleitores e 2 candidatos, integrando-se a um smart contract Ethereum (Sepolia) e um frontend React.

---

## O que o circuito prova

Sem revelar o `voter_id` (CPF do eleitor), a prova ZK demonstra simultaneamente:

| Propriedade | O que é provado |
|-------------|-----------------|
| **Autorização** | O eleitor conhece um `voter_id` cujo `Poseidon(voter_id)` pertence à Merkle tree de eleitores autorizados |
| **Integridade** | O hash da folha foi calculado corretamente pelo próprio circuito (nenhum dado externo pode forjá-lo) |
| **Unicidade** | O `nullifier_hash` apresentado é exatamente `Poseidon(voter_id, election_id, race_id)`, impedindo voto duplo por cargo sem revelar identidade |
| **Isolamento por cargo** | `race_id` é sinal público — impede que um relayer reutilize uma prova gerada para o cargo A enviando-a ao cargo B (relay attack) |

### Por que Poseidon em vez de SHA-256?

O hash **Poseidon** foi projetado especificamente para circuitos aritméticos sobre campos finitos:

- SHA-256 gera ~25.000 constraints em R1CS; Poseidon gera ~240–300 (dependendo da aridade) — **~100× mais eficiente** (Grassi et al., 2021).
- Tempos de prova menores: 1–3s em desktop, 3–5s em mobile.
- Amplamente adotado em projetos ZK (Tornado Cash, Semaphore, zkSync, Polygon).

---

## Estrutura do repositório

```
votacao-zk-circuits/
├── circuits/
│   └── voter_proof.circom          # Circuito principal (único arquivo)
├── build/                          # Gerado pelos scripts (não comitado)
│   ├── voter_proof.wasm            # Circuito compilado (WebAssembly)
│   ├── voter_proof.zkey            # Chave de prova PLONK
│   ├── verification_key.json       # Chave de verificação
│   └── Verifier.sol                # Contrato verificador Ethereum
├── docs/
│   ├── architecture.md             # Arquitetura detalhada do circuito
│   ├── diagrams.md                 # Diagramas Mermaid (fluxo, Merkle, PLONK)
│   ├── IMPLEMENTATION_PLAN.md      # Plano de implementação original
│   ├── security.md                 # Modelo de ameaça e invariantes de segurança
│   └── testing.md                  # Estratégia e infraestrutura de testes
├── scripts/
│   ├── 01_compile.sh               # Compila o circuito
│   ├── 02_setup.sh                 # Trusted setup PLONK
│   ├── 03_export_verifier.sh       # Exporta Verifier.sol
│   └── 04_test_proof.js            # Gera/verifica prova de teste
├── test/
│   ├── helpers/                    # Utilitários de teste (Poseidon, Merkle, Input)
│   └── voter_proof.test.js         # Suite de 26 testes (Mocha + circom_tester)
├── inputs/
│   └── example_input.json          # Input de exemplo com valores Poseidon reais
├── ptau/
│   └── README.md                   # Instruções para Powers of Tau
├── Makefile                        # Atalhos: make compile, make test, make clean
├── package.json
├── .gitignore
└── README.md
```

---

## Pré-requisitos

| Ferramenta | Versão mínima | Notas |
|------------|--------------|-------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) |
| **circom** | 2.x | Instalação abaixo |
| **Rust** | stable | Necessário para compilar circom |
| **RAM** | ~2 GB | Para o trusted setup PLONK |

### Instalar circom 2

```bash
# 1. Instalar Rust (se necessário)
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"   # ou reinicie o terminal

# 2. Instalar circom
cargo install --git https://github.com/iden3/circom.git

# 3. Verificar
circom --version
```

---

## Instalação

```bash
git clone <repo-url>
cd votacao-zk-circuits
npm install
```

### Download do Powers of Tau (opcional — o setup baixa automaticamente)

```bash
curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau \
     -o ptau/powersOfTau28_hez_final_14.ptau
```

---

## Como compilar

```bash
npm run compile
```

Saídas em `build/`:
- `voter_proof.r1cs` — representação algébrica R1CS
- `voter_proof_js/voter_proof.wasm` — witness calculator
- `voter_proof.sym` — mapa de sinais (debug)

---

## Como fazer o trusted setup

```bash
npm run setup
```

O script:
1. Baixa o Powers of Tau Hermez (`~120 MB`) automaticamente se necessário.
2. Executa `snarkjs plonk setup` → `voter_proof.zkey`
3. Exporta `verification_key.json`

> O arquivo `.zkey` pode ter 2–5 MB e está no `.gitignore`.

---

## Como testar

### Gerar e verificar uma prova de demonstração

```bash
npm test
```

Executa `scripts/04_test_proof.js`, que:
1. Constrói a Merkle tree de 15 eleitores simulados.
2. Gera o input para o eleitor de CPF `12345678901`.
3. Salva o input em `inputs/example_input.json`.
4. Gera a prova PLONK e exibe o tempo de geração.
5. Verifica a prova e exibe o resultado.

### Testes automatizados (Mocha + circom_tester)

```bash
npm test
```

Executa a suite completa em `test/voter_proof.test.js` com **circom_tester**:
o circuito é compilado automaticamente — **nenhum artefato de build é necessário**.

| # | Categoria | Testes | Comportamento esperado |
|---|-----------|--------|------------------------|
| 1 | Happy path | 2 | ✅ Witness válida + checkConstraints |
| 2 | Wrong merkle_root | 2 | ❌ Falha na constraint |
| 3 | Invalid Merkle path | 3 | ❌ Falha (raiz diverge / índice não-binário) |
| 4 | Nullifier binding | 3 | ❌ Nullifier errado → falha; determinístico |
| 5 | Nullifier distinctness | 3 | Diferentes (voter, election, race) → nullifiers distintos |
| 6 | Relay attack guard | 2 | ❌ Troca de race_id invalida a prova |
| 7 | Voto em branco | 1 | ✅ candidate_id=0 funciona |
| 8 | Voto nulo | 1 | ✅ candidate_id=999 funciona |
| 9 | Constraint coverage | 2 | Num2Bits(40) + todos os sinais públicos |
| 10 | Cross-verification | 3 | Saídas do circuito batem com circomlibjs |
| 11 | Edge cases | 4 | Eleitor não-cadastrado, voter_id=0, último índice |

> Os testes usam `circom_tester` (iden3) que compila o circuito sob demanda.
> A primeira execução pode levar ~30s para compilar; execuções subsequentes são instantâneas.

---

## Como exportar para outros repositórios

```bash
npm run export-verifier
```

O script gera `build/Verifier.sol` e exibe as instruções de cópia:

### Repositório blockchain (`votacao-zk-blockchain`)

```bash
cp build/Verifier.sol ../votacao-zk-blockchain/contracts/Verifier.sol
```

### Repositório frontend (`votacao-zk-frontend`)

```bash
cp build/voter_proof_js/voter_proof.wasm ../votacao-zk-frontend/public/circuits/
cp build/voter_proof.zkey                ../votacao-zk-frontend/public/circuits/
```

---

## Estrutura do circuito

```
                    ┌──────────────────────────────────────────────────┐
  [PRIVADO]         │              VoterProof(depth=4)                  │
  voter_id ────────►│ Num2Bits(40): range check                        │
                    │ Poseidon(voter_id) = voter_hash                   │
  merkle_path[] ───►│ MerkleCheck(voter_hash, path) = root             │──► root === merkle_root  [PUB 0]
  path_indices[] ──►│                                                  │
                    │ Poseidon(voter_id, election_id, race_id) = null  │──► null === nullifier_hash [PUB 1]
  [PÚBLICO]         │                                                  │
  election_id ─────►│                                                  │──► election_id            [PUB 3]
  race_id ─────────►│                                                  │──► race_id                [PUB 4]
  candidate_id ────►│ (registrado on-chain)                            │──► candidate_id            [PUB 2]
  merkle_root ─────►│                                                  │
  nullifier_hash ──►│                                                  │
                    └──────────────────────────────────────────────────┘

### Ordem canônica dos sinais públicos

| Índice | Sinal | Descrição |
|--------|-------|----------|
| `pubSignals[0]` | `merkle_root` | Raiz da árvore de eleitores autorizados |
| `pubSignals[1]` | `nullifier_hash` | `Poseidon(voter_id, election_id, race_id)` — anti-voto-duplo |
| `pubSignals[2]` | `candidate_id` | Candidato escolhido (0=branco, 999=nulo) |
| `pubSignals[3]` | `election_id` | Identificador da eleição |
| `pubSignals[4]` | `race_id` | Identificador do cargo (guarda anti-relay) |
```

### Estimativa de constraints

| Componente | Constraints |
|------------|------------|
| `Num2Bits(40)` — range check do voter_id | 40 |
| `Poseidon(1)` — hash da folha | ~240 |
| Merkle path × 4 níveis — `Poseidon(2)` + `2×Mux1` | ~968 |
| `Poseidon(3)` — nullifier (voter_id, election_id, race_id) | ~300 |
| Constraints de índice binário (4×) | 4 |
| Dummy constraints (candidate_id, race_id) | 2 |
| **Total estimado** | **~1.554** |

O arquivo `powersOfTau28_hez_final_14.ptau` suporta até 2^14 = 16.384 constraints — amplamente suficiente.

---

## Limitações e modelo de ameaça

| Limitação | Detalhes |
|-----------|----------|
| **Curva BN254** | Segurança estimada em ~100 bits (não 128) após ataques exTNFS (Kim-Barbulescu, 2015). Suficiente para PoC acadêmica, mas não recomendada para produção crítica sem migração para BLS12-381. |
| **Auditoria formal** | O circomspect é um linter estático, não uma prova formal de soundness. Nenhuma auditoria externa foi realizada. |
| **Powers of Tau** | A cerimônia utilizada (Hermez) não foi conduzida independentemente pelo grupo. |
| **Escopo PoC** | Árvore de profundidade 4 (máx. 16 eleitores). Para produção, aumentar para 20+ (>1M eleitores). |
| **Validação de candidato** | O circuito aceita qualquer `candidate_id`; a validação de intervalo é responsabilidade exclusiva do smart contract. |
| **Re-identificação via nullifier** | Se o `voter_id` for previsível (ex.: CPFs sequenciais), um adversário pode pré-computar `Poseidon(CPF, election_id, race_id)` e correlacionar nullifiers a identidades. Mitigação: salt ou compromisso prévio (fora do escopo do PoC). |

---

## Referências

- [Documentação Circom 2](https://docs.circom.io/)
- [Circomlib — biblioteca de templates](https://github.com/iden3/circomlib)
- [SnarkJS — geração de provas em JS](https://github.com/iden3/snarkjs)
- [Poseidon Hash Paper (Grassi et al., 2019)](https://eprint.iacr.org/2019/458.pdf)
- [Powers of Tau — Hermez Ceremony](https://github.com/iden3/snarkjs#7-prepare-phase-2)
- [Semaphore — referência de design](https://semaphore.appliedzkp.org/)

---

## Licença

MIT
