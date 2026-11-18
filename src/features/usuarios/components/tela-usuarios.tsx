"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  UserRoundX,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { RECURSOS_PERMISSAO } from "@/lib/permissoes"
import {
  acoesPermissao,
  atualizarPermissoes,
  criarUsuario,
  editarUsuario,
  filtrosUsuariosIniciais,
  inativarVinculo,
  listarUsuarios,
  redefinirSenha,
  rotulosAcoes,
  trocarMinhaSenha,
  vincularUsuario,
  type FiltroUsuarios,
  type PermissoesUsuario,
  type UsuarioAdmin,
} from "../api"

type Modal =
  | { tipo: "criar" | "vincular" | "minha-senha" }
  | { tipo: "editar" | "permissoes" | "senha"; usuario: UsuarioAdmin }
  | null
type SelecaoInativacao = UsuarioAdmin | null
type Opcao = { id: number; nome: string; status: string }
const permissoesVazias = (): PermissoesUsuario =>
  Object.fromEntries(
    RECURSOS_PERMISSAO.map((recurso) => [
      recurso,
      {
        pode_ler: false,
        pode_criar: false,
        pode_editar: false,
        pode_excluir: false,
      },
    ]),
  ) as PermissoesUsuario
const permissoesDoUsuario = (usuario?: UsuarioAdmin): PermissoesUsuario => {
  const resultado = permissoesVazias()
  for (const item of usuario?.usuario_empresa[0]?.permissoes_usuario ?? []) {
    resultado[item.recurso].pode_ler = item.pode_ler
    resultado[item.recurso].pode_criar = item.pode_criar
    resultado[item.recurso].pode_editar = item.pode_editar
    resultado[item.recurso].pode_excluir = item.pode_excluir
  }
  return resultado
}

