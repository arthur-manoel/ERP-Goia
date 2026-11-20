import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/estoque/*/exportar": [
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans{,-Bold}.ttf",
    ],
  },
}

export default nextConfig
