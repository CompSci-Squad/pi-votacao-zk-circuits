/**
 * voter_proof.test.js
 *
 * Comprehensive test suite for the VoterProof circuit using circom_tester.
 * Tests run at the witness level (no build artifacts needed — circom_tester
 * compiles automatically) with checkConstraints() to verify R1CS satisfaction.
 *
 * Test categories (per copilot-instructions.md §5):
 *   1.  Happy path — valid voter, correct Merkle path, correct nullifier
 *   2.  Wrong Merkle root — modified root → constraint failure
 *   3.  Invalid Merkle path — tampered siblings → constraint failure
 *   4.  Nullifier binding — same inputs always produce the same nullifier
 *   5.  Nullifier distinctness — different race_id → different nullifier
 *   6.  Relay attack guard — changing race_id on valid proof invalidates it
 *   7.  Blank vote — candidate_id = 0
 *   8.  Null vote — candidate_id = 999
 *   9.  Constraint coverage — all signals constrained
 *  10.  Cross-verification — circuit Poseidon output matches circomlibjs
 *  11.  Edge cases — boundary inputs, unregistered voters
 *
 * Run: npx mocha test/voter_proof.test.js --timeout 300000
 */

"use strict";

const { expect } = require("chai");
const { getPoseidon } = require("./helpers/poseidon");
const { DEPTH, buildTestTree, buildMerkleProof } = require("./helpers/merkle");
const {
  TEST_VOTER_IDS,
  DEFAULT_ELECTION_ID,
  DEFAULT_RACE_ID,
  DEFAULT_CANDIDATE_ID,
  buildValidInput,
} = require("./helpers/input");
const { getCircuit } = require("./helpers/circuit");

const ELECTION_ID = DEFAULT_ELECTION_ID;
const RACE_ID = DEFAULT_RACE_ID;

