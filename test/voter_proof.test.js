/**
 * voter_proof.test.js
 *
 * Testes automatizados do circuito voter_proof com Mocha + Chai.
 *
 * Casos de teste:
 *   1. Prova válida — eleitor cadastrado, candidato válido
 *   2. Eleitor não cadastrado — voter_id não está na Merkle tree
 *   3. Merkle path incorreto — irmãos errados
 *   4. Nullifier incorreto — nullifier_hash não deriva de (voter_id, election_id)
 *   5. Voto em branco — candidate_id = 0
 *   6. Voto nulo — candidate_id = 999
 *
 * Os testes que precisam de prova completa (WASM + zkey) são pulados
 * automaticamente se os artefatos de build não existirem.
 * Execute `npm run compile && npm run setup` para habilitá-los.
 */

"use strict";

const { expect } = require("chai");
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const {
  buildPoseidon,
  buildTestTree,
  buildMerkleProof,
  buildValidInput,
  TEST_VOTER_IDS,
} = require("./generate_test_inputs");

const BUILD_DIR = path.join(__dirname, "../build");
const WASM_PATH = path.join(BUILD_DIR, "voter_proof_js", "voter_proof.wasm");
const ZKEY_PATH = path.join(BUILD_DIR, "voter_proof.zkey");
const VKEY_PATH = path.join(BUILD_DIR, "verification_key.json");

const DEPTH = 4;
const ELECTION_ID = 1n;
const RACE_ID = 1n;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tenta calcular a witness para os inputs fornecidos.
 * Lança se as constraints não forem satisfeitas.
 */
async function calculateWitness(input) {
  if (!fs.existsSync(WASM_PATH)) {
    throw new Error("SKIP: WASM não encontrado — execute npm run compile");
  }
  const tmpWitness = path.join(BUILD_DIR, `_test_witness_${Date.now()}.wtns`);
  try {
    await snarkjs.wtns.calculate(input, WASM_PATH, tmpWitness);
  } finally {
    if (fs.existsSync(tmpWitness)) fs.unlinkSync(tmpWitness);
  }
}

/**
 * Gera e verifica uma prova PLONK completa.
 * Requer WASM + zkey + verification_key.
 */
async function proveAndVerify(input) {
  if (!fs.existsSync(WASM_PATH) || !fs.existsSync(ZKEY_PATH)) {
    return null; // Indicador de "skip"
  }
  const { proof, publicSignals } = await snarkjs.plonk.fullProve(
    input,
    WASM_PATH,
    ZKEY_PATH
  );
  const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
  const ok = await snarkjs.plonk.verify(vKey, publicSignals, proof);
  return ok;
}

// ── Suite de testes ──────────────────────────────────────────────────────────

