# Powers of Tau

Este diretório deve conter o arquivo **Powers of Tau** necessário para o trusted setup PLONK.

O arquivo provém da cerimônia multi-party da **Hermez Network** e garante a segurança do protocolo PLONK de forma universal — o mesmo arquivo pode ser reutilizado para qualquer circuito dentro do limite de constraints.

> O script `scripts/02_setup.sh` **baixa automaticamente** o arquivo caso ele não exista.

---

## Download manual

Para circuitos com até **2^14 (16.384) constraints** (suficiente para este circuito):

```bash
curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau \
     -o powersOfTau28_hez_final_14.ptau
```

| Arquivo                              | Tamanho  | Constraints máximos |
|--------------------------------------|----------|---------------------|
| `powersOfTau28_hez_final_14.ptau`    | ~120 MB  | 2^14 = 16.384       |
| `powersOfTau28_hez_final_15.ptau`    | ~240 MB  | 2^15 = 32.768       |

> ⚠️ Os arquivos `.ptau` estão no `.gitignore` devido ao tamanho.

---

## Verificação de integridade

```bash
npx snarkjs powersoftau verify powersOfTau28_hez_final_14.ptau
```

---

## Número de constraints deste circuito

| Componente              | Estimativa |
|-------------------------|-----------|
| Poseidon(voter_id)       | ~240      |
| Merkle path (4 níveis)   | ~960      |
| Poseidon(nullifier)      | ~240      |
| **Total estimado**       | **~1.500** |

O arquivo `_14.ptau` (2^14 = 16.384) é mais que suficiente.
