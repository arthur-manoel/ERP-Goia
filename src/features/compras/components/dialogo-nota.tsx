"use client"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import {
  chaveAcessoValida,
  normalizarChave,
} from "@/modules/compras/compras.regras"
import { BASE, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type { Compra, Nota } from "../tipos"
import { Campo, dinheiro2, moeda, SeletorUnico } from "./comuns"

type Ref = { id: number; nome: string } | null
const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : "")

export function DialogoNota({
  api,
  existente,
  compra,
  onFechar,
  onSalvo,
}: {
  api: ComprasApi
  existente?: Nota
  /** Quando informado, a nota nasce vinculada a esta compra (fornecedor travado). */
  compra?: {
    id: number
    codigo: string
    fornecedor: { id: number; nome: string }
    valorTotal: string
  }
  onFechar: () => void
  onSalvo: () => void
}) {
  const [numeroNf, setNumeroNf] = useState(existente?.numero ?? "")
  const [serie, setSerie] = useState(existente?.serie ?? "")
  const [chave, setChave] = useState(existente?.chaveAcesso ?? "")
  const [fornecedor, setFornecedor] = useState<Ref>(
    existente
      ? { id: existente.fornecedor.id, nome: existente.fornecedor.nome }
      : (compra?.fornecedor ?? null),
  )
  const [idCompra, setIdCompra] = useState(
    String(existente?.compra?.id ?? compra?.id ?? ""),
  )
  const [compras, setCompras] = useState<{
    para: number | null
    lista: Compra[]
  }>({ para: null, lista: [] })
  const [emissao, setEmissao] = useState(dia(existente?.dataEmissao ?? null))
  const [entrada, setEntrada] = useState(
    dia(existente?.dataRecebimento ?? null),
  )
  const [valor, setValor] = useState(existente?.valorTotal ?? "")
  const [obs, setObs] = useState(existente?.observacao ?? "")
  const { ocupado, erro, setErro, executar } = useExecutar()
  const fixo = Boolean(compra)

  useEffect(() => {
    if (fixo || !fornecedor) return
    let vivo = true
    api
      .get<{ compras: Compra[] }>(
        `${BASE}/compras?idFornecedor=${fornecedor.id}&limite=100`,
      )
      .then(
        (r) =>
          vivo &&
          setCompras({
            para: fornecedor.id,
            lista: r.compras.filter((c) => c.status !== "CANCELADA"),
          }),
        () => vivo && setCompras({ para: fornecedor.id, lista: [] }),
      )
    return () => {
      vivo = false
    }
  }, [api, fornecedor, fixo])

  const chaveNorm = normalizarChave(chave)
  const chaveOk = chaveNorm.length === 44 && chaveAcessoValida(chaveNorm)
  const listaCompras =
    fornecedor && compras.para === fornecedor.id ? compras.lista : []
  const compraEscolhida = listaCompras.find((c) => String(c.id) === idCompra)
  const totalCompra = compra?.valorTotal ?? compraEscolhida?.valorTotal

  async function salvar() {
    if (!/^\d{1,30}$/.test(numeroNf.trim()))
      return setErro("Número da nota: apenas dígitos.")
    if (!/^\d{1,10}$/.test(serie.trim()))
      return setErro("Série: apenas dígitos.")
    if (!chaveOk)
      return setErro("Chave de acesso inválida: confira os 44 dígitos.")
    if (!fornecedor) return setErro("Selecione o fornecedor.")
    const v = valor.trim() ? dinheiro2(valor) : null
    if (valor.trim() && v === null)
      return setErro("Valor total inválido (até 2 casas, não negativo).")
    if (!v && !totalCompra) return setErro("Informe o valor total da nota.")
    const corpo = {
      numero: numeroNf.trim(),
      serie: serie.trim(),
      chaveAcesso: chaveNorm,
      idFornecedor: fornecedor.id,
      idCompra: idCompra ? Number(idCompra) : null,
      dataEmissao: emissao || null,
      dataRecebimento: entrada || null,
      ...(v ? { valorTotal: v } : {}),
      observacao: obs.trim() || null,
    }
    const r = existente
      ? await executar(
          () =>
            api.enviar(`${BASE}/notas-fiscais/${existente.id}`, "PATCH", corpo),
          "Nota fiscal atualizada.",
        )
      : await executar(
          () => api.enviar(`${BASE}/notas-fiscais`, "POST", corpo),
          "Nota fiscal registrada.",
        )
    if (r) {
      onSalvo()
      onFechar()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {existente
              ? `Editar NF ${existente.numero}`
              : "Registrar nota fiscal"}
          </DialogTitle>
          <DialogDescription>
            Apenas registro e controle: não há integração com a SEFAZ nem
            movimentação de estoque.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Número">
            <Input
              inputMode="numeric"
              value={numeroNf}
              onChange={(e) => setNumeroNf(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Série">
            <Input
              inputMode="numeric"
              value={serie}
              onChange={(e) => setSerie(e.target.value)}
            />
          </Campo>
        </div>
        <Campo
          rotulo="Chave de acesso (44 dígitos)"
          ajuda={
            chaveNorm.length === 44
              ? chaveOk
                ? "Chave válida."
                : "Dígito verificador não confere."
              : `${chaveNorm.length}/44 dígitos`
          }
        >
          <Input
            className="font-mono"
            inputMode="numeric"
            maxLength={60}
            value={chave}
            aria-invalid={chaveNorm.length === 44 && !chaveOk}
            onChange={(e) => setChave(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Fornecedor">
          <SeletorUnico
            api={api}
            tipo="fornecedores"
            valor={fornecedor}
            desabilitado={fixo}
            onChange={(f) => {
              setFornecedor(f)
              setIdCompra("")
            }}
            placeholder="fornecedor"
          />
        </Campo>
        <Campo
          rotulo="Compra vinculada (opcional)"
          ajuda={
            compra
              ? undefined
              : fornecedor
                ? "Vincular à compra também associa o pedido correspondente."
                : "Escolha o fornecedor para listar as compras."
          }
        >
          {fixo ? (
            <div className="flex h-8 items-center rounded-lg border px-2.5 text-sm">
              {compra?.codigo}
            </div>
          ) : (
            <NativeSelect
              className="w-full"
              value={idCompra}
              disabled={!fornecedor}
              onChange={(e) => setIdCompra(e.target.value)}
            >
              <NativeSelectOption value="">Sem vínculo</NativeSelectOption>
              {listaCompras.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.codigo}
                  {c.pedido ? ` · ${c.pedido.numero}` : ""} —{" "}
                  {moeda(c.valorTotal)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Data de emissão">
            <Input
              type="date"
              value={emissao}
              onChange={(e) => setEmissao(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Data de entrada">
            <Input
              type="date"
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
            />
          </Campo>
          <Campo
            rotulo="Valor total (R$)"
            ajuda={
              totalCompra
                ? `Em branco = total da compra (${moeda(totalCompra)})`
                : undefined
            }
          >
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
          </Campo>
        </div>
        <Campo rotulo="Observações">
          <Textarea
            maxLength={255}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Campo>
        {erro && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={ocupado} onClick={() => void salvar()}>
            {existente ? "Salvar alterações" : "Registrar nota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
