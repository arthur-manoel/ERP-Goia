"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  validarResultadoAuditoria,
  type EventoAuditoria as Evento,
  type ResultadoAuditoria as Resultado,
} from "./api"
const iniciais = {
  inicio: "",
  fim: "",
  usuario: "",
  tabela: "",
  registro: "",
  acao: "",
}
const data = (valor: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Fortaleza",
  }).format(new Date(valor))
function texto(valor: unknown) {
  return valor === null ? "Sem dados" : JSON.stringify(valor, null, 2)
}

export function TelaAuditoria() {
  const { estado, empresa, empresas, selecionarEmpresa, usuario } =
    useAutenticacao()
  return (
    <div className="space-y-4">
      {empresas.length > 1 && (
        <label className="grid max-w-sm gap-2 text-sm">
          Empresa
          <select
            className="h-9 rounded-lg border bg-background px-3"
            value={empresa?.id ?? ""}
            onChange={(e) => selecionarEmpresa(Number(e.target.value))}
          >
            <option value="" disabled>
              Selecione uma empresa
            </option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {estado === "autenticado" && empresa ? (
        <Consulta
          key={`${usuario?.email}:${empresa.id}`}
          idEmpresa={empresa.id}
        />
      ) : (
        <p className="text-muted-foreground" role="status">
          {estado === "carregando"
            ? "Carregando sessão…"
            : estado === "anonimo"
              ? "Entre no sistema para consultar a auditoria."
              : "Selecione uma empresa para consultar a auditoria."}
        </p>
      )}
    </div>
  )
}

function Consulta({ idEmpresa }: { idEmpresa: number }) {
  const { requisitar } = useAutenticacao()
  const [campos, setCampos] = useState(iniciais)
  const [consulta, setConsulta] = useState({
    filtros: iniciais,
    pagina: 1,
    versao: 0,
  })
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState("")
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<Evento | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ pagina: String(consulta.pagina) })
    Object.entries(consulta.filtros).forEach(([k, v]) => {
      if (v.trim()) params.set(k, v.trim())
    })
    async function carregar() {
      setCarregando(true)
      setErro("")
      setResultado(null)
      try {
        const response = await requisitar(`/api/auditoria?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        })
        const body = await response.json()
        if (!response.ok)
          throw new Error(
            body.error ?? "Não foi possível consultar a auditoria.",
          )
        const resultado = validarResultadoAuditoria(
          body,
          idEmpresa,
          consulta.pagina,
        )
        if (!controller.signal.aborted) setResultado(resultado)
      } catch (e) {
        if (!controller.signal.aborted)
          setErro(
            e instanceof Error ? e.message : "Falha ao consultar auditoria.",
          )
      } finally {
        if (!controller.signal.aborted) setCarregando(false)
      }
    }
    void carregar()
    return () => controller.abort()
  }, [consulta, requisitar, idEmpresa])
  function filtrar(e: FormEvent) {
    e.preventDefault()
    setConsulta({
      filtros: { ...campos },
      pagina: 1,
      versao: consulta.versao + 1,
    })
  }
  return (
    <>
      <form
        onSubmit={filtrar}
        className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {(
          [
            ["inicio", "Data inicial", "date"],
            ["fim", "Data final", "date"],
            ["usuario", "ID do usuário", "number"],
            ["tabela", "Tabela", "text"],
            ["registro", "ID do registro", "number"],
          ] as const
        ).map(([chave, label, type]) => (
          <label key={chave} className="grid gap-2 text-sm">
            {label}
            <Input
              type={type}
              min={type === "number" ? 1 : undefined}
              max={type === "number" ? 2147483647 : undefined}
              maxLength={chave === "tabela" ? 100 : undefined}
              value={campos[chave]}
              onChange={(e) =>
                setCampos({ ...campos, [chave]: e.target.value })
              }
            />
          </label>
        ))}
        <label className="grid gap-2 text-sm">
          Ação
          <select
            className="h-8 rounded-lg border bg-background px-3"
            value={campos.acao}
            onChange={(e) => setCampos({ ...campos, acao: e.target.value })}
          >
            <option value="">Todas</option>
            <option value="INSERT">Criação</option>
            <option value="UPDATE">Alteração</option>
            <option value="DELETE">Exclusão</option>
            <option value="LOGIN">Entrada no sistema</option>
            <option value="LOGOUT">Saída do sistema</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={carregando}>
            Filtrar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCampos(iniciais)
              setConsulta({
                filtros: iniciais,
                pagina: 1,
                versao: consulta.versao + 1,
              })
            }}
          >
            Limpar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
          Datas e horários no fuso de Fortaleza. O período inclui os dias
          inicial e final.
        </p>
      </form>
      {erro && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-destructive p-4 text-sm"
        >
          <p>{erro}</p>
          <Button
            variant="outline"
            onClick={() =>
              setConsulta({ ...consulta, versao: consulta.versao + 1 })
            }
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <div className="rounded-xl border" aria-busy={carregando}>
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Data e hora",
                "Usuário",
                "Tabela",
                "Registro",
                "Ação",
                "Detalhes",
              ].map((t) => (
                <TableHead key={t}>{t}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center"
                  role="status"
                >
                  Carregando operações…
                </TableCell>
              </TableRow>
            ) : resultado?.itens.length ? (
              resultado.itens.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    {data(item.data_evento)}
                  </TableCell>
                  <TableCell>
                    {item.usuario}
                    {item.id_usuario && (
                      <span className="ml-1 text-muted-foreground">
                        #{item.id_usuario}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{item.tabela}</TableCell>
                  <TableCell>{item.id_registro ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {(
                        {
                          INSERT: "Criação",
                          UPDATE: "Alteração",
                          DELETE: "Exclusão",
                          LOGIN: "Entrada no sistema",
                          LOGOUT: "Saída do sistema",
                        } as Record<string, string>
                      )[item.acao] ?? item.acao}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      onClick={() => setSelecionado(item)}
                      aria-label={`Ver operação ${item.id}`}
                    >
                      Ver alterações
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {erro
                    ? "Consulta indisponível."
                    : "Nenhuma operação encontrada para os filtros informados."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {resultado && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            {resultado.total} operações · Página {resultado.pagina} de{" "}
            {Math.max(1, resultado.totalPaginas)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={carregando || consulta.pagina <= 1}
              onClick={() =>
                setConsulta({ ...consulta, pagina: consulta.pagina - 1 })
              }
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={carregando || consulta.pagina >= resultado.totalPaginas}
              onClick={() =>
                setConsulta({ ...consulta, pagina: consulta.pagina + 1 })
              }
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={selecionado !== null}
        onOpenChange={(open) => {
          if (!open) setSelecionado(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Operação #{selecionado?.id}</DialogTitle>
            <DialogDescription>
              {selecionado &&
                `${selecionado.tabela} · Registro ${selecionado.id_registro ?? "—"} · ${selecionado.usuario} · ${data(selecionado.data_evento)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {selecionado &&
              (
                [
                  ["Antes", selecionado.antes],
                  ["Depois", selecionado.depois],
                ] as const
              ).map(([titulo, valor]) => (
                <section key={titulo} className="min-w-0">
                  <h3 className="mb-2 font-medium">{titulo}</h3>
                  <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs wrap-anywhere whitespace-pre-wrap">
                    {texto(valor)}
                  </pre>
                </section>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
