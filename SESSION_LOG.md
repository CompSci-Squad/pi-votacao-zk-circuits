# SESSION_LOG — `pi-votacao-zk-circuits`

This log tracks circuit-layer work. For boundary/integration sessions, mirror
entries from the root [SESSION_LOG.md](../SESSION_LOG.md) live here as well —
see the per-repo and root `.github/copilot-instructions.md` for the protocol.

---

## Session — 2026-04-23 (integration mirror — first entry)

> Mirrored from root [SESSION_LOG.md](../SESSION_LOG.md) — *Integration session
> — 2026-04-23 (cont.)*. This is the first entry in this file; it exists because
> the root integration session produced findings about the circuit's artifacts.

### What was done that touched this repo
- **Nothing changed in the circuit source code or in `build/`.** This entry
  exists only to record cross-repo findings produced during the integration run
  in the sibling `pi-votacao-zk-blockchain` repo.

### Findings about this repo's artifacts
- The current `build/voter_proof_js/voter_proof.wasm` (2393088 bytes, mtime
  2026-04-23 00:54) and `build/voter_proof.zkey` (8866324 bytes) were synced
  into the blockchain repo via `scripts/sync_circuit_artifacts.sh` and are
  **functionally correct end-to-end**: a real PLONK proof generated against
  them is accepted by the on-chain `PlonkVerifier` derived from the same
  `.zkey`, and `castVote` succeeds.
- The 5 public signals exit the circuit in the order defined by
  `voter_proof.circom` line 128 (`merkle_root, nullifier_hash, candidate_id,
  election_id, race_id`) — matches the contract's `pubSignals[0..4]` reads
  exactly. **No drift detected.**
- `race_id` is a public *input* to the circuit, so the same `.zkey` accepts any
  `race_id` value at proving time. The previous session's note about
  `race_id = 1` being baked into `04_test_proof.js` was a *test-fixture* issue,
  not a circuit issue; the integration suite passes `race_id = 0` as input and
  the same `.zkey` produces a proof the blockchain accepts.

### Open items
- **sha256 capture**: provenance check from circuit commit → `.zkey` → on-chain
  `Verifier.sol` is not yet automated. Suggested next session: extend
  `Makefile` to emit `build/CHECKSUMS.txt`, and have
  `pi-votacao-zk-blockchain/scripts/sync_circuit_artifacts.sh` verify those
  checksums after copying.
- **Test fixture `scripts/04_test_proof.js`** still uses `race_id = 1`. Not a
  blocker for the integration suite (which builds its own input), but should
  be aligned with `POC_RACE_ID = 0` for consistency, or parameterized.

### Blockers
- None from this repo's side.

---

## Session — 2026-04-23 (mirror of integration root 5-gap closure)

Mirrored from root `pi_votacao/SESSION_LOG.md` entry of 2026-04-23.

### Changes in this repo
- `Makefile` — added `checksums` target writing `build/CHECKSUMS.txt` with sha256
  of `voter_proof.wasm`, `voter_proof.zkey`, `verification_key.json`, and
  `Verifier.sol`. The `artifacts` target now depends on it, so any rebuild
  produces a fresh CHECKSUMS automatically.

### Boundary findings from integration runs
- Real PLONK proof generation (off-circuit, via SnarkJS in the blockchain repo's
  `bench_circuit.js`) measured **3 462 ms** median over 3 timed runs (after
  warm-up). Off-chain verify median **13 ms**.
- R1CS shape confirmed: **3 143 constraints**, 3 151 wires, 9 private inputs,
  bn128 curve.
- Off-circuit nullifier helper (`circomlibjs.poseidon`) and on-circuit nullifier
  agree across all 10 integration scenarios — no `Poseidon(voter_id, election_id, race_id)`
  drift detected.
- On-chain `castVote` with the real `PlonkVerifier` (synced from `build/Verifier.sol`)
  costs avg **374 076** gas — within the 280k–400k expected range cited in
  `docs/security.md`.

### Artifact sha256 at session end (build/CHECKSUMS.txt)
- `voter_proof.wasm` — `0ca682228ccbb1d50687f48f629051f1f0d549e1e4110698d4a43799e752261f`
- `voter_proof.zkey` — `e338ebdcd39fe4a27d5bf62d423df93df186b3603165340e95024e4be66e0255`
- `verification_key.json` — `1dbc0a646a46a9fba14a0350fcc6c55872418efbabd46631aa5619708c726fbc`
- `Verifier.sol` — `e47b2770170208220433a8918fa26114abf77f09c0cb31f7aec7cf58f65666e8`

### Blockers
- None.

---

## Session — 2026-04-25 (mirror of integration root: dockerized anvil + 10/10 e2e)

Mirrored from root [SESSION_LOG.md](../SESSION_LOG.md) entry of 2026-04-25. Test-relevant portions only.

### What touched this repo
- **Nothing.** No circuit edit, no `make` target invoked, no rebuild.
- The integration suite consumed the pre-existing build artifacts (`build/voter_proof.wasm`, `build/voter_proof.zkey`, `build/verification_key.json`) via the blockchain repo's already-synced copies under `pi-votacao-zk-blockchain/scripts/artifacts/`.

### Boundary findings about this repo
- The currently published `Verifier.sol` (synced into the blockchain repo at `contracts/Verifier.sol`) is correct against the current circuit: 10/10 real-PLONK-proof end-to-end scenarios passed against a dockerized anvil, including:
  - relay-attack rejection (tampered `pubSignals[4]` raceId),
  - merkle-root mismatch rejection (`pubSignals[0]`),
  - election-id mismatch rejection (`pubSignals[3]`),
  - invalid-proof-bytes rejection (tampered `proof[0]`),
  - blank vote (`candidate_id = 0`) and null vote (`candidate_id = 999`) accounting.
- The off-circuit Poseidon nullifier helper (`circomlibjs.poseidon([voter_id, election_id, race_id])`) **agreed with the in-circuit nullifier** for every test, including the 3-voter results-audit scenario. No drift between off-circuit reference and in-circuit output.

### Open items / deferred
- None on the circuit side this session.

### Blockers
- None.

---

## Session — 2026-05-06 (integration mirror)

Cross-references root `SESSION_LOG.md` integration session of **2026-05-06**.

### Circuit-side findings
- **None.** Circuit, build artifacts and Verifier.sol were not touched this session.
- 13 / 13 integration scenarios in `pi-votacao-zk-blockchain/test/integration/e2e_real_proof.test.js` pass with real PLONK proofs — the existing `voter_proof.circom` and `voter_proof.zkey` correctly produce `nullifier = Poseidon(voter_id, election_id, race_id)` for `race_id ∈ {0, 1, 2}` as the multi-race contract requires.

### Artifact state — UNCHANGED
- `build/voter_proof.zkey` SHA-256 `e338ebdcd39fe4a27d5bf62d423df93df186b3603165340e95024e4be66e0255`.
- `build/Verifier.sol` SHA-256 (synced into `pi-votacao-zk-blockchain/src/Verifier.sol`) `fe24c84d00fecee466cf0cb39e824e43af781877e47cbe104aa1e06f063d6944`.

### No action required on this side.
