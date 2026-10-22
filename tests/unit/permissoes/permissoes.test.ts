import { describe, expect, it } from "vitest"
import {
  filtroPermissao,
  recursos,
  temPermissao,
  type Acao,
} from "../../../src/lib/permissoes"

const acoes: Acao[] = ["ler", "criar", "editar", "excluir"]
const vinculo = () => ({
  nivel_acesso: "USUARIO",
  usuarios: { nivel_acesso: "USUARIO" },
  permissoes_usuario: [] as Array<{
    recurso: string
    pode_ler?: boolean
    pode_criar?: boolean
    pode_editar?: boolean
    pode_excluir?: boolean
  }>,
})

describe.each(recursos)("%s", (recurso) => {
  it.each(acoes)(
    "%s exige concessão explícita e não herda outra ação/recurso",
    (acao) => {
      const v = vinculo()
      expect(temPermissao(v, recurso, acao)).toBe(false)
      v.permissoes_usuario.push({ recurso, [`pode_${acao}`]: true })
      for (const outro of recursos) {
        for (const outraAcao of acoes) {
          expect(temPermissao(v, outro, outraAcao)).toBe(
            outro === recurso && outraAcao === acao,
          )
        }
      }
      v.permissoes_usuario[0][`pode_${acao}`] = false
      expect(temPermissao(v, recurso, acao)).toBe(false)
    },
  )
  it.each(["ADMIN", "EMPRESA"])(
    "preserva exceção administrativa %s",
    (nivel) => {
      const v = vinculo()
      if (nivel === "ADMIN") v.usuarios.nivel_acesso = nivel
      else v.nivel_acesso = nivel
      for (const acao of acoes)
        expect(temPermissao(v, recurso, acao)).toBe(true)
    },
  )
})

it.each([null, undefined, "", "DESCONHECIDO", "__proto__", "constructor"])(
  "recurso inválido %s nunca remove o filtro, nem para ADMIN",
  (recurso) => {
    const v = vinculo()
    v.usuarios.nivel_acesso = "ADMIN"
    expect(temPermissao(v, recurso as never, "ler")).toBe(false)
    expect(filtroPermissao(recurso as never, "pode_ler")).toEqual({
      id: { in: [] },
    })
  },
)
it.each(["__proto__", "constructor", "desconhecida"])(
  "nega ação inválida %s",
  (acao) => {
    const v = vinculo()
    v.usuarios.nivel_acesso = "ADMIN"
    expect(temPermissao(v, "COMPRAS", acao as never)).toBe(false)
    expect(filtroPermissao("COMPRAS", acao as never)).toEqual({
      id: { in: [] },
    })
  },
)
