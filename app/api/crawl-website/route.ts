import { type NextRequest, NextResponse } from "next/server"
import { ComprehensiveCrawler } from "@/lib/comprehensive-crawler"
import { getDbClient } from "@/lib/db"

export const maxDuration = 60 // 60 seconds (maximum allowed)

export async function POST(request: NextRequest) {
  try {
    const {
      url,
      depth = 3,
      maxPages = 5000,
      concurrency = 5,
      includeSubdomains = true,
      followSitemaps = true,
      resume = false,
    } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return NextResponse.json({ error: "Only HTTP and HTTPS URLs are supported" }, { status: 400 })
    }

    const sourceDomain = targetUrl.hostname.toLowerCase()
    const client = await getDbClient()
    let domainId: number

    // If resuming, find the latest crawl. Otherwise, create a new one.
    if (resume) {
      const existingDomainResult = await client.query(
        `SELECT id FROM domains WHERE domain_name = $1 ORDER BY id DESC LIMIT 1;`,
        [sourceDomain],
      )
      if (existingDomainResult.rows.length > 0) {
        domainId = existingDomainResult.rows[0].id
        await client.query(`UPDATE domains SET status = 'processing', updated_at = NOW() WHERE id = $1;`, [domainId])
        console.log(`Resuming crawl for domain ${sourceDomain} with ID: ${domainId}`)
      } else {
        // No crawl to resume, so create a new one
        const newDomainResult = await client.query(
          `INSERT INTO domains (domain_name, status, crawl_depth) VALUES ($1, 'processing', $2) RETURNING id;`,
          [sourceDomain, depth],
        )
        domainId = newDomainResult.rows[0].id
        console.log(`No crawl to resume. Starting new crawl for domain ${sourceDomain} with ID: ${domainId}`)
      }
    } else {
      // Not resuming, so always create a new crawl record
      const newDomainResult = await client.query(
        `INSERT INTO domains (domain_name, status, crawl_depth) VALUES ($1, 'processing', $2) RETURNING id;`,
        [sourceDomain, depth],
      )
      domainId = newDomainResult.rows[0].id
      console.log(`Starting new crawl for domain ${sourceDomain} with ID: ${domainId}`)
    }

    const crawler = new ComprehensiveCrawler(
      {
        maxPages: Math.min(maxPages, 10000),
        maxDepth: depth,
        concurrency: concurrency,
        includeSubdomains,
        followSitemaps,
      },
      domainId,
    )

    // Fire-and-forget the crawl process.
    // The serverless function will continue running this in the background
    // after the initial response has been sent.
    // NOTE: This relies on your hosting environment (e.g., Google Cloud)
    // allowing background execution after a response is sent.
    ;(async () => {
      await crawler.crawlWebsite(url, resume)
    })().catch((e) => {
      console.error(`Unhandled error in background crawl for domain ID ${domainId}:`, e)
    })

    // Immediately respond to the client to prevent timeout
    return NextResponse.json({
      success: true,
      message: "Crawl initiated successfully. Check status endpoint for progress.",
      domain_name: sourceDomain,
      crawl_id: domainId,
    })
  } catch (error) {
    console.error("Crawl initiation API error:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to initiate crawl"
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
