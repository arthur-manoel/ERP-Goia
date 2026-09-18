export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}
