import { ThemeToggle } from "@/components/layout/theme-toggle"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-svh items-center justify-center bg-muted/40 px-4 py-20">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}
