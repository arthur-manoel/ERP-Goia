import type { EstoqueOpcao, ItemMovimentavel } from "./tipos"

// DADOS FICTÍCIOS E TEMPORÁRIOS. Só `opcoes.ts` importa este arquivo.
// Ao integrar a API, apague este arquivo e troque a implementação em `opcoes.ts`.

export const itensMock: ItemMovimentavel[] = [
  { id: 1, codigo: "CAM-001", nome: "Camiseta X", unidade: "un" },
  { id: 2, codigo: "CAM-002", nome: "Camiseta Polo Azul M", unidade: "un" },
  { id: 3, codigo: "CAL-014", nome: "Calça Jeans Slim 42", unidade: "un" },
  { id: 4, codigo: "TEC-010", nome: "Malha algodão cru", unidade: "kg" },
  { id: 5, codigo: "TEC-022", nome: "Tecido oxford azul", unidade: "m" },
  { id: 6, codigo: "AVI-005", nome: "Botão 4 furos 15 mm", unidade: "un" },
  { id: 7, codigo: "AVI-009", nome: "Zíper 20 cm preto", unidade: "un" },
  { id: 8, codigo: "AVI-031", nome: "Linha de costura branca", unidade: "un" },
]

export const estoquesMock: EstoqueOpcao[] = [
  { id: 1, nome: "Estoque Principal" },
  { id: 2, nome: "Estoque Loja" },
  { id: 3, nome: "Estoque Produção" },
]
