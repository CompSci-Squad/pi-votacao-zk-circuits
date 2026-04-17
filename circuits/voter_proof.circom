pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";

/*
 * VoterProof
 *
 * Prova zero-knowledge para sistema de votação eletrônica.
 *
 * Garante simultaneamente, sem revelar o voter_id:
 *   1. AUTORIZAÇÃO  – Poseidon(voter_id) pertence à Merkle tree de raiz merkle_root.
 *   2. INTEGRIDADE  – O hash da folha foi calculado corretamente pelo próprio circuito.
 *   3. UNICIDADE    – nullifier_hash === Poseidon(voter_id, election_id, race_id), impedindo voto
 *                     duplo dentro do mesmo cargo — um eleitor pode votar em cargos distintos.
 *   4. VINCULAÇÃO   – race_id é sinal público, impossibilitando que um relayer reutilize uma
 *                     prova gerada para cargo A submetendo-a ao cargo B.
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
    // Ordem canônica — deve bater com IVerifier.sol e VotingContract.castVote():
    //   pubSignals[0] = merkle_root
    //   pubSignals[1] = nullifier_hash
    //   pubSignals[2] = candidate_id
    //   pubSignals[3] = election_id
    //   pubSignals[4] = race_id
    signal input merkle_root;     // Raiz da árvore de eleitores autorizados
    signal input nullifier_hash;  // Poseidon(voter_id, election_id, race_id) — anti-voto-duplo
    signal input candidate_id;    // Candidato (0=branco, 999=nulo, ou número real)
    signal input election_id;     // Identificador único da eleição
    signal input race_id;         // Identificador do cargo (ex.: 1=Presidente) — PÚBLICO

    // ── 1. Calcular voter_hash = Poseidon(voter_id) ──────────────────────────
    //
    // Restrição de intervalo: voter_id deve caber em 40 bits (suficiente para
    // CPFs de 11 dígitos, máximo ~1,1 trilhão). Impede que um provador
    // malicioso insira elementos arbitrários do campo BN128 (~2^254).
    // Referência: vulnerabilidade Dark Forest (Daira Hopwood) — campos
    // sem restrição de intervalo permitiram entradas fora do domínio.
    component voterBits = Num2Bits(40);
    voterBits.in <== voter_id;

    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== voter_id;

    // ── 2. Verificar pertencimento à Merkle tree (profundidade = depth) ──────
    //
    // DECISÃO ARQUITETURAL: implementação manual com Mux1 + Poseidon(2).
    // circomlib (npm circomlib@2.0.5) NÃO fornece um template de prova de
    // Merkle binária — apenas SMTVerifier (Sparse Merkle Tree), que tem
    // interface e semântica diferentes. A implementação manual abaixo segue
    // o padrão de Tornado Cash e Semaphore v2, usando Mux1 e Poseidon da
    // própria circomlib auditada.
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
    // Fórmula: Poseidon(voter_id, election_id, race_id)
    // Vincula o nullifier ao cargo específico — o mesmo eleitor pode votar em
    // cargos distintos (race_id diferente) sem ser bloqueado como voto duplo.
    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== voter_id;
    nullifierHasher.inputs[1] <== election_id;
    nullifierHasher.inputs[2] <== race_id;

    nullifier_hash === nullifierHasher.out;

    // ── 6. Dummy constraints para sinais públicos sem outros usos ────────────
    //
    // candidate_id: a validação do intervalo (0=branco, 999=nulo, 1..N) é feita
    // exclusivamente pelo contrato — o circuito aceita qualquer valor.
    // Dummy constraint: sem isso, candidate_id ficaria under-constrained e um
    // provador malicioso poderia alterar o candidato sem invalidar a prova.
    signal candidate_id_squared;
    candidate_id_squared <== candidate_id * candidate_id;

    // race_id: já é constrangido via nullifierHasher.inputs[2] <== race_id,
    // portanto NÃO é under-constrained. Este dummy constraint adicional é
    // mantido como defesa em profundidade (belt-and-suspenders) — se futuras
    // refatorações removerem o nullifier, o sinal continua protegido.
    // Custo: apenas 1 constraint extra.
    signal race_id_squared;
    race_id_squared <== race_id * race_id;
}

// Instância principal com profundidade 4 (suporta até 16 eleitores)
// 5 sinais públicos: merkle_root, nullifier_hash, candidate_id, election_id, race_id
component main {public [merkle_root, nullifier_hash, candidate_id, election_id, race_id]} = VoterProof(4);