describe("VoterProof — ZK voting circuit", function () {
  this.timeout(300_000); // circom_tester compilation can take a while

  let poseidon, F, tree, voterIds, root;
  let circuit;

  before(async function () {
    ({ poseidon, F } = await getPoseidon());
    ({ tree, root, voterIds } = buildTestTree(poseidon, F, DEPTH, TEST_VOTER_IDS));
    circuit = await getCircuit();
  });

  // ── Helper: build input and calculate + check witness ──────────────────────
  async function expectWitnessSuccess(input) {
    const w = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(w);
    return w;
  }

  async function expectWitnessFailure(input, message) {
    let threw = false;
    try {
      const w = await circuit.calculateWitness(input, true);
      await circuit.checkConstraints(w);
    } catch (err) {
      const errMsg = (err.message || err.toString()).toLowerCase();
      const isCircuitError =
        errMsg.includes("constraint") ||
        errMsg.includes("assert") ||
        errMsg.includes("witness") ||
        errMsg.includes("not satisfy") ||
        errMsg.includes("error in template");
      if (!isCircuitError) {
        throw new Error(
          `Expected circuit constraint/witness error, but got unexpected error: ${err.message || err}`
        );
      }
      threw = true;
    }
    expect(threw, message || "Expected witness/constraint failure").to.equal(true);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. HAPPY PATH
  // ══════════════════════════════════════════════════════════════════════════════
  describe("1. Happy path — valid voter", function () {
    it("should generate a valid witness for a registered voter", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      await expectWitnessSuccess(input);
    });

    it("should work for multiple distinct voters", async function () {
      for (const idx of [0, 1, 2, 5, 14]) {
        const input = buildValidInput({
          poseidon, F, tree, voterIds,
          voterIndex: idx,
          electionId: ELECTION_ID,
          raceId: RACE_ID,
          candidateId: DEFAULT_CANDIDATE_ID,
        });
        await expectWitnessSuccess(input);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. WRONG MERKLE ROOT
  // ══════════════════════════════════════════════════════════════════════════════
  describe("2. Wrong merkle_root", function () {
    it("should reject when merkle_root is tampered", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      const fakeRoot = poseidon([42n]);
      input.merkle_root = F.toString(fakeRoot);

      await expectWitnessFailure(input, "Should reject tampered merkle_root");
    });

    it("should reject when merkle_root is zero", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      input.merkle_root = "0";

      await expectWitnessFailure(input, "Should reject zero merkle_root");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 3. INVALID MERKLE PATH
  // ══════════════════════════════════════════════════════════════════════════════
  describe("3. Invalid Merkle path", function () {
    it("should reject when sibling elements are from a different voter's path", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      const { pathElements: wrongPath, pathIndices: wrongIndices } = buildMerkleProof(tree, 1);
      input.merkle_path = wrongPath.map((x) => F.toString(x));
      input.merkle_path_indices = wrongIndices;

      await expectWitnessFailure(input, "Should reject mismatched Merkle path");
    });

    it("should reject when a single sibling is zeroed", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      input.merkle_path[0] = "0";

      await expectWitnessFailure(input, "Should reject zeroed sibling");
    });

    it("should reject when path_indices are invalid (not binary)", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      input.merkle_path_indices[0] = 2;

      await expectWitnessFailure(input, "Should reject non-binary path index");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 4. NULLIFIER BINDING (deterministic)
  // ══════════════════════════════════════════════════════════════════════════════
  describe("4. Nullifier binding", function () {
    it("same (voter_id, election_id, race_id) always yields same nullifier", function () {
      const null1 = poseidon([voterIds[0], ELECTION_ID, RACE_ID]);
      const null2 = poseidon([voterIds[0], ELECTION_ID, RACE_ID]);
      expect(F.toString(null1)).to.equal(F.toString(null2));
    });

    it("should reject when nullifier_hash doesn't match Poseidon(voter_id, election_id, race_id)", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      const wrongNullifier = poseidon([voterIds[1], ELECTION_ID, RACE_ID]);
      input.nullifier_hash = F.toString(wrongNullifier);

      await expectWitnessFailure(input, "Should reject mismatched nullifier_hash");
    });

    it("should reject when nullifier uses only 2 inputs (missing race_id)", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      const twoInputNull = poseidon([voterIds[0], ELECTION_ID]);
      input.nullifier_hash = F.toString(twoInputNull);

      await expectWitnessFailure(input, "Should reject 2-input nullifier (missing race_id)");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 5. NULLIFIER DISTINCTNESS
  // ══════════════════════════════════════════════════════════════════════════════
  describe("5. Nullifier distinctness", function () {
    it("different race_id → different nullifier for same voter (on-circuit)", async function () {
      const input1 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: 1n,
        candidateId: DEFAULT_CANDIDATE_ID,
      });
      await expectWitnessSuccess(input1);

      const input2 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: 2n,
        candidateId: DEFAULT_CANDIDATE_ID,
      });
      await expectWitnessSuccess(input2);

      expect(input1.nullifier_hash).to.not.equal(input2.nullifier_hash);
    });

    it("different election_id → different nullifier for same voter (on-circuit)", async function () {
      const input1 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: 1n,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });
      await expectWitnessSuccess(input1);

      const input2 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: 2n,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });
      await expectWitnessSuccess(input2);

      expect(input1.nullifier_hash).to.not.equal(input2.nullifier_hash);
    });

    it("different voter_id → different nullifier for same election/race (on-circuit)", async function () {
      const input1 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });
      await expectWitnessSuccess(input1);

      const input2 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 1,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });
      await expectWitnessSuccess(input2);

      expect(input1.nullifier_hash).to.not.equal(input2.nullifier_hash);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 6. RELAY ATTACK GUARD
  // ══════════════════════════════════════════════════════════════════════════════
  describe("6. Relay attack guard", function () {
    it("proof valid for race_id=1 should fail when race_id is changed to 2", async function () {
      const input1 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: 1n,
        candidateId: DEFAULT_CANDIDATE_ID,
      });
      await expectWitnessSuccess(input1);

      // Tamper: change race_id but keep race_id=1's nullifier
      const tamperedInput = { ...input1, race_id: "2" };

      await expectWitnessFailure(
        tamperedInput,
        "Should reject when race_id is changed but nullifier stays the same"
      );
    });

    it("swapping nullifier_hash to another race should fail", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: 1n,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      const wrongNull = poseidon([voterIds[0], ELECTION_ID, 2n]);
      input.nullifier_hash = F.toString(wrongNull);

      await expectWitnessFailure(input, "Should reject cross-race nullifier");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 7. BLANK VOTE (candidate_id = 0)
  // ══════════════════════════════════════════════════════════════════════════════
  describe("7. Blank vote (candidate_id = 0)", function () {
    it("should generate a valid witness for blank vote", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 2,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 0n,
      });

      await expectWitnessSuccess(input);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 8. NULL VOTE (candidate_id = 999)
  // ══════════════════════════════════════════════════════════════════════════════
  describe("8. Null vote (candidate_id = 999)", function () {
    it("should generate a valid witness for null vote", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 3,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 999n,
      });

      await expectWitnessSuccess(input);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 9. CONSTRAINT COVERAGE
  // ══════════════════════════════════════════════════════════════════════════════
  describe("9. Constraint coverage", function () {
    it("voter_id outside 40-bit range should fail (Num2Bits check)", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      // 2^41 breaks Num2Bits(40)
      const hugeVoterId = (1n << 41n).toString();
      input.voter_id = hugeVoterId;
      input.nullifier_hash = F.toString(poseidon([BigInt(hugeVoterId), ELECTION_ID, RACE_ID]));

      await expectWitnessFailure(input, "Should reject voter_id > 2^40");
    });

    it("all public signals participate in constraints", async function () {
      const baseInput = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      await expectWitnessSuccess(baseInput);

      // merkle_root: constrained via === levelHashes[depth]
      const tampered1 = { ...baseInput, merkle_root: F.toString(poseidon([42n])) };
      await expectWitnessFailure(tampered1, "merkle_root must be constrained");

      // nullifier_hash: constrained via === nullifierHasher.out
      const tampered2 = { ...baseInput, nullifier_hash: F.toString(poseidon([42n])) };
      await expectWitnessFailure(tampered2, "nullifier_hash must be constrained");

      // election_id: constrained via nullifier computation
      const tampered3 = { ...baseInput, election_id: "999" };
      await expectWitnessFailure(tampered3, "election_id must be constrained");

      // race_id: constrained via nullifier computation + dummy
      const tampered4 = { ...baseInput, race_id: "999" };
      await expectWitnessFailure(tampered4, "race_id must be constrained");

      // candidate_id: constrained via dummy x*x (any value is valid)
      const candidateInput = { ...baseInput, candidate_id: "42" };
      await expectWitnessSuccess(candidateInput);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 10. CROSS-VERIFICATION with circomlibjs
  // ══════════════════════════════════════════════════════════════════════════════
  describe("10. Cross-verification with circomlibjs", function () {
    it("nullifier computed off-circuit matches circuit expectation", async function () {
      const voterId = voterIds[0];
      const offCircuitNullifier = F.toString(poseidon([voterId, ELECTION_ID, RACE_ID]));

      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      expect(input.nullifier_hash).to.equal(offCircuitNullifier);
      await expectWitnessSuccess(input);
    });

    it("leaf hash computed off-circuit matches Poseidon(voter_id)", function () {
      for (const id of voterIds) {
        const offCircuitLeaf = F.toString(poseidon([id]));
        const treeLeaf = F.toString(tree[0][voterIds.indexOf(id)]);
        expect(offCircuitLeaf).to.equal(treeLeaf);
      }
    });

    it("Merkle root recomputed from leaves matches tree root", function () {
      const size = 1 << DEPTH;
      const leaves = voterIds.map((id) => poseidon([id]));
      while (leaves.length < size) leaves.push(F.zero);

      let level = leaves;
      for (let d = 0; d < DEPTH; d++) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
          next.push(poseidon([level[i], level[i + 1]]));
        }
        level = next;
      }

      expect(F.toString(level[0])).to.equal(F.toString(root));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 11. EDGE CASES
  // ══════════════════════════════════════════════════════════════════════════════
  describe("11. Edge cases", function () {
    it("unregistered voter (voter_id not in tree) should fail", async function () {
      const intruder = 99999999999n;
      const { pathElements, pathIndices } = buildMerkleProof(tree, 0);
      const nullifier = poseidon([intruder, ELECTION_ID, RACE_ID]);

      const input = {
        voter_id: intruder.toString(),
        race_id: RACE_ID.toString(),
        merkle_path: pathElements.map((x) => F.toString(x)),
        merkle_path_indices: pathIndices,
        merkle_root: F.toString(root),
        nullifier_hash: F.toString(nullifier),
        candidate_id: DEFAULT_CANDIDATE_ID.toString(),
        election_id: ELECTION_ID.toString(),
      };

      await expectWitnessFailure(input, "Unregistered voter should be rejected");
    });

    it("voter_id = 0 should fail (not in tree)", async function () {
      const { pathElements, pathIndices } = buildMerkleProof(tree, 0);
      const nullifier = poseidon([0n, ELECTION_ID, RACE_ID]);

      const input = {
        voter_id: "0",
        race_id: RACE_ID.toString(),
        merkle_path: pathElements.map((x) => F.toString(x)),
        merkle_path_indices: pathIndices,
        merkle_root: F.toString(root),
        nullifier_hash: F.toString(nullifier),
        candidate_id: DEFAULT_CANDIDATE_ID.toString(),
        election_id: ELECTION_ID.toString(),
      };

      await expectWitnessFailure(input, "voter_id=0 should be rejected (not in tree)");
    });

    it("large candidate_id should still produce valid witness", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 99999n,
      });

      await expectWitnessSuccess(input);
    });

    it("last voter in tree (index 14) should work", async function () {
      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 14,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: DEFAULT_CANDIDATE_ID,
      });

      await expectWitnessSuccess(input);
    });
  });
});
