import { type NextRequest, NextResponse } from "next/server"
import { getDbClient } from "@/lib/db"

export async function GET(request: NextRequest, { params }: { params: { domain: string } }) {
  try {
    const { domain } = params

    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 })
    }

    const client = await getDbClient()

    // Get the most recent crawl record for the domain
    const domainRecordResult = await client.query(
      `
      SELECT id, domain_name, status, total_pages_crawled, total_external_links, crawl_depth, created_at, updated_at
      FROM domains
      WHERE domain_name = $1
      ORDER BY id DESC
      LIMIT 1;
    `,
      [domain],
    )

    if (domainRecordResult.rows.length === 0) {
      return NextResponse.json({ error: "No crawl found for this domain." }, { status: 404 })
    }

    const crawlStatus = domainRecordResult.rows[0]

    // If the crawl is complete, also fetch the domain summary
    let domainSummary = []
    if (crawlStatus.status === "completed") {
      const domainSummaryResult = await client.query(
        `
        SELECT target_domain, link_count, first_seen_at, last_seen_at
        FROM outgoing_domains
        WHERE domain_id = $1
        ORDER BY link_count DESC;
      `,
        [crawlStatus.id],
      )
      domainSummary = domainSummaryResult.rows
    }

    return NextResponse.json({ ...crawlStatus, domainSummary })
  } catch (error) {
    console.error("Crawl status API error:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch crawl status"
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
