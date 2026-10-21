"use client"

import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CircleCheck,
  ClipboardCheck,
  FlaskConical,
  Plus,
  type LucideIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { LIMITE_OBSERVACAO } from "@/lib/movimentacao/validacao"
import {
  TIPOS_MOVIMENTACAO,
  rotuloTipo,
  usaDestino,
  usaOrigem,
  type OpcoesMovimentacao,
  type TipoMovimentacao,
} from "@/lib/movimentacao/tipos"
import { ConfirmarMovimentacao } from "./confirmar-movimentacao"
import { ResumoMovimentacao } from "./resumo-movimentacao"
import { SeletorEstoque } from "./seletor-estoque"
import { SeletorItem } from "./seletor-item"
import { useFormularioMovimentacao } from "./use-formulario-movimentacao"

const icones: Record<TipoMovimentacao, LucideIcon> = {
  entrada: ArrowDownToLine,
  saida: ArrowUpFromLine,
  transferencia: ArrowLeftRight,
}

export function MovimentacaoTela({ opcoes }: { opcoes: OpcoesMovimentacao }) {
  const f = useFormularioMovimentacao(opcoes)
  const { tipo, campos, erros, fase, resumo } = f
  const bloqueado = fase !== "editando"

  if (opcoes.itens.length === 0 || opcoes.estoques.length === 0) {
    return (
      <Alert className="max-w-2xl">
        <AlertTitle>Nada para movimentar ainda</AlertTitle>
        <AlertDescription>
          É preciso ter ao menos um item e um estoque cadastrados para registrar
          movimentações.
        </AlertDescription>
      </Alert>
    )
  }

  const aviso = (
    <Alert>
      <FlaskConical aria-hidden />
      <AlertTitle>Dados de demonstração</AlertTitle>
      <AlertDescription>
        Itens e estoques são fictícios e nenhuma movimentação é gravada: a
        integração com o servidor ainda não foi feita.
      </AlertDescription>
    </Alert>
  )

  if (fase === "concluida" && resumo) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {aviso}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleCheck className="size-4" aria-hidden />
              Movimentação preparada com sucesso.
            </CardTitle>
            <CardDescription>
              Os dados ainda não foram enviados nem gravados.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ResumoMovimentacao resumo={resumo} />
            <div>
              <Button onClick={f.novaMovimentacao}>
                <Plus data-icon="inline-start" />
                Nova movimentação
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const formulario = (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        f.revisar()
      }}
    >
      <FieldGroup>
        <Field data-invalid={!!erros.item}>
          <FieldLabel htmlFor="mov-item">Item</FieldLabel>
          <SeletorItem
            id="mov-item"
            itens={opcoes.itens}
            valor={campos.item}
            onChange={(item) => f.atualizarCampo("item", item)}
            invalido={!!erros.item}
            disabled={bloqueado}
            // Futuro: saldo={...} com o saldo do item no estoque de origem (API).
          />
          {erros.item && <FieldError>{erros.item}</FieldError>}
        </Field>

        {(usaOrigem(tipo) || usaDestino(tipo)) && (
          <div className="grid gap-5 sm:grid-cols-2">
            {usaOrigem(tipo) && (
              <Field data-invalid={!!erros.origem}>
                <FieldLabel htmlFor="mov-origem">Estoque de origem</FieldLabel>
                <SeletorEstoque
                  id="mov-origem"
                  estoques={opcoes.estoques}
                  valor={campos.idEstoqueOrigem}
                  onChange={(id) => f.atualizarCampo("idEstoqueOrigem", id)}
                  desabilitarId={
                    tipo === "transferencia" ? campos.idEstoqueDestino : null
                  }
                  invalido={!!erros.origem}
                  disabled={bloqueado}
                />
                {erros.origem && <FieldError>{erros.origem}</FieldError>}
              </Field>
            )}
            {usaDestino(tipo) && (
              <Field data-invalid={!!erros.destino}>
                <FieldLabel htmlFor="mov-destino">
                  Estoque de destino
                </FieldLabel>
                <SeletorEstoque
                  id="mov-destino"
                  estoques={opcoes.estoques}
                  valor={campos.idEstoqueDestino}
                  onChange={(id) => f.atualizarCampo("idEstoqueDestino", id)}
                  desabilitarId={
                    tipo === "transferencia" ? campos.idEstoqueOrigem : null
                  }
                  invalido={!!erros.destino}
                  disabled={bloqueado}
                />
                {erros.destino && <FieldError>{erros.destino}</FieldError>}
              </Field>
            )}
          </div>
        )}

        <Field data-invalid={!!erros.quantidade}>
          <FieldLabel htmlFor="mov-quantidade">Quantidade</FieldLabel>
          <InputGroup className="sm:max-w-xs">
            <InputGroupInput
              id="mov-quantidade"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={campos.quantidade}
              onChange={(e) => f.atualizarCampo("quantidade", e.target.value)}
              aria-invalid={!!erros.quantidade}
              disabled={bloqueado}
            />
            {campos.item && (
              <InputGroupAddon align="inline-end">
                {campos.item.unidade}
              </InputGroupAddon>
            )}
          </InputGroup>
          {erros.quantidade ? (
            <FieldError>{erros.quantidade}</FieldError>
          ) : (
            <FieldDescription>
              Use vírgula para decimais, ex.: 12,5.
            </FieldDescription>
          )}
        </Field>

        <Field data-invalid={!!erros.observacao}>
          <FieldLabel htmlFor="mov-observacao">
            Observação (opcional)
          </FieldLabel>
          <Textarea
            id="mov-observacao"
            placeholder="Ex.: reposição de estoque"
            maxLength={LIMITE_OBSERVACAO}
            value={campos.observacao}
            onChange={(e) => f.atualizarCampo("observacao", e.target.value)}
            aria-invalid={!!erros.observacao}
            disabled={bloqueado}
          />
          {erros.observacao && <FieldError>{erros.observacao}</FieldError>}
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={bloqueado}>
          <ClipboardCheck data-icon="inline-start" />
          Revisar movimentação
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={f.limpar}
          disabled={bloqueado}
        >
          Limpar campos
        </Button>
      </div>
    </form>
  )

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {aviso}
      <Card>
        <CardHeader>
          <CardTitle>Nova movimentação</CardTitle>
          <CardDescription>
            Escolha a operação e preencha os dados para conferir antes de
            confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tipo}
            onValueChange={(valor) => f.mudarTipo(valor as TipoMovimentacao)}
          >
            <TabsList className="w-full sm:w-fit">
              {TIPOS_MOVIMENTACAO.map((t) => {
                const Icone = icones[t]
                return (
                  <TabsTrigger key={t} value={t}>
                    <Icone aria-hidden />
                    {rotuloTipo[t]}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {TIPOS_MOVIMENTACAO.map((t) => (
              <TabsContent key={t} value={t} className="pt-4">
                {formulario}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <ConfirmarMovimentacao
        resumo={resumo}
        aberto={fase === "confirmando" || fase === "enviando"}
        enviando={fase === "enviando"}
        erro={f.erroEnvio}
        onConfirmar={f.confirmar}
        onVoltar={f.voltarParaEdicao}
      />
    </div>
  )
}
