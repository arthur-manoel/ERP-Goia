// Fonte única das regras de validação: são os mesmos schemas que a API usa
// (modules/fornecedores/schema.ts). Assim o formulário e o servidor nunca
// divergem. O arquivo só importa o zod, então é seguro no navegador.
export {
  createFornecedorSchema,
  updateFornecedorSchema,
} from "../../../modules/fornecedores/schema"
