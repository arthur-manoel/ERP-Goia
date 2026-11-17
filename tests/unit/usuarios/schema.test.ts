import assert from "node:assert/strict"
import { test } from "vitest"
import {
  criarUsuarioSchema,
  editarPermissoesSchema,
  editarUsuarioSchema,
  listarUsuariosSchema,
  redefinirSenhaSchema,
  trocarSenhaSchema,
  vincularUsuarioSchema,
} from "../../../src/modules/usuarios/usuarios.schema"
import { RECURSOS_PERMISSAO } from "../../../src/lib/permissoes"

const permissao = {
  recurso: RECURSOS_PERMISSAO[0],
  pode_ler: true,
  pode_criar: false,
  pode_editar: false,
  pode_excluir: false,
}

test("criação e vínculo normalizam e-mail e rejeitam campos de privilégio", () => {
  assert.equal(
    criarUsuarioSchema.parse({
      nome: " Maria ",
      email: " MARIA@EXAMPLE.TEST ",
      password: "senha-segura",
      idCargo: 2,
      permissoes: [permissao],
    }).email,
    "maria@example.test",
  )
  assert.equal(
    vincularUsuarioSchema.parse({
      email: " EXISTENTE@example.test ",
      idCargo: 4,
      idSetor: null,
    }).email,
    "existente@example.test",
  )
  assert.equal(
    criarUsuarioSchema.safeParse({
      nome: "Maria",
      email: "maria@example.test",
      password: "senha-segura",
      idCargo: 2,
      nivel_acesso: "ADMIN",
    }).success,
    false,
  )
})

test("edição exige ao menos um campo e valida estado do vínculo", () => {
  assert.equal(editarUsuarioSchema.safeParse({}).success, false)
  assert.deepEqual(editarUsuarioSchema.parse({ statusVinculo: "INATIVO" }), {
    statusVinculo: "INATIVO",
  })
  assert.equal(
    editarUsuarioSchema.safeParse({ statusVinculo: "PENDENTE" }).success,
    false,
  )
})

test("permissões rejeitam recursos duplicados e campos extras", () => {
  assert.equal(
    editarPermissoesSchema.safeParse({ permissoes: [permissao] }).success,
    true,
  )
  assert.equal(
    editarPermissoesSchema.safeParse({ permissoes: [permissao, permissao] })
      .success,
    false,
  )
  assert.equal(
    editarPermissoesSchema.safeParse({
      permissoes: [{ ...permissao, admin: true }],
    }).success,
    false,
  )
})

test("consultas aplicam valores padrão e limites de paginação", () => {
  assert.deepEqual(listarUsuariosSchema.parse({}), {
    status: "TODOS",
    pagina: 1,
    limite: 20,
  })
  assert.deepEqual(
    listarUsuariosSchema.parse({
      pagina: "2",
      limite: "50",
      idSetor: "SEM_SETOR",
    }),
    { status: "TODOS", pagina: 2, limite: 50, idSetor: null },
  )
  assert.equal(listarUsuariosSchema.safeParse({ limite: "101" }).success, false)
  assert.equal(listarUsuariosSchema.safeParse({ pagina: "0" }).success, false)
})

test("senhas têm tamanho validado no reset e na troca autenticada", () => {
  assert.equal(
    redefinirSenhaSchema.safeParse({ password: "12345678" }).success,
    true,
  )
  assert.equal(
    redefinirSenhaSchema.safeParse({ password: "123" }).success,
    false,
  )
  assert.equal(
    trocarSenhaSchema.safeParse({
      currentPassword: "antiga",
      password: "12345678",
    }).success,
    true,
  )
  assert.equal(
    trocarSenhaSchema.safeParse({ currentPassword: "", password: "12345678" })
      .success,
    false,
  )
})
