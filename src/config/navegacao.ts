import {
  ArrowLeftRight,
  BadgeDollarSign,
  Bookmark,
  BriefcaseBusiness,
  Building,
  ClipboardList,
  ClipboardPen,
  Factory,
  FileText,
  LayoutDashboard,
  ListOrdered,
  MapPin,
  Network,
  Package,
  Palette,
  Receipt,
  Route,
  Ruler,
  ScrollText,
  Shapes,
  ShoppingCart,
  Tags,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react"

export type ItemNavegacao = {
  titulo: string
  href: string
  icone: LucideIcon
}

export type GrupoNavegacao = {
  titulo: string
  itens: ItemNavegacao[]
}

// Fonte única do menu lateral. Ao criar uma tela nova, adicione a rota aqui.
export const navegacao: GrupoNavegacao[] = [
  {
    titulo: "Geral",
    itens: [{ titulo: "Dashboard", href: "/", icone: LayoutDashboard }],
  },
  {
    titulo: "Cadastros",
    itens: [
      { titulo: "Clientes", href: "/cadastros/clientes", icone: Users },
      { titulo: "Fornecedores", href: "/cadastros/fornecedores", icone: Truck },
      { titulo: "Categorias", href: "/cadastros/categorias", icone: Tags },
      { titulo: "Cores", href: "/cadastros/cores", icone: Palette },
      { titulo: "Tamanhos", href: "/cadastros/tamanhos", icone: Ruler },
      {
        titulo: "Tipos de produto",
        href: "/cadastros/tipos-produto",
        icone: Shapes,
      },
    ],
  },
  {
    titulo: "Produtos",
    itens: [
      { titulo: "Produtos", href: "/produtos", icone: Package },
      {
        titulo: "Fichas técnicas",
        href: "/produtos/fichas-tecnicas",
        icone: ClipboardList,
      },
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      { titulo: "Saldos", href: "/estoque", icone: Warehouse },
      {
        titulo: "Movimentações",
        href: "/estoque/movimentacoes",
        icone: ArrowLeftRight,
      },
      { titulo: "Kardex", href: "/estoque/kardex", icone: ListOrdered },
      { titulo: "Reservas", href: "/estoque/reservas", icone: Bookmark },
      { titulo: "Locais de estoque", href: "/estoque/locais", icone: MapPin },
    ],
  },
  {
    titulo: "Compras",
    itens: [
      {
        titulo: "Requisições",
        href: "/compras/requisicoes",
        icone: ClipboardPen,
      },
      {
        titulo: "Pedidos de compra",
        href: "/compras/pedidos",
        icone: FileText,
      },
      { titulo: "Compras", href: "/compras", icone: ShoppingCart },
      { titulo: "Notas fiscais", href: "/notas-fiscais", icone: Receipt },
    ],
  },
  {
    titulo: "Produção",
    itens: [
      {
        titulo: "Ordens de produção",
        href: "/producao/ordens",
        icone: Factory,
      },
      {
        titulo: "Movimentação entre setores",
        href: "/producao/movimentacoes",
        icone: Route,
      },
    ],
  },
  {
    titulo: "Vendas",
    itens: [{ titulo: "Vendas", href: "/vendas", icone: BadgeDollarSign }],
  },
  {
    titulo: "Administração",
    itens: [
      { titulo: "Empresas", href: "/admin/empresas", icone: Building },
      { titulo: "Setores", href: "/admin/setores", icone: Network },
      { titulo: "Cargos", href: "/admin/cargos", icone: BriefcaseBusiness },
      { titulo: "Usuários", href: "/admin/usuarios", icone: UserCog },
      { titulo: "Auditoria", href: "/admin/auditoria", icone: ScrollText },
    ],
  },
]
