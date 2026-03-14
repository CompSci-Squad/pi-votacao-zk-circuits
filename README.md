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
| **Unicidade** | O `nullifier_hash` apresentado é exatamente `Poseidon(voter_id, election_id)`, impedindo voto duplo sem revelar identidade |

### Por que Poseidon em vez de SHA-256?

O hash **Poseidon** foi projetado especificamente para circuitos aritméticos sobre campos finitos:

- SHA-256 gera ~25.000 constraints em R1CS; Poseidon gera ~240 — **100× mais eficiente**.
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
├── scripts/
│   ├── 01_compile.sh               # Compila o circuito
│   ├── 02_setup.sh                 # Trusted setup PLONK
│   ├── 03_export_verifier.sh       # Exporta Verifier.sol
│   └── 04_test_proof.js            # Gera/verifica prova de teste
├── test/
│   ├── generate_test_inputs.js     # Utilitário: Merkle tree + inputs de teste
│   └── voter_proof.test.js         # Testes automatizados (Mocha + Chai)
├── inputs/
│   └── example_input.json          # Input de exemplo com valores Poseidon reais
├── ptau/
│   └── README.md                   # Instruções para Powers of Tau
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

### Testes automatizados (Mocha)

```bash
npm run test:full
```

Executa os testes em `test/voter_proof.test.js` cobrindo 6 cenários:

| # | Cenário | Comportamento esperado |
|---|---------|----------------------|
| 1 | Prova válida — eleitor cadastrado | ✅ Prova gerada e verificada |
| 2 | Eleitor não cadastrado | ❌ Falha (raiz da árvore não bate) |
| 3 | Merkle path incorreto | ❌ Falha (raiz calculada diverge) |
| 4 | Nullifier incorreto | ❌ Falha (constraint `nullifier_hash === Poseidon(voter_id, election_id)`) |
| 5 | Voto em branco (`candidate_id = 0`) | ✅ Funciona normalmente |
| 6 | Voto nulo (`candidate_id = 999`) | ✅ Funciona normalmente |

> ⚠️ Os testes de prova completa são pulados automaticamente se `build/voter_proof.wasm` ou `build/voter_proof.zkey` não existirem. Os testes de witness (apenas constraints) requerem apenas o WASM.

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
                    ┌─────────────────────────────────────────┐
  [PRIVADO]         │           VoterProof(depth=4)            │
  voter_id ────────►│ Poseidon(voter_id) = voter_hash          │
  merkle_path[] ───►│ MerkleCheck(voter_hash, path) = root     │──► root === merkle_root  [PÚBLICO]
  path_indices[] ──►│                                          │
                    │ Poseidon(voter_id, election_id) = null   │──► null === nullifier_hash [PÚBLICO]
  [PÚBLICO]         │                                          │
  election_id ─────►│                                          │
  candidate_id ────►│ (registrado on-chain)                    │──► candidate_id           [PÚBLICO]
  merkle_root ─────►│                                          │
  nullifier_hash ──►│                                          │
                    └─────────────────────────────────────────┘
```

### Estimativa de constraints

| Componente | Constraints |
|------------|------------|
| `Poseidon(voter_id)` | ~240 |
| Merkle path × 4 níveis — `Poseidon(2)` + `Mux1` | ~960 |
| `Poseidon(voter_id, election_id)` | ~240 |
| Constraints de índice binário (4×) | 4 |
| **Total estimado** | **~1.444** |

O arquivo `powersOfTau28_hez_final_14.ptau` suporta até 2^14 = 16.384 constraints — amplamente suficiente.

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