export function TelaUsuarios() {
  const { requisitar, empresa } = useAutenticacao()
  const [filtro, setFiltro] = useState<FiltroUsuarios>(filtrosUsuariosIniciais)
  const [buscaDigitada, setBuscaDigitada] = useState("")
  const [dados, setDados] = useState<Awaited<
    ReturnType<typeof listarUsuarios>
  > | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [modal, setModal] = useState<Modal>(null)
  const [inativar, setInativar] = useState<SelecaoInativacao>(null)
  const [salvando, setSalvando] = useState(false)
  const [permissoes, setPermissoes] =
    useState<PermissoesUsuario>(permissoesVazias)

  const carregar = useCallback(
    async (signal?: AbortSignal) => {
      if (!empresa) return
      setCarregando(true)
      setErro("")
      try {
        const resultado = await listarUsuarios(requisitar, filtro, signal)
        if (!signal?.aborted) setDados(resultado)
      } catch (causa) {
        if (!signal?.aborted)
          setErro(
            causa instanceof Error
              ? causa.message
              : "Não foi possível carregar os usuários.",
          )
      } finally {
        if (!signal?.aborted) setCarregando(false)
      }
    },
    [empresa, filtro, requisitar],
  )
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => carregar(controller.signal))
    return () => controller.abort()
  }, [carregar])

  const cargos = dados?.cargos ?? []
  const setores = dados?.setores ?? []
  const totalPaginas = dados?.paginacao.totalPaginas ?? 0
  const usuarioModal = modal && "usuario" in modal ? modal.usuario : undefined
  const vinculo = usuarioModal?.usuario_empresa[0]
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!modal || salvando) return
    const form = new FormData(evento.currentTarget)
    setSalvando(true)
    try {
      if (modal.tipo === "criar") {
        await criarUsuario(requisitar, {
          nome: String(form.get("nome") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          idCargo: Number(form.get("idCargo")),
          idSetor: form.get("idSetor") ? Number(form.get("idSetor")) : null,
        })
        toast.success("Usuário cadastrado e vinculado à empresa.")
      } else if (modal.tipo === "vincular") {
        await vincularUsuario(requisitar, {
          email: String(form.get("email") ?? ""),
          idCargo: Number(form.get("idCargo")),
          idSetor: form.get("idSetor") ? Number(form.get("idSetor")) : null,
        })
        toast.success("Usuário vinculado à empresa.")
      } else if (modal.tipo === "editar" && usuarioModal) {
        const body: Record<string, unknown> = {
          idCargo: Number(form.get("idCargo")),
          idSetor: form.get("idSetor") ? Number(form.get("idSetor")) : null,
        }
        if (usuarioModal._count.usuario_empresa <= 1) {
          body.nome = String(form.get("nome") ?? "")
          body.email = String(form.get("email") ?? "")
        }
        await editarUsuario(requisitar, usuarioModal.id, body)
        toast.success("Dados do usuário atualizados.")
      } else if (modal.tipo === "permissoes" && usuarioModal) {
        await atualizarPermissoes(requisitar, usuarioModal.id, {
          permissoes: RECURSOS_PERMISSAO.map((recurso) => ({
            recurso,
            ...permissoes[recurso],
          })),
        })
        toast.success("Permissões atualizadas.")
      } else if (modal.tipo === "senha" && usuarioModal) {
        const password = String(form.get("password") ?? "")
        if (password !== String(form.get("confirmarPassword") ?? ""))
          throw new Error("As senhas não coincidem.")
        await redefinirSenha(requisitar, usuarioModal.id, password)
        toast.success(
          "Senha redefinida. As sessões anteriores foram encerradas.",
        )
      } else if (modal.tipo === "minha-senha") {
        const password = String(form.get("password") ?? "")
        if (password !== String(form.get("confirmarPassword") ?? ""))
          throw new Error("As senhas não coincidem.")
        await trocarMinhaSenha(
          requisitar,
          String(form.get("currentPassword") ?? ""),
          password,
        )
        toast.success("Sua senha foi alterada. Entre novamente.")
      }
      setModal(null)
      await carregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível salvar.",
      )
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarInativacao() {
    if (!inativar || salvando) return
    setSalvando(true)
    try {
      await inativarVinculo(requisitar, inativar.id)
      toast.success(
        "Vínculo inativado. As sessões do usuário foram encerradas.",
      )
      setInativar(null)
      await carregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error
          ? causa.message
          : "Não foi possível inativar o vínculo.",
      )
    } finally {
      setSalvando(false)
    }
  }

  async function reativar(usuario: UsuarioAdmin) {
    setSalvando(true)
    try {
      await editarUsuario(requisitar, usuario.id, { statusVinculo: "ATIVO" })
      toast.success("Vínculo reativado.")
      await carregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error
          ? causa.message
          : "Não foi possível reativar o vínculo.",
      )
    } finally {
      setSalvando(false)
    }
  }

  function abrir(modalNovo: Modal) {
    if (modalNovo?.tipo === "permissoes")
      setPermissoes(permissoesDoUsuario(modalNovo.usuario))
    setModal(modalNovo)
  }

  function campo(
    nome: string,
    rotulo: string,
    tipo = "text",
    value?: string,
    required = false,
  ) {
    return (
      <Field key={nome}>
        <FieldLabel htmlFor={`usuario-${nome}`}>{rotulo}</FieldLabel>
        <Input
          id={`usuario-${nome}`}
          name={nome}
          type={tipo}
          defaultValue={value}
          required={required}
          autoComplete={
            nome === "password" || nome === "confirmarPassword"
              ? "new-password"
              : undefined
          }
        />
      </Field>
    )
  }

  function seletor(
    nome: string,
    rotulo: string,
    opcoes: Opcao[],
    selecionado?: number | null,
    incluirSemSetor = false,
  ) {
    return (
      <Field key={nome}>
        <FieldLabel htmlFor={`usuario-${nome}`}>{rotulo}</FieldLabel>
        <select
          id={`usuario-${nome}`}
          name={nome}
          required={nome === "idCargo"}
          defaultValue={selecionado == null ? "" : String(selecionado)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {incluirSemSetor && <option value="">Sem setor</option>}
          {!incluirSemSetor && <option value="">Selecione…</option>}
          {opcoes.map((opcao) => (
            <option
              key={opcao.id}
              value={opcao.id}
              disabled={opcao.status !== "ATIVO"}
            >
              {opcao.nome}
              {opcao.status !== "ATIVO" ? " (inativo)" : ""}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  const modalTitle =
    modal?.tipo === "criar"
      ? "Novo usuário"
      : modal?.tipo === "vincular"
        ? "Vincular usuário existente"
        : modal?.tipo === "editar"
          ? "Editar usuário e vínculo"
          : modal?.tipo === "permissoes"
            ? "Permissões do vínculo"
            : modal?.tipo === "senha"
              ? "Redefinir senha"
              : modal?.tipo === "minha-senha"
                ? "Alterar minha senha"
                : "Usuário"

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Usuários"
        descricao={`Gerencie usuários, vínculos, cargos e permissões${empresa ? ` em ${empresa.nome}` : ""}.`}
        acoes={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => abrir({ tipo: "minha-senha" })}
            >
              <KeyRound /> Minha senha
            </Button>
            <Button
              variant="outline"
              onClick={() => abrir({ tipo: "vincular" })}
            >
              <UserPlus /> Vincular existente
            </Button>
            <Button onClick={() => abrir({ tipo: "criar" })}>
              <Plus /> Novo usuário
            </Button>
          </div>
        }
      />

      {!empresa && (
        <Alert>
          <AlertTitle>Selecione uma empresa</AlertTitle>
          <AlertDescription>
            Escolha uma empresa para consultar e gerenciar seus vínculos de
            usuários.
          </AlertDescription>
        </Alert>
      )}
      {erro && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar usuários</AlertTitle>
          <AlertDescription>
            {erro}
            <Button variant="outline" size="sm" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-56 flex-1">
          <FieldLabel htmlFor="busca-usuarios">Pesquisar</FieldLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              id="busca-usuarios"
              value={buscaDigitada}
              className="pl-9"
              placeholder="Nome ou e-mail"
              onChange={(event) => setBuscaDigitada(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  setFiltro((value) => ({
                    ...value,
                    pagina: 1,
                    busca: buscaDigitada,
                  }))
              }}
            />
          </div>
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="filtro-status">Vínculo</FieldLabel>
          <select
            id="filtro-status"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filtro.status}
            onChange={(event) =>
              setFiltro((value) => ({
                ...value,
                status: event.target.value as FiltroUsuarios["status"],
                pagina: 1,
              }))
            }
          >
            <option value="TODOS">Todos</option>
            <option value="ATIVO">Ativos</option>
            <option value="INATIVO">Inativos</option>
          </select>
        </Field>
        <Field className="w-48">
          <FieldLabel htmlFor="filtro-cargo">Cargo</FieldLabel>
          <select
            id="filtro-cargo"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filtro.idCargo}
            onChange={(event) =>
              setFiltro((value) => ({
                ...value,
                idCargo: event.target.value,
                pagina: 1,
              }))
            }
          >
            <option value="">Todos</option>
            {cargos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field className="w-48">
          <FieldLabel htmlFor="filtro-setor">Setor</FieldLabel>
          <select
            id="filtro-setor"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filtro.idSetor}
            onChange={(event) =>
              setFiltro((value) => ({
                ...value,
                idSetor: event.target.value,
                pagina: 1,
              }))
            }
          >
            <option value="">Todos</option>
            <option value="SEM_SETOR">Sem setor</option>
            {setores.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="outline"
          onClick={() =>
            setFiltro((value) => ({
              ...value,
              busca: buscaDigitada,
              pagina: 1,
            }))
          }
        >
          Buscar
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Vínculo</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton
                    className="h-24 w-full"
                    aria-label="Carregando usuários"
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {!carregando &&
              dados?.usuarios.map((usuario) => {
                const link = usuario.usuario_empresa[0]
                if (!link) return null
                const ativas = link.permissoes_usuario.filter(
                  (item) =>
                    item.pode_ler ||
                    item.pode_criar ||
                    item.pode_editar ||
                    item.pode_excluir,
                ).length
                return (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <p className="font-medium">{usuario.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {usuario.email}
                      </p>
                      {usuario._count.usuario_empresa > 1 && (
                        <p className="text-xs text-muted-foreground">
                          Vinculado a {usuario._count.usuario_empresa} empresas
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{link.cargos.nome}</TableCell>
                    <TableCell>{link.setores?.nome ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          link.status === "ATIVO" && usuario.status === "ATIVO"
                            ? "outline"
                            : "destructive"
                        }
                      >
                        {usuario.status === "INATIVO"
                          ? "Conta inativa"
                          : link.status === "ATIVO"
                            ? "Ativo"
                            : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>{ativas} recursos</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Editar ${usuario.nome}`}
                          title="Editar"
                          onClick={() => abrir({ tipo: "editar", usuario })}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Permissões de ${usuario.nome}`}
                          title="Permissões"
                          onClick={() => abrir({ tipo: "permissoes", usuario })}
                        >
                          <ShieldCheck />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Redefinir senha de ${usuario.nome}`}
                          title="Redefinir senha"
                          onClick={() => abrir({ tipo: "senha", usuario })}
                        >
                          <KeyRound />
                        </Button>
                        {link.status === "ATIVO" ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Inativar vínculo de ${usuario.nome}`}
                            title="Inativar vínculo"
                            onClick={() => setInativar(usuario)}
                          >
                            <UserRoundX />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={salvando || usuario.status !== "ATIVO"}
                            onClick={() => void reativar(usuario)}
                          >
                            Reativar vínculo
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            {!carregando && !dados?.usuarios.length && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-28 text-center text-muted-foreground"
                >
                  Nenhum usuário encontrado nesta empresa.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {dados?.paginacao.total ?? 0} usuários · Página {filtro.pagina} de{" "}
          {Math.max(1, totalPaginas)}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={filtro.pagina <= 1 || carregando}
            onClick={() =>
              setFiltro((value) => ({ ...value, pagina: value.pagina - 1 }))
            }
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              !totalPaginas || filtro.pagina >= totalPaginas || carregando
            }
            onClick={() =>
              setFiltro((value) => ({ ...value, pagina: value.pagina + 1 }))
            }
          >
            Próxima
          </Button>
        </div>
      </div>

      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && !salvando) setModal(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            <DialogDescription>
              {modal?.tipo === "vincular"
                ? "Vincule um usuário existente pelo e-mail. A senha e os dados cadastrais permanecem inalterados."
                : modal?.tipo === "permissoes"
                  ? `Permissões diretas do vínculo de ${usuarioModal?.nome}.`
                  : modal?.tipo === "minha-senha"
                    ? "Confirme sua senha atual e informe a nova senha."
                    : modal?.tipo === "senha"
                      ? `Defina uma nova senha para ${usuarioModal?.nome}. As sessões existentes serão encerradas.`
                      : `Configuração do vínculo na empresa ${empresa?.nome ?? "selecionada"}.`}
            </DialogDescription>
          </DialogHeader>
          {modal?.tipo === "permissoes" && usuarioModal ? (
            <form onSubmit={enviar} className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recurso</TableHead>
                      {acoesPermissao.map((acao) => (
                        <TableHead key={acao} className="text-center">
                          {rotulosAcoes[acao]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {RECURSOS_PERMISSAO.map((recurso) => (
                      <TableRow key={recurso}>
                        <TableCell>{recurso.replaceAll("_", " ")}</TableCell>
                        {acoesPermissao.map((acao) => (
                          <TableCell key={acao} className="text-center">
                            <input
                              type="checkbox"
                              aria-label={`${rotulosAcoes[acao]} ${recurso}`}
                              checked={permissoes[recurso][acao]}
                              disabled={salvando}
                              onChange={(event) =>
                                setPermissoes((value) => ({
                                  ...value,
                                  [recurso]: {
                                    ...value[recurso],
                                    [acao]: event.target.checked,
                                  },
                                }))
                              }
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={salvando}
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar permissões"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              {modal?.tipo === "criar" && (
                <>
                  {campo("nome", "Nome completo", "text", undefined, true)}
                  {campo("email", "E-mail de acesso", "email", undefined, true)}
                  {campo(
                    "password",
                    "Senha inicial",
                    "password",
                    undefined,
                    true,
                  )}
                  <p className="text-xs text-muted-foreground">
                    Use uma senha com 8 a 128 caracteres.
                  </p>
                </>
              )}
              {modal?.tipo === "vincular" && (
                <>
                  {campo(
                    "email",
                    "E-mail da conta existente",
                    "email",
                    undefined,
                    true,
                  )}
                </>
              )}
              {modal?.tipo === "editar" && usuarioModal && (
                <>
                  {usuarioModal._count.usuario_empresa <= 1 ? (
                    <>
                      {campo(
                        "nome",
                        "Nome completo",
                        "text",
                        usuarioModal.nome,
                        true,
                      )}
                      {campo(
                        "email",
                        "E-mail de acesso",
                        "email",
                        usuarioModal.email,
                        true,
                      )}
                    </>
                  ) : (
                    <Alert>
                      <AlertDescription>
                        O usuário está vinculado a outras empresas. Nome e
                        e-mail são globais e ficam bloqueados nesta edição.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
              {(modal?.tipo === "criar" ||
                modal?.tipo === "vincular" ||
                modal?.tipo === "editar") && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {seletor("idCargo", "Cargo", cargos, vinculo?.id_cargo)}
                  {seletor(
                    "idSetor",
                    "Setor",
                    setores,
                    vinculo?.id_setor,
                    true,
                  )}
                </div>
              )}
              {modal?.tipo === "senha" && (
                <>
                  {campo("password", "Nova senha", "password", undefined, true)}
                  {campo(
                    "confirmarPassword",
                    "Confirmar nova senha",
                    "password",
                    undefined,
                    true,
                  )}
                  <p className="text-xs text-muted-foreground">
                    Mínimo de 8 caracteres. A senha nunca é exibida ou devolvida
                    pela API.
                  </p>
                </>
              )}
              {modal?.tipo === "minha-senha" && (
                <>
                  {campo(
                    "currentPassword",
                    "Senha atual",
                    "password",
                    undefined,
                    true,
                  )}
                  {campo("password", "Nova senha", "password", undefined, true)}
                  {campo(
                    "confirmarPassword",
                    "Confirmar nova senha",
                    "password",
                    undefined,
                    true,
                  )}
                </>
              )}
              {modal?.tipo !== "permissoes" && (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={salvando}
                    onClick={() => setModal(null)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={salvando}>
                    {salvando ? "Salvando…" : "Salvar"}
                  </Button>
                </DialogFooter>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!inativar}
        onOpenChange={(open) => {
          if (!open && !salvando) setInativar(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar vínculo?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso de {inativar?.nome} a {empresa?.nome ?? "esta empresa"}{" "}
              será removido. O usuário poderá continuar usando outras empresas
              onde tenha vínculo ativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={salvando}
              onClick={(event) => {
                event.preventDefault()
                void confirmarInativacao()
              }}
            >
              Inativar vínculo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
