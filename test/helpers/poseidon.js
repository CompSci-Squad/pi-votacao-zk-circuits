"use strict";

const { buildPoseidon } = require("circomlibjs");

let _poseidon = null;
let _F = null;

/**
 * Singleton Poseidon instance shared across all test files.
 * Avoids rebuilding the WASM instance (~500ms) for every test file.
 */
async function getPoseidon() {
  if (!_poseidon) {
    _poseidon = await buildPoseidon();
    _F = _poseidon.F;
  }
  return { poseidon: _poseidon, F: _F };
}

module.exports = { getPoseidon };
