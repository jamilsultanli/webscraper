import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { domain: string } }) {
  try {
    const { domain } = params
    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "25")
    const filter = searchParams.get("filter") || ""
    const relType = searchParams.get("relType") || "all"
    const domainFilter = searchParams.get("domainFilter") || ""

    // 1. Get domain_id from the domains table
    const domainRecord = await sql`
      SELECT id, domain_name, status, total_external_links, total_pages_crawled, crawl_depth, created_at, updated_at
      FROM domains
      WHERE domain_name = ${domain};
    `

    if (domainRecord.length === 0) {
      return NextResponse.json({ error: "No results found for this domain. Please crawl first." }, { status: 404 })
    }

    const domainInfo = domainRecord[0]
    const domainId = domainInfo.id

    // 2. Fetch all links for filtering and pagination
    let query = sql`
      SELECT source_url, target_url, target_domain, anchor_text, rel_type, is_nofollow, created_at
      FROM outgoing_links
      WHERE domain_id = ${domainId}
    `

    const queryParams: any[] = []
    const paramIndex = 1

    if (filter) {
      query = sql`${query} AND (
        LOWER(target_url) LIKE LOWER(${`%${filter}%`}) OR
        LOWER(anchor_text) LIKE LOWER(${`%${filter}%`}) OR
        LOWER(target_domain) LIKE LOWER(${`%${filter}%`})
      )`
    }

    if (relType !== "all") {
      if (relType === "nofollow") {
        query = sql`${query} AND is_nofollow = TRUE`
      } else if (relType === "dofollow") {
        query = sql`${query} AND is_nofollow = FALSE`
      }
    }

    if (domainFilter) {
      query = sql`${query} AND target_domain = ${domainFilter}`
    }

    const allLinksResult = await query
    const allLinks = allLinksResult // allLinks is now the filtered set

    // 3. Fetch domain summary
    const domainSummaryResult = await sql`
      SELECT target_domain, link_count, first_seen_at, last_seen_at
      FROM outgoing_domains
      WHERE domain_id = ${domainId}
      ORDER BY link_count DESC;
    `
    const domainSummary = domainSummaryResult

    // Pagination
    const offset = (page - 1) * limit
    const paginatedLinks = allLinks.slice(offset, offset + limit)
    const totalPages = Math.ceil(allLinks.length / limit)

    return NextResponse.json({
      domain: {
        id: domainInfo.id,
        domain_name: domainInfo.domain_name,
        status: domainInfo.status,
        total_external_links: domainInfo.total_external_links,
        total_pages_crawled: domainInfo.total_pages_crawled,
        crawl_date: domainInfo.created_at, // Use created_at for initial crawl date
        crawl_depth: domainInfo.crawl_depth,
        // crawl_config and sitemapsFound are not stored in 'domains' table,
        // so they won't be available here unless added to the schema.
        // For now, we'll omit them or set to default/null.
        crawl_config: null,
        sitemapsFound: 0,
      },
      links: paginatedLinks,
      domainSummary: domainSummary,
      stats: {
        pagesCrawled: domainInfo.total_pages_crawled,
        totalUrls: domainInfo.total_pages_crawled, // Approximation, as we don't store all discovered URLs
        errors: 0, // Not stored in DB currently
        domains: domainSummary.length,
        sitemapsFound: 0, // Not stored in DB currently
      },
      pagination: {
        page,
        limit,
        total: allLinks.length,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        filter,
        relType,
        domainFilter,
      },
    })
  } catch (error) {
    console.error("Links API error:", error)
    return NextResponse.json({ error: "Failed to fetch links" }, { status: 500 })
  }
}
