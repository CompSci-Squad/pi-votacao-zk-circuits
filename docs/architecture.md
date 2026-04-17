# Arquitetura do Circuito VoterProof

> Documentação técnica da arquitetura do circuito ZK para votação eletrônica anônima verificável.

---

## Visão geral

O circuito `VoterProof(depth=4)` prova três propriedades simultaneamente, sem revelar o `voter_id`:

1. **Autorização** — o eleitor pertence à árvore de Merkle de autorizados
2. **Unicidade** — o nullifier é determinístico, impedindo voto duplo por cargo
3. **Vinculação** — o `race_id` público impede reutilização cross-cargo (relay attack)

---

## Fluxo de sinais

```mermaid
flowchart LR
    subgraph Privado
        VID[voter_id]
        MP[merkle_path_4_]
        MPI[merkle_path_indices_4_]
    end

    subgraph Público
        MR[merkle_root]
        NH[nullifier_hash]
        CID[candidate_id]
        EID[election_id]
        RID[race_id]
    end

    VID --> NB[Num2Bits_40_]
    VID --> LH[Poseidon_1_ leafHasher]
    LH --> ML{Merkle Loop x4}
    MP --> ML
    MPI --> ML
    ML -->|levelHashes_4_| CMP1["=== merkle_root"]
    MR --> CMP1

    VID --> NUL[Poseidon_3_ nullifierHasher]
    EID --> NUL
    RID --> NUL
    NUL -->|out| CMP2["=== nullifier_hash"]
    NH --> CMP2

    CID --> DUM1["candidate_id²"]
    RID --> DUM2["race_id²"]
```

---

## Estrutura da Merkle tree

```mermaid
graph TD
    ROOT["Root (pubSignals[0])"]
    H_01["Poseidon(H_0, H_1)"]
    H_23["Poseidon(H_2, H_3)"]
    H_0["Poseidon(H_00, H_01)"]
    H_1["Poseidon(H_02, H_03)"]
    H_2["Poseidon(H_04, H_05)"]
    H_3["Poseidon(H_06, H_07)"]
    H_00["Poseidon(L0, L1)"]
    H_01b["Poseidon(L2, L3)"]
    H_02["Poseidon(L4, L5)"]
    H_03["Poseidon(L6, L7)"]
    H_04["Poseidon(L8, L9)"]
    H_05["Poseidon(L10, L11)"]
    H_06["Poseidon(L12, L13)"]
    H_07["Poseidon(L14, L15)"]

    L0["Poseidon(voter_0)"]
    L1["Poseidon(voter_1)"]
    L2["Poseidon(voter_2)"]
    L3["Poseidon(voter_3)"]
    LN["..."]
    L14["Poseidon(voter_14)"]
    L15["F.zero (padding)"]

    ROOT --> H_01
    ROOT --> H_23
    H_01 --> H_0
    H_01 --> H_1
    H_23 --> H_2
    H_23 --> H_3
    H_0 --> H_00
    H_0 --> H_01b
    H_1 --> H_02
    H_1 --> H_03
    H_2 --> H_04
    H_2 --> H_05
    H_3 --> H_06
    H_3 --> H_07
    H_00 --> L0
    H_00 --> L1
    H_01b --> L2
    H_01b --> L3
    H_02 --> LN
    H_06 --> L14
    H_07 --> L15
```

Profundidade: **4** → suporta até **16 folhas** (15 eleitores + 1 padding zero).

---

## Decisões arquiteturais

### 1. Merkle tree manual (Mux1 + Poseidon)

A `circomlib@2.0.5` **não fornece** um template de prova de Merkle binária — apenas `SMTVerifier` (Sparse Merkle Tree), com interface e semântica diferentes. A implementação manual segue o padrão de:

- **Tornado Cash** — `MerkleTreeWithHistory.circom`
- **Semaphore v2** — `tree.circom`

Ambos usam `Mux1` + `Poseidon(2)` da circomlib auditada, exatamente como este circuito.

### 2. Num2Bits(40) para range check

Sem restrição de intervalo, `voter_id` aceita qualquer elemento do campo BN128 (~2^254). O `Num2Bits(40)` garante que o voter_id cabe em 40 bits (max ~1,1 trilhão), suficiente para CPFs de 11 dígitos.

**Referência:** vulnerabilidade Dark Forest (Daira Hopwood) — campos sem range check permitiram entradas fora do domínio.

### 3. Nullifier com 3 inputs

```
nullifier = Poseidon(voter_id, election_id, race_id)
```

| Input | Justificativa |
|-------|-------------|
| `voter_id` | Vincula o nullifier à identidade (sem revelar) |
| `election_id` | Permite reutilizar o mesmo voter_id em eleições diferentes |
| `race_id` | Permite votar em múltiplos cargos na mesma eleição |

### 4. Dummy constraints

| Sinal | Por que precisa de dummy | Risco sem ele |
|-------|-------------------------|---------------|
| `candidate_id` | Não aparece em nenhuma computação — apenas registrado on-chain | Under-constrained: provador malicioso poderia alterar o candidato |
| `race_id` | Já constrangido via nullifier, mas mantido como defesa em profundidade | Redundante, porém custo mínimo (1 constraint) |

### 5. PLONK vs Groth16

| Critério | PLONK | Groth16 |
|----------|-------|---------|
| Trusted setup | **Universal** (Powers of Tau único) | Circuit-specific (nova cerimônia por circuito) |
| Tamanho da prova | ~780 bytes | ~192 bytes |
| Tempo de verificação | ~8ms | ~4ms |
| Adequação ao PoC | **Alta** — sem necessidade de coordenar cerimônia | Baixa — complexidade operacional |

> **Nota de segurança (BN254):** A curva BN254 oferece ~100 bits de segurança (não 128) após ataques exTNFS (Kim-Barbulescu, 2015). Suficiente para PoC acadêmica, mas produção crítica requer migração para BLS12-381. Ver [security.md](security.md) para detalhes.

---

## Contagem de constraints

| Componente | Constraints | Operador |
|------------|------------|----------|
| `Num2Bits(40)` | 40 | `<==` |
| `Poseidon(1)` — leaf hash | ~240 | `<==` |
| 4× (`Poseidon(2)` + 2×`Mux1`) — Merkle | ~968 | `<==` |
| 4× binary check — `idx * (1-idx) === 0` | 4 | `===` |
| `Poseidon(3)` — nullifier | ~300 | `<==` |
| `merkle_root === levelHashes[depth]` | 1 | `===` |
| `nullifier_hash === nullifierHasher.out` | 1 | `===` |
| `candidate_id * candidate_id` | 1 | `<==` |
| `race_id * race_id` | 1 | `<==` |
| **Total estimado** | **~1.556** | |

O `powersOfTau28_hez_final_14.ptau` suporta até 2^14 = **16.384** constraints — amplamente suficiente.

---

## Sinais públicos (ordem canônica)

| Índice | Sinal | Tipo | Constrangido por |
|--------|-------|------|-----------------|
| `pubSignals[0]` | `merkle_root` | input | `=== levelHashes[depth]` |
| `pubSignals[1]` | `nullifier_hash` | input | `=== nullifierHasher.out` |
| `pubSignals[2]` | `candidate_id` | input | `candidate_id * candidate_id` (dummy) |
| `pubSignals[3]` | `election_id` | input | `nullifierHasher.inputs[1]` |
| `pubSignals[4]` | `race_id` | input | `nullifierHasher.inputs[2]` + dummy |
