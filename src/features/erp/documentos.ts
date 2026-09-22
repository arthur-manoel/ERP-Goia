// Compatibilidade temporária: a validação de documentos pertence ao domínio clientes.
export {
  normalizarDocumento as normalizeDocument,
  cpfValido as isCPF,
  cnpjValido as isCNPJ,
} from "@/features/clientes/documentos"
