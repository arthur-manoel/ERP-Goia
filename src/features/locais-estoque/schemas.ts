/**
 * O formulário valida com os mesmos schemas da API (nome de 1 a 100 caracteres,
 * descrição até 255), reaproveitando os do módulo.
 */
export {
  createLocalSchema,
  patchLocalSchema,
} from "../../../modules/locais_estoque/schema"
