"use client"

import * as React from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileDown, ExternalLink, Search } from "lucide-react"

interface LinkData {
  source_url: string
  target_url: string
  target_domain: string
  anchor_text: string
  rel_type: string
  is_nofollow: boolean
  created_at: string
}

interface LinkResultsTableProps {
  data: LinkData[]
  domain: string
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function LinkResultsTable({ data, domain, pagination }: LinkResultsTableProps) {
  const [searchTerm, setSearchTerm] = React.useState("")
  const [followFilter, setFollowFilter] = React.useState("all")
  const [domainFilter, setDomainFilter] = React.useState("")

  // Get unique domains for filtering
  const uniqueDomains = React.useMemo(() => {
    const domains = new Set(data.map((link) => link.target_domain))
    return Array.from(domains).sort()
  }, [data])

  const filteredData = React.useMemo(() => {
    return data.filter((item) => {
      const searchMatch =
        item.target_url.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.anchor_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.target_domain.toLowerCase().includes(searchTerm.toLowerCase())

      const followMatch =
        followFilter === "all" ||
        (followFilter === "dofollow" && !item.is_nofollow) ||
        (followFilter === "nofollow" && item.is_nofollow)

      const domainMatch = domainFilter === "" || item.target_domain === domainFilter

      return searchMatch && followMatch && domainMatch
    })
  }, [data, searchTerm, followFilter, domainFilter])

  const handleExport = () => {
    const csvContent = [
      ["Target Domain", "Target URL", "Anchor Text", "Link Type", "Source URL"].join(","),
      ...filteredData.map((item) =>
        [
          `"${item.target_domain}"`,
          `"${item.target_url}"`,
          `"${item.anchor_text.replace(/"/g, '""')}"`,
          `"${item.is_nofollow ? "Nofollow" : "Dofollow"}"`,
          `"${item.source_url}"`,
        ].join(","),
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `${domain}_external_links.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by URL, domain, or anchor text..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={followFilter} onValueChange={setFollowFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Links</SelectItem>
            <SelectItem value="dofollow">Dofollow Only</SelectItem>
            <SelectItem value="nofollow">Nofollow Only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by domain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            {uniqueDomains.slice(0, 20).map((domain) => (
              <SelectItem key={domain} value={domain}>
                {domain}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleExport} disabled={filteredData.length === 0}>
          <FileDown className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400">
        Showing {filteredData.length} of {data.length} links
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Target Domain</TableHead>
              <TableHead>Target URL</TableHead>
              <TableHead>Anchor Text</TableHead>
              <TableHead className="text-center">Type</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length > 0 ? (
              filteredData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    <Badge variant="outline" className="font-mono text-xs">
                      {item.target_domain}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="truncate" title={item.target_url}>
                      {item.target_url}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="truncate" title={item.anchor_text}>
                      {item.anchor_text || <span className="text-gray-400 italic">No anchor text</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {item.is_nofollow ? (
                      <Badge variant="secondary">Nofollow</Badge>
                    ) : (
                      <Badge className="bg-green-600 hover:bg-green-700">Dofollow</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(item.target_url, "_blank")}
                      title="Open link in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  {data.length === 0 ? "No external links found." : "No results match your filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
