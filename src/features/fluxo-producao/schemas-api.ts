/**
 * Schemas da API de fluxos de produção. O formulário valida com as mesmas
 * regras do backend (nome até 100, descrição até 255, de 1 a 100 setores sem
 * repetir), reaproveitando o schema do módulo.
 *
 * Obs.: `schemas.ts` desta pasta é do protótipo antigo (dados de mentira) e
 * ainda é usado por `features/erp`; por isso estes ficam em arquivo separado.
 */
export {
  fluxoSchema,
  editarFluxoSchema,
} from "../../modules/fluxos/fluxos.schema"
