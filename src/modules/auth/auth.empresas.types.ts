export type EmpresaSessao = { id: number; nome: string }
export type UsuarioSessao = { id: number; nome: string; email: string }
export type EmpresasSessao = {
  usuario: UsuarioSessao
  empresas: EmpresaSessao[]
}
