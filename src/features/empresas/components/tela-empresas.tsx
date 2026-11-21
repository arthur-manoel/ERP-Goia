"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Building2, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmarAcao } from "@/components/dialogos/confirmar-acao"
import { PageHeader } from "@/components/layout/page-header"
import { BarraFiltros } from "@/components/listagem/barra-filtros"
import { Listagem } from "@/components/listagem/listagem"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useListagem } from "@/hooks/use-listagem"
import { apiEmpresasPendente, type ApiEmpresas } from "../api"
import { empresaSchema, type Empresa, type ResumoEmpresa } from "../schemas"
import { FormularioEmpresa } from "./formulario-empresa"

export function TelaEmpresas({
  api = apiEmpresasPendente,
}: {
  api?: ApiEmpresas
}) {
  const fonte = useMemo(() => ({ buscar: api.listar }), [api])
  const listagem = useListagem({ fonte, limite: 10 })
  const [formulario, setFormulario] = useState<"novo" | Empresa | null>(null)
  const [confirmacao, setConfirmacao] = useState<ResumoEmpresa | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState("")
  const trava = useRef(false)
  const consulta = useRef<AbortController | null>(null)
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
      consulta.current?.abort()
    }
  }, [])

  async function editar(item: ResumoEmpresa) {
    consulta.current?.abort()
    const controller = new AbortController()
    consulta.current = controller
    setOcupado(true)
    setErro("")
    try {
      const empresa = empresaSchema.parse(
        await api.consultar(item.id, controller.signal),
      )
      if (empresa.id !== item.id)
        throw new Error("Empresa retornada fora do cadastro consultado.")
      if (!controller.signal.aborted) setFormulario(empresa)
    } catch (causa) {
      if (!controller.signal.aborted)
        setErro(
          causa instanceof Error
            ? causa.message
            : "Não foi possível consultar a empresa.",
        )
    } finally {
      if (!controller.signal.aborted) setOcupado(false)
    }
  }
  async function mudarSituacao() {
    if (!confirmacao || trava.current) return
    trava.current = true
    setOcupado(true)
    setErro("")
    try {
      await (confirmacao.status === "ATIVA"
        ? api.inativar(confirmacao.id)
        : api.ativar(confirmacao.id))
      if (!montado.current) return
      setConfirmacao(null)
      listagem.recarregar()
      toast.success("Situação da empresa atualizada.")
    } catch (causa) {
      if (montado.current)
        setErro(
          causa instanceof Error
            ? causa.message
            : "Não foi possível alterar a situação.",
        )
    } finally {
      trava.current = false
      if (montado.current) setOcupado(false)
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Empresas"
        descricao="Dados fiscais, endereço, contato e identidade visual das empresas."
        acoes={
          <Button disabled={ocupado} onClick={() => setFormulario("novo")}>
            <Plus />
            Nova empresa
          </Button>
        }
      />
      <Alert>
        <AlertDescription>
          Cadastro, alteração de CNPJ e ativação ou inativação exigem
          administração global. A edição dos demais dados depende da permissão
          na empresa.
        </AlertDescription>
      </Alert>
      {api === apiEmpresasPendente && (
        <p role="status" className="text-sm text-muted-foreground">
          Tela preparada para integração. O serviço de empresas ainda está
          indisponível.
        </p>
      )}
      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <BarraFiltros
        listagem={listagem}
        placeholderBusca="Razão social, nome fantasia ou CNPJ"
        rotuloBusca="Buscar empresas"
        campos={[
          {
            tipo: "selecao",
            chave: "status",
            rotulo: "Situação",
            opcaoTodos: "Todas",
            opcoes: [
              { valor: "ATIVA", rotulo: "Ativas" },
              { valor: "INATIVA", rotulo: "Inativas" },
            ],
          },
          { tipo: "texto", chave: "cidade", rotulo: "Cidade" },
        ]}
      />
      <Listagem
        listagem={listagem}
        rotulo="Empresas"
        substantivo={{ singular: "empresa", plural: "empresas" }}
        chaveItem={(item) => item.id}
        vazio={{
          icone: <Building2 />,
          titulo: "Nenhuma empresa encontrada",
          descricao: "Ajuste os filtros ou cadastre uma empresa.",
        }}
        colunas={[
          {
            id: "empresa",
            cabecalho: "Empresa",
            campoOrdenacao: "razao_social",
            celula: (item) => (
              <>
                <p className="font-medium">{item.razao_social}</p>
                <p className="text-xs text-muted-foreground">
                  {item.nome_fantasia ?? "Sem nome fantasia"}
                </p>
              </>
            ),
          },
          { id: "cnpj", cabecalho: "CNPJ", celula: (item) => item.cnpj },
          {
            id: "cidade",
            cabecalho: "Cidade / UF",
            celula: (item) =>
              [item.cidade, item.estado].filter(Boolean).join(" / ") ||
              "Não informada",
          },
          {
            id: "status",
            cabecalho: "Situação",
            campoOrdenacao: "status",
            celula: (item) => (
              <Badge
                variant={item.status === "ATIVA" ? "outline" : "secondary"}
              >
                {item.status === "ATIVA" ? "Ativa" : "Inativa"}
              </Badge>
            ),
          },
        ]}
        rotuloAcoesDe={(item) => `Ações de ${item.razao_social}`}
        acoes={[
          {
            rotulo: "Editar",
            icone: <Pencil />,
            desabilitada: () => ocupado,
            aoSelecionar: (item) => void editar(item),
          },
          {
            rotulo: "Inativar",
            icone: <Trash2 />,
            destrutiva: true,
            oculta: (item) => item.status !== "ATIVA",
            desabilitada: () => ocupado,
            aoSelecionar: setConfirmacao,
          },
          {
            rotulo: "Reativar",
            icone: <Power />,
            oculta: (item) => item.status !== "INATIVA",
            desabilitada: () => ocupado,
            aoSelecionar: setConfirmacao,
          },
        ]}
      />
      {formulario && (
        <FormularioEmpresa
          api={api}
          empresa={formulario === "novo" ? null : formulario}
          aoFechar={() => setFormulario(null)}
          aoSalvar={listagem.recarregar}
        />
      )}
      <ConfirmarAcao
        aberto={!!confirmacao}
        titulo={
          confirmacao?.status === "ATIVA"
            ? "Inativar empresa?"
            : "Reativar empresa?"
        }
        descricao={
          <>
            {confirmacao?.razao_social}. A inativação impede novas operações
            nesta empresa e preserva o histórico. A empresa ativa no cabeçalho
            será revalidada após a integração.
          </>
        }
        rotuloConfirmar={
          confirmacao?.status === "ATIVA" ? "Inativar" : "Reativar"
        }
        ocupado={ocupado}
        destrutivo={confirmacao?.status === "ATIVA"}
        onConfirmar={() => void mudarSituacao()}
        onFechar={() => setConfirmacao(null)}
      />
    </div>
  )
}
