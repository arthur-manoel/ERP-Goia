import { formatarData } from "@/lib/formatacao"

export const rotuloData = (value: string) =>
  value ? formatarData(new Date(`${value}T12:00:00-03:00`)) : "—"

export const hoje = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
