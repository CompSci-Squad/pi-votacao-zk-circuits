pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

/*
 * VoterProof
 *
 * Prova zero-knowledge para sistema de votação eletrônica.
 *
 * Garante simultaneamente, sem revelar o voter_id:
 *   1. AUTORIZAÇÃO  – Poseidon(voter_id) pertence à Merkle tree de raiz merkle_root.
 *   2. INTEGRIDADE  – O hash da folha foi calculado corretamente pelo próprio circuito.
 *   3. UNICIDADE    – nullifier_hash === Poseidon(voter_id, election_id), impedindo voto duplo.
 *
 * Parâmetros:
 *   depth – profundidade da árvore de Merkle (4 → suporta até 16 eleitores)
 */
template VoterProof(depth) {

    // ── Inputs privados (nunca saem do dispositivo do eleitor) ───────────────
    signal input voter_id;                    // CPF normalizado (apenas dígitos)
    signal input merkle_path[depth];          // Irmãos no caminho folha → raiz
    signal input merkle_path_indices[depth];  // 0 = filho esquerdo, 1 = filho direito

    // ── Inputs públicos (enviados ao contrato Ethereum) ──────────────────────
    signal input merkle_root;     // Raiz da árvore de eleitores autorizados
    signal input nullifier_hash;  // Poseidon(voter_id, election_id) — anti-voto-duplo
    signal input candidate_id;    // Candidato (0=branco, 999=nulo, ou número real)
    signal input election_id;     // Identificador único da eleição

    // ── 1. Calcular voter_hash = Poseidon(voter_id) ──────────────────────────
    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== voter_id;

    // ── 2. Verificar pertencimento à Merkle tree (profundidade = depth) ──────
    component hashers[depth];
    component leftMux[depth];
    component rightMux[depth];

    signal levelHashes[depth + 1];
    levelHashes[0] <== leafHasher.out;

    for (var i = 0; i < depth; i++) {
        // merkle_path_indices[i] deve ser 0 ou 1
        merkle_path_indices[i] * (1 - merkle_path_indices[i]) === 0;

        // Se índice == 0: nó atual é filho esquerdo, irmão é direito
        // Se índice == 1: nó atual é filho direito, irmão é esquerdo
        leftMux[i] = Mux1();
        leftMux[i].c[0] <== levelHashes[i];   // idx=0 → atual é esquerdo
        leftMux[i].c[1] <== merkle_path[i];   // idx=1 → irmão é esquerdo
        leftMux[i].s    <== merkle_path_indices[i];

        rightMux[i] = Mux1();
        rightMux[i].c[0] <== merkle_path[i];  // idx=0 → irmão é direito
        rightMux[i].c[1] <== levelHashes[i];  // idx=1 → atual é direito
        rightMux[i].s    <== merkle_path_indices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== leftMux[i].out;
        hashers[i].inputs[1] <== rightMux[i].out;

        levelHashes[i + 1] <== hashers[i].out;
    }

    // ── 3. A raiz calculada deve coincidir com a raiz pública ────────────────
    merkle_root === levelHashes[depth];

    // ── 4–5. Calcular e verificar o nullifier ────────────────────────────────
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== voter_id;
    nullifierHasher.inputs[1] <== election_id;

    nullifier_hash === nullifierHasher.out;

    // ── 6. candidate_id é incluído como público — registrado on-chain ────────
    // Sem restrição de intervalo: permite 0 (branco), 999 (nulo) e qualquer número.
    // A validação do candidato é responsabilidade do contrato inteligente.
    signal candidate_id_squared;
    candidate_id_squared <== candidate_id * candidate_id;
}

// Instância principal com profundidade 4 (suporta até 16 eleitores)
component main {public [merkle_root, nullifier_hash, candidate_id, election_id]} = VoterProof(4);
