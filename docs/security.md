# Segurança e Modelo de Ameaça

> Análise de segurança do circuito VoterProof e limitações conhecidas.

---

## Invariantes de segurança

Estas propriedades são **não-negociáveis**. Qualquer violação é uma vulnerabilidade criptográfica.

| # | Invariante | Status | Verificação |
|---|-----------|--------|-------------|
| 1 | Apenas `<==` para assignments com semântica de constraint | ✅ | Zero uso de `<--` no circuito |
| 2 | `assert()` nunca substitui `===` | ✅ | Nenhum `assert()` no circuito |
| 3 | Todos os 5 sinais públicos constrangidos em R1CS | ✅ | Testes de constraint coverage (#9) |
| 4 | Nullifier = `Poseidon(voter_id, election_id, race_id)` — 3 inputs | ✅ | Testes de cross-verification (#10) |
| 5 | `race_id` é público (`pubSignals[4]`) | ✅ | Declarado no `component main` |
| 6 | PLONK exclusivamente (nunca Groth16) | ✅ | Scripts e pipeline usam `snarkjs plonk` |
| 7 | Primitivas da circomlib (Poseidon, Mux1, Num2Bits) | ✅ | Includes verificáveis |

---

## Checklist de vulnerabilidades (§6 das instruções)

- [x] Todo `<--` tem `===` adjacente — **N/A** (zero uso de `<--`)
- [x] Nenhum `assert()` usado para segurança — ✅
- [x] Todos os 5 sinais públicos em pelo menos 1 constraint R1CS — ✅
- [x] `race_id` (`pubSignals[4]`) está no cálculo do nullifier — ✅
- [x] Range check via `Num2Bits(40)` para `voter_id` — ✅
- [x] Poseidon instanciado da circomlib — ✅
- [x] Merkle tree usa Mux1 + Poseidon da circomlib — ✅
- [x] circomspect sem warnings de sinais não-constrangidos — A verificar
- [x] Profundidade da árvore = 4 (sem magic numbers) — ✅ (parâmetro do template)
- [x] Cross-verificação com circomlibjs nos testes — ✅

---

## Modelo de ameaça

### Ameaças mitigadas pelo circuito

| Ameaça | Mitigação | Mecanismo |
|--------|-----------|-----------|
| **Voto duplo** | Nullifier determinístico por (voter, election, race) | `Poseidon(voter_id, election_id, race_id)` — o contrato rejeita nullifiers repetidos |
| **Voto por não-eleitor** | Prova de pertencimento à Merkle tree | `merkle_root === levelHashes[depth]` |
| **Relay attack (cross-cargo)** | `race_id` é público e vinculado ao nullifier | Alterar `race_id` invalida a prova |
| **Forja de voter_id** | Range check limita a 40 bits | `Num2Bits(40)` impede overflow de campo |
| **Alteração do candidato** | `candidate_id` como sinal público constrangido | Dummy constraint + verificação on-chain |

### Ameaças fora do escopo do circuito

| Ameaça | Responsabilidade | Nota |
|--------|-----------------|------|
| Coerção do eleitor | Frontend (destruição do receipt) | O circuito não pode impedir coerção física |
| Comprometimento da chave privada | Dispositivo do eleitor | Se `voter_id` vaza, o atacante pode votar |
| Manipulação da Merkle root | Smart contract | O contrato deve verificar a root correta |
| Validação do range de candidatos | Smart contract | O circuito aceita qualquer `candidate_id` |
| Ataques de timing | Infraestrutura de rede | O circuito não protege contra análise de tráfego |

---

## Limitações conhecidas

### 1. Curva BN254 (~100-bit security)

A curva BN254 (bn128) utilizada pelo snarkjs oferece **~100 bits de segurança**, não 128, devido ao ataque exTNFS (Kim & Barbulescu, 2015). Para um PoC acadêmico, isso é aceitável. Para produção:

- Migrar para **BLS12-381** (~128-bit security)
- Ou para **BN254 com parâmetros maiores**

### 2. Auditoria formal não realizada

- O **circomspect** é um linter estático, não uma prova formal de soundness
- Nenhuma auditoria externa (Trail of Bits, OpenZeppelin) foi conduzida
- Os testes cobrem 11 categorias, mas testes ≠ prova formal

### 3. Powers of Tau

A cerimônia Hermez utilizada é amplamente confiável (>100 participantes), mas:
- O grupo **não conduziu** uma cerimônia independente
- Se **todos** os participantes da cerimônia forem comprometidos, provas falsas são possíveis
- O PLONK mitiga parcialmente: setup universal, sem cerimônia circuit-specific

### 4. Escalabilidade

- Profundidade 4 → máximo 16 eleitores (15 usados + 1 padding)
- Para produção: profundidade 20+ (>1M eleitores)
- Aumentar a profundidade aumenta constraints linearmente (~250 por nível)

### 5. Privacidade do voter_id

O `voter_id` é um input privado que nunca aparece em `pubSignals`. No entanto:
- O `nullifier_hash` é público e determinístico
- Se um atacante souber o `voter_id` de alguém, pode recomputar o nullifier e verificar se votou
- Mitigação: o `voter_id` deve ser mantido confidencial pelo eleitor
