/**
 * generate_test_inputs.js
 *
 * Utilitário que constrói a Merkle tree de teste e expõe funções para gerar
 * inputs válidos e inválidos para o circuito voter_proof.
 *
 * Exporta:
 *   buildTestTree(poseidon, F, depth)  → { tree, root, leaves, voterIds }
 *   buildValidInput(...)               → input para prova válida
 *   buildMerkleProof(tree, leafIndex)  → { pathElements, pathIndices }
 */

"use strict";

const { buildPoseidon } = require("circomlibjs");

// CPFs de teste (11 dígitos, apenas números como BigInt)
const TEST_VOTER_IDS = [
  12345678901n, 98765432100n, 11122233344n, 55566677788n, 99900011122n,
  33344455566n, 77788899900n, 22233344455n, 66677788899n, 44455566677n,
  10203040506n, 60708090100n, 11213141516n, 61718191011n, 21314151617n,
];

/**
 * Constrói uma Merkle tree binária de profundidade `depth`.
 * Folhas = Poseidon(voter_id) para cada eleitor; posições extras preenchidas com F.zero.
 *
 * @returns {{ tree, root, leaves, voterIds }}
 */
async function buildTestTree(poseidon, F, depth) {
  const size = 1 << depth;
  const voterIds = TEST_VOTER_IDS.slice();

  // leaf_i = Poseidon(voter_id_i)
  const leaves = voterIds.map((id) => poseidon([id]));

  // Preencher com zero até 2^depth
  const paddedLeaves = leaves.slice();
  while (paddedLeaves.length < size) paddedLeaves.push(F.zero);

  // Construir árvore nível a nível
  const tree = [paddedLeaves];
  let level = paddedLeaves;
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(poseidon([level[i], level[i + 1]]));
    }
    tree.push(next);
    level = next;
  }

  const root = tree[tree.length - 1][0];
  return { tree, root, leaves, voterIds };
}

/**
 * Gera o caminho de prova de Merkle para a folha no índice `leafIndex`.
 *
 * @returns {{ pathElements: BigInt[], pathIndices: number[] }}
 */
function buildMerkleProof(tree, leafIndex) {
  const depth = tree.length - 1;
  const pathElements = [];
  const pathIndices = [];
  let idx = leafIndex;
  for (let d = 0; d < depth; d++) {
    const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
    pathElements.push(tree[d][sibling]);
    pathIndices.push(idx % 2); // 0 = filho esq, 1 = filho dir
    idx = Math.floor(idx / 2);
  }
  return { pathElements, pathIndices };
}

/**
 * Monta um objeto de input válido para o circuito, para o eleitor
 * no índice `voterIndex`.
 *
 * @param {Object}  opts
 * @param {Object}  opts.poseidon
 * @param {Object}  opts.F
 * @param {Array[]} opts.tree
 * @param {BigInt[]}opts.voterIds
 * @param {number}  opts.voterIndex   – índice do eleitor na árvore
 * @param {bigint}  opts.electionId
 * @param {bigint}  opts.raceId       – identificador do cargo (vinculado ao nullifier)
 * @param {bigint}  opts.candidateId
 * @returns {Object} input para snarkjs
 */
function buildValidInput({ poseidon, F, tree, voterIds, voterIndex, electionId, raceId, candidateId }) {
  const voterId = voterIds[voterIndex];
  const { pathElements, pathIndices } = buildMerkleProof(tree, voterIndex);
  // nullifier = Poseidon(voter_id, election_id, race_id) — um por (eleitor × cargo × eleição)
  const nullifier = poseidon([voterId, electionId, raceId]);
  const root = tree[tree.length - 1][0];

  return {
    voter_id: voterId.toString(),
    race_id: raceId.toString(),
    merkle_path: pathElements.map((x) => F.toString(x)),
    merkle_path_indices: pathIndices,
    merkle_root: F.toString(root),
    nullifier_hash: F.toString(nullifier),
    candidate_id: candidateId.toString(),
    election_id: electionId.toString(),
  };
}

module.exports = {
  TEST_VOTER_IDS,
  buildTestTree,
  buildMerkleProof,
  buildValidInput,
  buildPoseidon,
};
