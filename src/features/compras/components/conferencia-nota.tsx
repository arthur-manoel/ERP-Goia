"use client"
import { useEffect, useRef, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { lerRespostaOperacao } from "@/features/erp/resposta-operacao"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SeletorUnico } from "./comuns"
import type { ComprasApi } from "../api"
import { totalItem } from "@/modules/compras/compras.regras"
import {
  useProcessamentoPendente,
  type TentativaNota,
} from "../processamento-pendente"
import type { ItemNota, NotaDetalhe } from "../notas-entrada"
type Fonte = {
  modo: string
  novaQuantidade: string
  recebimentos: { idMovimentacao: number; quantidade: string }[]
}
const estilo =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
const payload = (i: ItemNota) => ({
  ...(i.id ? { id: i.id } : {}),
  numeroItem: i.numeroItem,
  codigo: i.codigo,
  descricao: i.descricao,
  idProduto: i.idProduto,
  idCompraItem: i.idCompraItem,
  idVariacao: i.idVariacao,
  idLocalEstoque: i.idLocalEstoque,
  idSetor: i.idSetor,
  quantidade: i.quantidade.replace(",", "."),
  unidade: i.unidade,
  tipoValor: i.tipoValor,
  valorUnitario: i.valorUnitario.replace(",", "."),
  valorTotal: i.valorTotal.replace(",", "."),
})
export function ConferenciaNota({
  nota: n,
  atualizar,
  api,
  podeEditar,
}: {
  nota: NotaDetalhe
  atualizar: () => void
  api: ComprasApi
  podeEditar: boolean
}) {
  const { requisitar } = useAutenticacao(),
    pendente = useProcessamentoPendente()
  const [linhas, setLinhas] = useState<(ItemNota & { key: string })[]>(() =>
    n.itens.map((i) => ({ ...i, key: String(i.id) })),
  )
  const [justificativa, setJustificativa] = useState(
      n.justificativaValores ?? "",
    ),
    [fontes, setFontes] = useState<Partial<Record<number, Fonte>>>({})
  const [erro, setErro] = useState(""),
    [mensagem, setMensagem] = useState(""),
    [ocupado, setOcupado] = useState(false)
  const trava = useRef(false),
    vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])
  const editavel =
      podeEditar && !n.entradaProcessada && n.status !== "CANCELADA",
    bloqueado = ocupado || !!pendente.tentativa
  function alterar(index: number, patch: Partial<ItemNota>) {
    setLinhas((antes) =>
      antes.map((i, k) => {
        if (k !== index) return i
        const novo = { ...i, ...patch }
        if (
          patch.quantidade !== undefined ||
          patch.valorUnitario !== undefined ||
          patch.tipoValor !== undefined
        ) {
          try {
            novo.valorTotal =
              novo.tipoValor === "TOTAL"
                ? novo.valorUnitario
                : totalItem(
                    novo.quantidade.replace(",", "."),
                    novo.valorUnitario.replace(",", "."),
                  )
          } catch {}
        }
        return novo
      }),
    )
  }
  function mapear(index: number, value: string) {
    const item = n.compraConferencia?.itens.find((i) => i.id === Number(value))
    if (!item) {
      alterar(index, { idCompraItem: null, idProduto: null, idVariacao: null })
      return
    }
    const variacao =
      item.idCor || item.idTamanho
        ? item.variacoes.find(
            (v) => v.idCor === item.idCor && v.idTamanho === item.idTamanho,
          )
        : null
    alterar(index, {
      idCompraItem: item.id,
      idProduto: item.idProduto,
      idVariacao: variacao?.id ?? null,
      idLocalEstoque: n.compraConferencia!.idLocalEstoque,
      ...(!linhas[index].unidade ? { unidade: item.unidade } : {}),
    })
  }
  async function salvar() {
    if (trava.current) return
    trava.current = true
    setOcupado(true)
    setErro("")
    try {
      const r = await requisitar(`/api/compras/notas-fiscais/${n.id}/itens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versaoEsperada: n.versao,
          itens: linhas.map(payload),
          justificativaValores: justificativa.trim() || null,
        }),
      })
      const v = await r.json()
      if (!r.ok)
        throw new Error(v.error ?? "Não foi possível salvar a conferência.")
      if (vivo.current) {
        setMensagem(
          "Itens fiscais salvos. A entrada física ainda depende de confirmação.",
        )
        toast.success(
          "Conferência salva. A entrada física ainda depende de confirmação.",
        )
        atualizar()
      }
    } catch (e) {
      if (vivo.current)
        setErro(e instanceof Error ? e.message : "Falha ao conferir a nota.")
    } finally {
      trava.current = false
      if (vivo.current) setOcupado(false)
    }
  }
  async function processar(recuperar = false) {
    if (trava.current || (!recuperar && pendente.tentativa)) return
    let tentativa: TentativaNota
    if (recuperar) {
      if (!pendente.tentativa || pendente.tentativa.idNota !== n.id) return
      tentativa = pendente.tentativa
    } else {
      if (n.itens.some((i) => !i.id || !fontes[i.id]?.modo)) {
        setErro("Selecione a origem física de cada linha fiscal.")
        return
      }
      tentativa = {
        idNota: n.id,
        url: `/api/compras/notas-fiscais/${n.id}/processar`,
        chave: crypto.randomUUID(),
        body: {
          versaoEsperada: n.versao,
          linhas: n.itens.map((i) => ({
            idItem: i.id!,
            novaQuantidade: fontes[i.id!]!.novaQuantidade.replace(",", "."),
            recebimentos: fontes[i.id!]!.recebimentos.map((r) => ({
              ...r,
              quantidade: r.quantidade.replace(",", "."),
            })),
          })),
        },
      }
    }
    try {
      pendente.gravar(tentativa)
    } catch {
      setErro(
        "Habilite o armazenamento da sessão para preservar esta confirmação.",
      )
      return
    }
    trava.current = true
    setOcupado(true)
    setErro("")
    setMensagem("")
    try {
      const r = await requisitar(tentativa.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": tentativa.chave,
        },
        body: JSON.stringify(tentativa.body),
      })
      const v = await lerRespostaOperacao(r, pendente.limpar)
      if (!r.ok)
        throw new Error(
          v.error ?? "Confirmação inconclusiva. Recupere a mesma tentativa.",
        )
      pendente.limpar()
      if (vivo.current) {
        toast.success(
          v.jaProcessada
            ? "Nota já processada; nenhum movimento duplicado."
            : "Entrada fiscal confirmada pelos movimentos de estoque vinculados.",
        )
        setMensagem(
          v.jaProcessada
            ? "Esta nota já possui a entrada conferida; nenhum movimento foi duplicado."
            : "Entrada fiscal confirmada pelos movimentos de estoque vinculados.",
        )
        atualizar()
      }
    } catch (e) {
      if (vivo.current)
        setErro(
          e instanceof Error &&
            !(e instanceof TypeError || e instanceof SyntaxError)
            ? e.message
            : "Resposta interrompida. Recupere a mesma tentativa para confirmar o resultado.",
        )
    } finally {
      trava.current = false
      if (vivo.current) setOcupado(false)
    }
  }
  function fonte(id: number, patch: Partial<Fonte>) {
    setFontes((v) => ({
      ...v,
      [id]: {
        modo: "",
        novaQuantidade: "0",
        recebimentos: [],
        ...v[id],
        ...patch,
      },
    }))
  }
  return (
    <section className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">Itens e conferência da entrada</h3>
      <p className="text-sm">
        Documento cadastrado, conferência dos itens e entrada física são etapas
        distintas. Os recebimentos da compra podem ser vinculados aqui sem uma
        segunda entrada.
      </p>
      {erro && (
        <p role="alert" className="text-destructive">
          {erro}
        </p>
      )}
      {mensagem && <p role="status">{mensagem}</p>}
      {pendente.tentativa && (
        <div role="alert">
          Há uma confirmação fiscal pendente para a NF #
          {pendente.tentativa.idNota}.
          {pendente.tentativa.idNota === n.id && (
            <Button disabled={ocupado} onClick={() => void processar(true)}>
              Recuperar mesma confirmação
            </Button>
          )}
        </div>
      )}
      {n.pendencias.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {n.pendencias.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {n.compraConferencia && (
        <div className="space-y-1 text-sm">
          <h4 className="font-medium">
            Compra vinculada: {n.compraConferencia.status}
          </h4>
          {n.compraConferencia.itens.map((i) => (
            <p key={i.id}>
              Item {i.id} · {i.nome} · comprado {i.quantidade}, recebido{" "}
              {i.recebida}, pendente {i.pendente} {i.unidade} · valor unitário{" "}
              {i.valorUnitario}
            </p>
          ))}
        </div>
      )}
      <fieldset disabled={!editavel || bloqueado} className="space-y-4">
        {linhas.map((l, index) => {
          const compraItem = n.compraConferencia?.itens.find(
            (i) => i.id === l.idCompraItem,
          )
          return (
            <article key={l.key} className="space-y-3 rounded-lg border p-3">
              <h4 className="font-medium">Linha fiscal {l.numeroItem}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Número do item
                  <Input
                    aria-label={`Número da linha ${index + 1}`}
                    type="number"
                    min="1"
                    value={l.numeroItem}
                    onChange={(e) =>
                      alterar(index, { numeroItem: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Código original
                  <Input
                    aria-label={`Código da linha ${index + 1}`}
                    maxLength={100}
                    value={l.codigo ?? ""}
                    onChange={(e) =>
                      alterar(index, { codigo: e.target.value || null })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Descrição original
                  <Input
                    maxLength={255}
                    value={l.descricao ?? ""}
                    onChange={(e) =>
                      alterar(index, { descricao: e.target.value || null })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Mapear ao item da compra
                  <select
                    className={estilo}
                    aria-label={`Item da compra da linha ${index + 1}`}
                    value={l.idCompraItem ?? ""}
                    onChange={(e) => mapear(index, e.target.value)}
                  >
                    <option value="">Sem mapeamento</option>
                    {n.compraConferencia?.itens.map((i) => (
                      <option key={i.id} value={i.id}>
                        #{i.id} · {i.nome} · cor {i.idCor ?? "—"} / tamanho{" "}
                        {i.idTamanho ?? "—"}
                      </option>
                    ))}
                  </select>
                </label>
                {compraItem && compraItem.variacoes.length > 0 && (
                  <label className="grid gap-1 text-sm">
                    Variação
                    <select
                      className={estilo}
                      aria-label={`Variação da linha ${index + 1}`}
                      value={l.idVariacao ?? ""}
                      onChange={(e) =>
                        alterar(index, {
                          idVariacao: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">Selecione</option>
                      {compraItem.variacoes.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome || `Variação ${v.id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="grid gap-1 text-sm">
                  Quantidade do documento
                  <Input
                    aria-label={`Quantidade da linha ${index + 1}`}
                    inputMode="decimal"
                    value={l.quantidade}
                    onChange={(e) =>
                      alterar(index, { quantidade: e.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Unidade do documento
                  <Input
                    aria-label={`Unidade da linha ${index + 1}`}
                    maxLength={20}
                    value={l.unidade}
                    onChange={(e) =>
                      alterar(index, { unidade: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Tipo de valor
                  <select
                    className={estilo}
                    aria-label={`Tipo de valor da linha ${index + 1}`}
                    value={l.tipoValor}
                    onChange={(e) =>
                      alterar(index, {
                        tipoValor: e.target.value as ItemNota["tipoValor"],
                      })
                    }
                  >
                    {["UNITARIO", "METRO", "TOTAL"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  {l.tipoValor === "TOTAL"
                    ? "Valor integral da linha"
                    : "Valor unitário"}
                  <Input
                    aria-label={`Valor unitário da linha ${index + 1}`}
                    inputMode="decimal"
                    value={l.valorUnitario}
                    onChange={(e) =>
                      alterar(index, { valorUnitario: e.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Valor total fiscal da linha
                  <Input
                    aria-label={`Valor total da linha ${index + 1}`}
                    inputMode="decimal"
                    value={l.valorTotal}
                    onChange={(e) =>
                      alterar(index, { valorTotal: e.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Local de estoque
                  <Input
                    readOnly
                    aria-label={`Local da linha ${index + 1}`}
                    value={l.idLocalEstoque ?? ""}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Setor de destino
                  <SeletorUnico
                    api={api}
                    tipo="setores"
                    valor={
                      l.idSetor
                        ? {
                            id: l.idSetor,
                            nome: l.setorNome ?? `Setor #${l.idSetor}`,
                          }
                        : null
                    }
                    onChange={(v) =>
                      alterar(index, {
                        idSetor: v?.id ?? null,
                        setorNome: v?.nome ?? null,
                      })
                    }
                    placeholder={`Setor da linha ${index + 1}`}
                  />
                </label>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  setLinhas((v) => v.filter((_, i) => i !== index))
                }
              >
                Remover linha {l.numeroItem}
              </Button>
              {l.divergenciaCompra && (
                <p className="text-sm">
                  O valor difere da referência da compra (
                  {l.valorReferenciaCompra}); justifique a conferência.
                </p>
              )}
            </article>
          )
        })}
        <Button
          variant="outline"
          onClick={() =>
            setLinhas((v) => [
              ...v,
              {
                key: crypto.randomUUID(),
                numeroItem: Math.max(0, ...v.map((i) => i.numeroItem)) + 1,
                codigo: null,
                descricao: null,
                idProduto: null,
                idCompraItem: null,
                idVariacao: null,
                idLocalEstoque: null,
                idSetor: null,
                quantidade: "",
                unidade: "",
                tipoValor: "UNITARIO",
                valorUnitario: "",
                valorTotal: "",
              },
            ])
          }
        >
          Adicionar linha fiscal
        </Button>
        <label className="grid gap-1 text-sm">
          Justificativa de diferenças em relação à compra
          <Textarea
            aria-label="Justificativa dos valores"
            maxLength={255}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />
        </label>
        <Button onClick={() => void salvar()}>
          Salvar conferência dos itens
        </Button>
      </fieldset>
      <p className="text-sm">
        Somatório salvo: {n.somatorioItens}. Total do documento: {n.valorTotal}.
        Valores são conferidos no servidor, com arredondamento comercial para
        centavos por linha.
      </p>
      {editavel && (
        <fieldset disabled={bloqueado} className="space-y-4">
          <h4 className="font-medium">
            Confirmar a origem física de cada linha salva
          </h4>
          {n.itens.map((i) => {
            const f = fontes[i.id!],
              recebimentos =
                n.compraConferencia?.recebimentos.filter(
                  (r) =>
                    r.idCompraItem === i.idCompraItem &&
                    r.idVariacao === i.idVariacao &&
                    r.idLocalEstoque === i.idLocalEstoque &&
                    r.idSetor === i.idSetor &&
                    Number(r.livre) > 0,
                ) ?? []
            return (
              <div className="space-y-2 rounded-lg border p-3" key={i.id}>
                <p>
                  Linha {i.numeroItem} · {i.quantidade} {i.unidade}
                </p>
                <label className="grid gap-1 text-sm">
                  Origem da entrada
                  <select
                    className={estilo}
                    aria-label={`Origem física da linha ${i.numeroItem}`}
                    value={f?.modo ?? ""}
                    onChange={(e) =>
                      fonte(i.id!, {
                        modo: e.target.value,
                        novaQuantidade:
                          e.target.value === "NOVA" ? i.quantidade : "0",
                        recebimentos: [],
                      })
                    }
                  >
                    <option value="">Selecione</option>
                    <option value="NOVA">
                      Efetivar nova entrada da compra
                    </option>
                    <option value="ASSOCIAR">
                      Vincular recebimentos já existentes
                    </option>
                    <option value="MISTA">
                      Parte nova e parte já recebida
                    </option>
                  </select>
                </label>
                {f?.modo === "MISTA" && (
                  <label className="grid gap-1 text-sm">
                    Quantidade nova
                    <Input
                      aria-label={`Quantidade nova da linha ${i.numeroItem}`}
                      value={f.novaQuantidade}
                      onChange={(e) =>
                        fonte(i.id!, { novaQuantidade: e.target.value })
                      }
                    />
                  </label>
                )}
                {f && f.modo !== "NOVA" && (
                  <>
                    {f.recebimentos.map((r, k) => (
                      <div className="grid gap-2 sm:grid-cols-2" key={k}>
                        <select
                          className={estilo}
                          aria-label={`Recebimento ${k + 1} da linha ${i.numeroItem}`}
                          value={r.idMovimentacao || ""}
                          onChange={(e) =>
                            fonte(i.id!, {
                              recebimentos: f.recebimentos.map((old, j) =>
                                j === k
                                  ? {
                                      ...old,
                                      idMovimentacao: Number(e.target.value),
                                    }
                                  : old,
                              ),
                            })
                          }
                        >
                          <option value="">
                            Selecione um movimento comprovado
                          </option>
                          {recebimentos.map((x) => (
                            <option
                              value={x.idMovimentacao}
                              key={x.idMovimentacao}
                            >
                              #{x.idMovimentacao} · livre {x.livre} ·
                              responsável #{x.responsavel}
                            </option>
                          ))}
                        </select>
                        <Input
                          aria-label={`Quantidade associada ${k + 1} da linha ${i.numeroItem}`}
                          inputMode="decimal"
                          value={r.quantidade}
                          onChange={(e) =>
                            fonte(i.id!, {
                              recebimentos: f.recebimentos.map((old, j) =>
                                j === k
                                  ? { ...old, quantidade: e.target.value }
                                  : old,
                              ),
                            })
                          }
                        />
                        <Button
                          variant="outline"
                          onClick={() =>
                            fonte(i.id!, {
                              recebimentos: f.recebimentos.filter(
                                (_, j) => j !== k,
                              ),
                            })
                          }
                        >
                          Remover vínculo
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() =>
                        fonte(i.id!, {
                          recebimentos: [
                            ...f.recebimentos,
                            { idMovimentacao: 0, quantidade: "" },
                          ],
                        })
                      }
                    >
                      Associar recebimento à linha {i.numeroItem}
                    </Button>
                    {recebimentos.length === 0 && (
                      <p className="text-sm">
                        Não há recebimento livre comprovado nesta posição e
                        variação.
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          })}
          <Button onClick={() => void processar()}>
            Confirmar processamento da entrada
          </Button>
        </fieldset>
      )}
      {n.entradaProcessada && (
        <p role="status">
          Entrada processada em{" "}
          {n.dataProcessamento
            ? new Date(n.dataProcessamento).toLocaleString("pt-BR")
            : "data registrada"}
          .
        </p>
      )}
      {n.alocacoes.length > 0 && (
        <div>
          <h4 className="font-medium">Movimentos vinculados</h4>
          {n.alocacoes.map((a) => (
            <p
              key={`${a.id_item_nota}:${a.id_movimentacao}`}
              className="text-sm"
            >
              Linha #{a.id_item_nota} · movimento de estoque #
              {a.id_movimentacao} · {a.quantidade}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
