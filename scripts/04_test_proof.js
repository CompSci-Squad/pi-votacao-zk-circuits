/**
 * 04_test_proof.js
 * Script de demonstração: gera e verifica uma prova PLONK para o circuito
 * voter_proof, exibindo o tempo de geração.
 *
 * Uso:
 *   npm test
 */

"use strict";

const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

const BUILD_DIR = path.join(__dirname, "../build");
const INPUTS_DIR = path.join(__dirname, "../inputs");

// ── Utilitários Merkle ────────────────────────────────────────────────────────

async function buildMerkleTree(leaves, poseidon, F, depth) {
  const size = 1 << depth;
  const padded = leaves.slice();
  while (padded.length < size) padded.push(F.zero);

  const tree = [padded];
  let level = padded;
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(poseidon([level[i], level[i + 1]]));
    }
    tree.push(next);
    level = next;
  }
  return tree;
}

function getMerkleProof(tree, leafIndex) {
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Sistema de Votação ZK – Teste de Prova ===\n");

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const DEPTH = 4;

  // Simular 15 eleitores com voter_id baseado em CPF (11 dígitos)
  const voterIds = [
    12345678901n, 98765432100n, 11122233344n, 55566677788n, 99900011122n,
    33344455566n, 77788899900n, 22233344455n, 66677788899n, 44455566677n,
    10203040506n, 60708090100n, 11213141516n, 61718191011n, 21314151617n,
  ];

  console.log(`Construindo Merkle tree (profundidade=${DEPTH}, ${voterIds.length} eleitores)...`);

  // leaf_i = Poseidon(voter_id_i)
  const leaves = voterIds.map((id) => poseidon([id]));
  const tree = await buildMerkleTree(leaves, poseidon, F, DEPTH);
  const root = tree[tree.length - 1][0];

  console.log("Merkle root:", F.toString(root));

  // ── Eleitor de teste: índice 0 ────────────────────────────────────────────
  const TEST_INDEX = 0;
  const voterId = voterIds[TEST_INDEX];
  const electionId = 1n;
  const raceId = 1n;    // cargo (vinculado ao nullifier como sinal privado)
  const candidateId = 13n; // candidato número 13

  const { pathElements, pathIndices } = getMerkleProof(tree, TEST_INDEX);
  const nullifier = poseidon([voterId, electionId, raceId]);

  console.log("\nEleitor de teste:");
  console.log("  voter_id      :", voterId.toString(), "(CPF)");
  console.log("  election_id   :", electionId.toString());
  console.log("  race_id       :", raceId.toString());
  console.log("  candidate_id  :", candidateId.toString());
  console.log("  nullifier_hash:", F.toString(nullifier));

  // ── Montar input para o circuito ──────────────────────────────────────────
  const input = {
    voter_id: voterId.toString(),
    race_id: raceId.toString(),
    merkle_path: pathElements.map((x) => F.toString(x)),
    merkle_path_indices: pathIndices,
    merkle_root: F.toString(root),
    nullifier_hash: F.toString(nullifier),
    candidate_id: candidateId.toString(),
    election_id: electionId.toString(),
  };

  // ── Salvar input de exemplo ───────────────────────────────────────────────
  fs.mkdirSync(INPUTS_DIR, { recursive: true });
  const inputPath = path.join(INPUTS_DIR, "example_input.json");
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));
  console.log("\nInput salvo em:", inputPath);

  // ── Verificar artefatos de build ──────────────────────────────────────────
  const wasmPath = path.join(BUILD_DIR, "voter_proof_js", "voter_proof.wasm");
  const zkeyPath = path.join(BUILD_DIR, "voter_proof.zkey");
  const vkeyPath = path.join(BUILD_DIR, "verification_key.json");

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    console.log("\n⚠️  Artefatos de build não encontrados.");
    console.log("   Execute os passos abaixo antes de gerar a prova:");
    console.log("     npm run compile");
    console.log("     npm run setup");
    console.log("\nInput de exemplo gerado com sucesso!");
    process.exit(0);
  }

  // ── Gerar prova PLONK ─────────────────────────────────────────────────────
  console.log("\nGerando prova PLONK...");
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.plonk.fullProve(
    input,
    wasmPath,
    zkeyPath
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log(`Prova gerada em ${elapsed}s`);
  console.log("Sinais públicos:", publicSignals);

  // Salvar prova
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.writeFileSync(path.join(BUILD_DIR, "proof.json"), JSON.stringify(proof, null, 2));
  fs.writeFileSync(path.join(BUILD_DIR, "public.json"), JSON.stringify(publicSignals, null, 2));

  // ── Verificar prova ───────────────────────────────────────────────────────
  const vKey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const ok = await snarkjs.plonk.verify(vKey, publicSignals, proof);

  if (ok) {
    console.log("\n✅ Prova verificada com sucesso!");
    console.log(`   Tempo de geração: ${elapsed}s`);
  } else {
    console.error("\n❌ Verificação da prova falhou!");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