describe("VoterProof – circuito ZK de votação", function () {
  this.timeout(120_000); // Geração de prova pode levar até 2 minutos

  let poseidon, F, tree, voterIds, root;

  before(async function () {
    poseidon = await buildPoseidon();
    F = poseidon.F;
    ({ tree, root, voterIds } = await buildTestTree(poseidon, F, DEPTH));
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  });

  // ── 1. Prova válida ─────────────────────────────────────────────────────────
  describe("1. Prova válida", function () {
    it("deve gerar witness válida para eleitor cadastrado", async function () {
      if (!fs.existsSync(WASM_PATH)) return this.skip();

      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 13n,
      });

      await calculateWitness(input); // não deve lançar exceção
    });

    it("deve gerar e verificar prova PLONK completa", async function () {
      if (!fs.existsSync(WASM_PATH) || !fs.existsSync(ZKEY_PATH)) {
        return this.skip();
      }

      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 13n,
      });

      const ok = await proveAndVerify(input);
      expect(ok).to.equal(true);
    });
  });

  // ── 2. Eleitor não cadastrado ───────────────────────────────────────────────
  describe("2. Eleitor não cadastrado", function () {
    it("deve falhar para voter_id cujo hash não está na Merkle tree", async function () {
      if (!fs.existsSync(WASM_PATH)) return this.skip();

      // voter_id válido mas pertencente a outro eleitor (índice 1)
      // porém usando o merkle_path do índice 0 → root não bate
      const intruderVoterId = 99999999999n; // não está na árvore
      const { pathElements, pathIndices } = buildMerkleProof(tree, 0);
      const nullifier = poseidon([intruderVoterId, ELECTION_ID, RACE_ID]);

      const input = {
        voter_id: intruderVoterId.toString(),        race_id: RACE_ID.toString(),        merkle_path: pathElements.map((x) => F.toString(x)),
        merkle_path_indices: pathIndices,
        merkle_root: F.toString(root),
        nullifier_hash: F.toString(nullifier),
        candidate_id: "13",
        election_id: ELECTION_ID.toString(),
      };

      let threw = false;
      try {
        await calculateWitness(input);
      } catch {
        threw = true;
      }
      expect(threw, "Deveria falhar para eleitor não cadastrado").to.equal(true);
    });
  });

  // ── 3. Merkle path incorreto ────────────────────────────────────────────────
  describe("3. Merkle path incorreto", function () {
    it("deve falhar quando os irmãos do caminho estão errados", async function () {
      if (!fs.existsSync(WASM_PATH)) return this.skip();

      const voterId = voterIds[0];
      // Usar o caminho do eleitor de índice 1 com o voter_id do índice 0
      const { pathElements: wrongPath, pathIndices: wrongIndices } = buildMerkleProof(tree, 1);
      const nullifier = poseidon([voterId, ELECTION_ID, RACE_ID]);

      const input = {
        voter_id: voterId.toString(),
        race_id: RACE_ID.toString(),
        merkle_path: wrongPath.map((x) => F.toString(x)),
        merkle_path_indices: wrongIndices,
        merkle_root: F.toString(root),
        nullifier_hash: F.toString(nullifier),
        candidate_id: "13",
        election_id: ELECTION_ID.toString(),
      };

      let threw = false;
      try {
        await calculateWitness(input);
      } catch {
        threw = true;
      }
      expect(threw, "Deveria falhar com merkle_path incorreto").to.equal(true);
    });
  });

  // ── 4. Nullifier incorreto ──────────────────────────────────────────────────
  describe("4. Nullifier incorreto", function () {
    it("deve falhar quando nullifier_hash não corresponde a Poseidon(voter_id, election_id, race_id)", async function () {
      if (!fs.existsSync(WASM_PATH)) return this.skip();

      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 13n,
      });

      // Substituir pelo nullifier de um eleitor diferente
      const wrongNullifier = poseidon([voterIds[1], ELECTION_ID, RACE_ID]);
      input.nullifier_hash = F.toString(wrongNullifier);

      let threw = false;
      try {
        await calculateWitness(input);
      } catch {
        threw = true;
      }
      expect(threw, "Deveria falhar com nullifier_hash incorreto").to.equal(true);
    });
  });

  // ── 5. Voto em branco ───────────────────────────────────────────────────────
  describe("5. Voto em branco (candidate_id = 0)", function () {
    it("deve gerar witness válida para voto em branco", async function () {
      if (!fs.existsSync(WASM_PATH)) return this.skip();

      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 2,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 0n, // branco
      });

      await calculateWitness(input); // não deve lançar
    });

    it("deve gerar e verificar prova PLONK para voto em branco", async function () {
      if (!fs.existsSync(WASM_PATH) || !fs.existsSync(ZKEY_PATH)) {
        return this.skip();
      }

      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 2,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 0n,
      });

      const ok = await proveAndVerify(input);
      expect(ok).to.equal(true);
    });
  });

  // ── 6. Voto nulo ────────────────────────────────────────────────────────────
  describe("6. Voto nulo (candidate_id = 999)", function () {
    it("deve gerar witness válida para voto nulo", async function () {
      if (!fs.existsSync(WASM_PATH)) return this.skip();

      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 3,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 999n, // nulo
      });

      await calculateWitness(input); // não deve lançar
    });

    it("deve gerar e verificar prova PLONK para voto nulo", async function () {
      if (!fs.existsSync(WASM_PATH) || !fs.existsSync(ZKEY_PATH)) {
        return this.skip();
      }

      const input = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 3,
        electionId: ELECTION_ID,
        raceId: RACE_ID,
        candidateId: 999n,
      });

      const ok = await proveAndVerify(input);
      expect(ok).to.equal(true);
    });
  });

  // ── 7. Isolamento por race_id ──────────────────────────────────────────────
  describe("7. Isolamento por race_id", function () {
    it("deve produzir nullifiers diferentes para race_id=1 e race_id=2 com mesmo voter_id", async function () {
      if (!fs.existsSync(WASM_PATH)) return this.skip();

      const inputRace1 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: 1n,
        candidateId: 13n,
      });

      const inputRace2 = buildValidInput({
        poseidon, F, tree, voterIds,
        voterIndex: 0,
        electionId: ELECTION_ID,
        raceId: 2n,
        candidateId: 13n,
      });

      expect(inputRace1.nullifier_hash).to.not.equal(
        inputRace2.nullifier_hash,
        "Nullifiers de race_id distintos devem diferir para prevenir duplo vôto entre cargos"
      );

      // Ambas as witnesses devem ser válidas individualmente
      await calculateWitness(inputRace1);
      await calculateWitness(inputRace2);
    });
  });
});
