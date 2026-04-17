# Diagramas

Diagramas Mermaid da arquitetura do projeto `pi-votacao-zk-circuits`.

---

## 1. Fluxo de sinais do circuito

```mermaid
flowchart TB
    subgraph "Inputs Privados"
        VID["voter_id<br/>(CPF normalizado)"]
        MP["merkle_path[4]"]
        MPI["merkle_path_indices[4]"]
    end

    subgraph "Inputs Públicos"
        MR["merkle_root<br/>pubSignals[0]"]
        NH["nullifier_hash<br/>pubSignals[1]"]
        CID["candidate_id<br/>pubSignals[2]"]
        EID["election_id<br/>pubSignals[3]"]
        RID["race_id<br/>pubSignals[4]"]
    end

    subgraph "Seção 1: Range Check + Leaf Hash"
        NB["Num2Bits(40)<br/>40 constraints"]
        LH["Poseidon(1)<br/>~240 constraints"]
    end

    subgraph "Seção 2: Verificação Merkle (x4 níveis)"
        LMUX["Mux1 (left)"]
        RMUX["Mux1 (right)"]
        PH["Poseidon(2)<br/>~240 constraints cada"]
        BIN["idx * (1-idx) === 0"]
    end

    subgraph "Seção 3: Nullifier"
        NHASH["Poseidon(3)<br/>~300 constraints"]
    end

    subgraph "Seção 4: Dummy Constraints"
        DC1["candidate_id²"]
        DC2["race_id²"]
    end

    subgraph "Constraints Finais"
        CMP1["merkle_root === levelHashes[4]"]
        CMP2["nullifier_hash === nullifierHasher.out"]
    end

    VID --> NB
    VID --> LH
    LH -->|"voter_hash"| LMUX
    MP --> LMUX
    MP --> RMUX
    MPI --> LMUX
    MPI --> RMUX
    MPI --> BIN
    LMUX --> PH
    RMUX --> PH
    PH -->|"levelHashes[depth]"| CMP1
    MR --> CMP1

    VID --> NHASH
    EID --> NHASH
    RID --> NHASH
    NHASH --> CMP2
    NH --> CMP2

    CID --> DC1
    RID --> DC2
```

---

## 2. Workflow PLONK (compilação → verificação)

```mermaid
flowchart LR
    subgraph "1. Compilação"
        SRC["voter_proof.circom"]
        CIRCOM["circom compiler"]
        R1CS["voter_proof.r1cs"]
        WASM["voter_proof.wasm"]
        SYM["voter_proof.sym"]
    end

    subgraph "2. Setup PLONK"
        PTAU["hermez_final_14.ptau<br/>(Universal Powers of Tau)"]
        SETUP["snarkjs plonk setup"]
        ZKEY["voter_proof.zkey"]
        VKEY["verification_key.json"]
    end

    subgraph "3. Geração de Prova"
        INPUT["input.json<br/>(voter_id, merkle_path, ...)"]
        WITNESS["generate_witness.js"]
        WTNS["witness.wtns"]
        PROVE["snarkjs plonk prove"]
        PROOF["proof.json"]
        PUB["public.json"]
    end

    subgraph "4. Verificação"
        VERIFY["snarkjs plonk verify"]
        RESULT{{"✅ true / ❌ false"}}
        SOL["Verifier.sol<br/>(on-chain)"]
    end

    SRC --> CIRCOM
    CIRCOM --> R1CS
    CIRCOM --> WASM
    CIRCOM --> SYM

    R1CS --> SETUP
    PTAU --> SETUP
    SETUP --> ZKEY
    ZKEY --> VKEY

    INPUT --> WITNESS
    WASM --> WITNESS
    WITNESS --> WTNS
    WTNS --> PROVE
    ZKEY --> PROVE
    PROVE --> PROOF
    PROVE --> PUB

    VKEY --> VERIFY
    PROOF --> VERIFY
    PUB --> VERIFY
    VERIFY --> RESULT

    ZKEY -->|"export solidityverifier"| SOL
```

---

## 3. Estrutura da Merkle Tree (depth=4)

