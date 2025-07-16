import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { LinkData } from "@/app/actions"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function downloadCSV(data: LinkData[], filename: string) {
  if (data.length === 0) return

  const headers = ["Target URL", "Anchor Text", "Type"]
  const rows = data.map((item) => [
    `"${item.targetUrl}"`,
    `"${item.anchorText.replace(/"/g, '""')}"`,
    `"${item.isNofollow ? "Nofollow" : "Dofollow"}"`,
  ])

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  if (link.href) {
    URL.revokeObjectURL(link.href)
  }
  link.href = URL.createObjectURL(blob)
  link.setAttribute("download", `${filename}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
