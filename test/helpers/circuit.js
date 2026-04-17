"use strict";

const path = require("path");
const wasm_tester = require("circom_tester").wasm;

const CIRCUIT_PATH = path.join(__dirname, "../../circuits/voter_proof.circom");

let _circuit = null;

/**
 * Returns a shared circom_tester circuit instance (compiles once, reuses).
 * The first call compiles the circuit (~10-30s); subsequent calls are instant.
 */
async function getCircuit() {
  if (!_circuit) {
    _circuit = await wasm_tester(CIRCUIT_PATH, {
      output: path.join(__dirname, "../../build/test_circuit"),
      include: [path.join(__dirname, "../../node_modules")],
    });
  }
  return _circuit;
}

module.exports = { getCircuit, CIRCUIT_PATH };
