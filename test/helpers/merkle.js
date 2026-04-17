"use strict";

const DEPTH = 4;

/**
 * Builds a binary Merkle tree of `depth` levels.
 * Leaves = Poseidon(voter_id) for each voter; empty slots filled with F.zero.
 *
 * @returns {{ tree: Array[], root: BigInt, leaves: BigInt[], voterIds: BigInt[] }}
 */
function buildTestTree(poseidon, F, depth = DEPTH, voterIds = []) {
  const size = 1 << depth;

  const leaves = voterIds.map((id) => poseidon([id]));
  const paddedLeaves = leaves.slice();
  while (paddedLeaves.length < size) paddedLeaves.push(F.zero);

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
 * Generates the Merkle proof (path elements + direction indices)
 * for the leaf at `leafIndex`.
 */
function buildMerkleProof(tree, leafIndex) {
  const depth = tree.length - 1;
  const pathElements = [];
  const pathIndices = [];
  let idx = leafIndex;
  for (let d = 0; d < depth; d++) {
    const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
    pathElements.push(tree[d][sibling]);
    pathIndices.push(idx % 2);
    idx = Math.floor(idx / 2);
  }
  return { pathElements, pathIndices };
}

module.exports = { DEPTH, buildTestTree, buildMerkleProof };
