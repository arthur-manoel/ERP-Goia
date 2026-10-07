"use client"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { api } from "@/features/erp/adaptador"
import type { Collection, Data } from "@/features/erp/tipos"
type Context = {
  data: Data | null
  error: string
  reload: () => Promise<void>
  save: (collection: Collection, values: unknown, id?: string) => Promise<void>
  remove: (collection: Collection, id: string) => Promise<void>
}
const ErpContext = createContext<Context | null>(null)
export function ErpProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const reload = useCallback(async () => {
    setError("")
    try {
      setData(await api.list())
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Falha ao carregar os dados.",
      )
    }
  }, [])
  useEffect(() => {
    let active = true
    void api.list().then(
      (snapshot) => {
        if (active) setData(snapshot)
      },
      (error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Falha ao carregar os dados.",
          )
      },
    )
    return () => {
      active = false
    }
  }, [])
  const save = async (collection: Collection, values: unknown, id?: string) => {
    setData(await api.save(collection, values, id))
  }
  const remove = async (collection: Collection, id: string) => {
    setData(await api.remove(collection, id))
  }
  return (
    <ErpContext.Provider value={{ data, error, reload, save, remove }}>
      {children}
    </ErpContext.Provider>
  )
}
export function useErp() {
  const context = useContext(ErpContext)
  if (!context) throw new Error("ErpProvider ausente.")
  return context
}
