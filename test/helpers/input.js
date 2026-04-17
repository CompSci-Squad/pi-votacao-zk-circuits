"use strict";

const { buildMerkleProof } = require("./merkle");

// CPFs de teste (11 dígitos, apenas números como BigInt)
const TEST_VOTER_IDS = [
  12345678901n, 98765432100n, 11122233344n, 55566677788n, 99900011122n,
  33344455566n, 77788899900n, 22233344455n, 66677788899n, 44455566677n,
  10203040506n, 60708090100n, 11213141516n, 61718191011n, 21314151617n,
];

const DEFAULT_ELECTION_ID = 1n;
const DEFAULT_RACE_ID = 1n;
const DEFAULT_CANDIDATE_ID = 13n;

/**
 * Builds a valid circuit input for the voter at `voterIndex`.
 */
function buildValidInput({ poseidon, F, tree, voterIds, voterIndex, electionId, raceId, candidateId }) {
  const voterId = voterIds[voterIndex];
  const { pathElements, pathIndices } = buildMerkleProof(tree, voterIndex);
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
  DEFAULT_ELECTION_ID,
  DEFAULT_RACE_ID,
  DEFAULT_CANDIDATE_ID,
  buildValidInput,
};
