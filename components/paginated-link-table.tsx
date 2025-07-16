"use client"

import * as React from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileDown, ExternalLink, Search, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"

interface LinkData {
  source_url: string
  target_url: string
  target_domain: string
  anchor_text: string
  rel_type: string
  is_nofollow: boolean
  created_at: string
}

interface PaginatedLinkTableProps {
  domain: string
}

export function PaginatedLinkTable({ domain }: PaginatedLinkTableProps) {
  const [data, setData] = React.useState<LinkData[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [followFilter, setFollowFilter] = React.useState("all")
  const [domainFilter, setDomainFilter] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pagination, setPagination] = React.useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  })
  const [uniqueDomains, setUniqueDomains] = React.useState<string[]>([])
  const [allResults, setAllResults] = React.useState<any>(null)

  const fetchLinks = React.useCallback(
    async (page = 1) => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "25",
          filter: searchTerm,
          relType: followFilter,
          domainFilter: domainFilter,
        })

        const response = await fetch(`/api/links/${domain}?${params}`)
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || "Failed to fetch links")
        }

        setData(result.links)
        setPagination(result.pagination)
        setAllResults(result)

        // Extract unique domains for filtering
        if (result.domainSummary) {
          const domains = result.domainSummary.map((d: any) => d.target_domain).sort()
          setUniqueDomains(domains)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch links")
      } finally {
        setLoading(false)
      }
    },
    [domain, searchTerm, followFilter, domainFilter],
  )

  // Fetch data when filters change
  React.useEffect(() => {
    if (domain) {
      setCurrentPage(1)
      fetchLinks(1)
    }
  }, [domain, searchTerm, followFilter, domainFilter])

  // Handle page changes
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    fetchLinks(newPage)
  }

  const handleExport = async () => {
    try {
      // Fetch all results for export
      const params = new URLSearchParams({
        page: "1",
        limit: "10000", // Large limit to get all results
        filter: searchTerm,
        relType: followFilter,
        domainFilter: domainFilter,
      })

      const response = await fetch(`/api/links/${domain}?${params}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error("Failed to export data")
      }

      const csvContent = [
        ["Target Domain", "Target URL", "Anchor Text", "Link Type", "Source URL"].join(","),
        ...result.links.map((item: LinkData) =>
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
      link.setAttribute("download", `${domain}_all_external_links.csv`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Export failed:", error)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
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
        <Button onClick={handleExport} disabled={loading || pagination.total === 0}>
          <FileDown className="mr-2 h-4 w-4" />
          Export All
        </Button>
      </div>

      {/* Results info */}
      <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
        <span>
          Showing {pagination.total > 0 ? (currentPage - 1) * pagination.limit + 1 : 0} to{" "}
          {Math.min(currentPage * pagination.limit, pagination.total)} of {pagination.total} links
        </span>
        {loading && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
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
            {loading && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex justify-center items-center">
                    <Loader2 className="mr-2 h-8 w-8 animate-spin text-gray-500" />
                    <span className="text-gray-500">Loading links...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length > 0 ? (
              data.map((item, index) => (
                <TableRow key={`${item.target_url}-${index}`}>
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
                  {pagination.total === 0 ? "No external links found." : "No results match your filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Page {currentPage} of {pagination.totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!pagination.hasPrev || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            {/* Page numbers */}
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const pageNum = Math.max(1, currentPage - 2) + i
                if (pageNum > pagination.totalPages) return null

                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    disabled={loading}
                    className="w-10"
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!pagination.hasNext || loading}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