```mermaid
graph TD
    ROOT["🔑 Root<br/>pubSignals[0]"]

    N10["Poseidon(N00, N01)"]
    N11["Poseidon(N02, N03)"]

    N00["Poseidon(N000, N001)"]
    N01["Poseidon(N002, N003)"]
    N02["Poseidon(N004, N005)"]
    N03["Poseidon(N006, N007)"]

    N000["Poseidon(L0, L1)"]
    N001["Poseidon(L2, L3)"]
    N002["Poseidon(L4, L5)"]
    N003["Poseidon(L6, L7)"]
    N004["Poseidon(L8, L9)"]
    N005["Poseidon(L10, L11)"]
    N006["Poseidon(L12, L13)"]
    N007["Poseidon(L14, L15)"]

    L0["Poseidon(voter_0)<br/>12345678901"]
    L1["Poseidon(voter_1)<br/>98765432100"]
    L2["Poseidon(voter_2)<br/>11122233344"]
    L3["Poseidon(voter_3)<br/>55566677788"]
    L4["..."]
    L5["..."]
    L12["..."]
    L13["..."]
    L14["Poseidon(voter_14)<br/>21314151617"]
    L15["F.zero<br/>(padding)"]

    ROOT --> N10
    ROOT --> N11
    N10 --> N00
    N10 --> N01
    N11 --> N02
    N11 --> N03
    N00 --> N000
    N00 --> N001
    N01 --> N002
    N01 --> N003
    N02 --> N004
    N02 --> N005
    N03 --> N006
    N03 --> N007
    N000 --> L0
    N000 --> L1
    N001 --> L2
    N001 --> L3
    N002 --> L4
    N002 --> L5
    N005 --> L12
    N005 --> L13
    N006 --> L14
    N007 --> L15

    style ROOT fill:#ff6b6b,stroke:#333,color:#fff
    style L15 fill:#95afc0,stroke:#333
```

---

## 4. Infraestrutura de testes

```mermaid
flowchart TB
    subgraph "Helpers (test/helpers/)"
        POS["poseidon.js<br/>Singleton Poseidon"]
        MK["merkle.js<br/>buildTestTree<br/>buildMerkleProof"]
        INP["input.js<br/>buildValidInput<br/>TEST_VOTER_IDS"]
        CIR["circuit.js<br/>circom_tester instance"]
    end

    subgraph "Test Suite (test/voter_proof.test.js)"
        T1["1. Happy path"]
        T2["2. Wrong merkle_root"]
        T3["3. Invalid Merkle path"]
        T4["4. Nullifier binding"]
        T5["5. Nullifier distinctness"]
        T6["6. Relay attack guard"]
        T7["7. Blank vote"]
        T8["8. Null vote"]
        T9["9. Constraint coverage"]
        T10["10. Cross-verification"]
        T11["11. Edge cases"]
    end

    subgraph "Execução"
        MOCHA["Mocha runner<br/>npm test"]
        CT["circom_tester<br/>(compila automaticamente)"]
        CK["checkConstraints()<br/>(verifica R1CS)"]
    end

    POS --> INP
    POS --> MK
    MK --> INP
    CIR --> CT

    INP --> T1 & T2 & T3 & T4 & T5 & T6 & T7 & T8 & T9 & T10 & T11
    CIR --> T1 & T2 & T3 & T4 & T5 & T6 & T7 & T8 & T9 & T10 & T11

    MOCHA --> T1
    CT --> CK
```

---

## 5. Fluxo de artefatos cross-repositório

```mermaid
flowchart LR
    subgraph "pi-votacao-zk-circuits"
        CIRCUIT["voter_proof.circom"]
        BUILD["npm run build"]
        WASMF["voter_proof.wasm"]
        ZKEYF["voter_proof.zkey"]
        VKEYF["verification_key.json"]
        SOLF["Verifier.sol"]
    end

    subgraph "pi-votacao-zk-blockchain"
        CONTRACT["VotingContract.sol"]
        VERIFIER["Verifier.sol (copy)"]
        DEPLOY["Deploy to Sepolia"]
    end

    subgraph "pi-votacao-zk-frontend"
        REACT["React App"]
        SNARKJS["snarkjs.plonk.fullProve()"]
        WASMCOPY["voter_proof.wasm (copy)"]
        ZKEYCOPY["voter_proof.zkey (copy)"]
    end

    subgraph "pi-votacao-zk-backend"
        API["Express API"]
        MERKLE["Merkle tree service"]
        ROOTAPI["GET /merkle-root"]
    end

    CIRCUIT --> BUILD
    BUILD --> WASMF & ZKEYF & VKEYF & SOLF

    SOLF -->|"cp"| VERIFIER
    VERIFIER --> CONTRACT
    CONTRACT --> DEPLOY

    WASMF -->|"cp"| WASMCOPY
    ZKEYF -->|"cp"| ZKEYCOPY
    WASMCOPY --> SNARKJS
    ZKEYCOPY --> SNARKJS
    VKEYF -->|"embedded"| SNARKJS

    MERKLE --> ROOTAPI
    ROOTAPI -->|"merkle_root"| REACT
    REACT --> SNARKJS
    SNARKJS -->|"proof + publicSignals"| CONTRACT
```
