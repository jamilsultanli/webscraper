import { type NextRequest, NextResponse } from "next/server"
import { ComprehensiveCrawler } from "@/lib/comprehensive-crawler"
import { getDbClient } from "@/lib/db"

export const maxDuration = 60 // 60 seconds (maximum allowed)

export async function POST(request: NextRequest) {
  try {
    console.log("Crawl API: Starting request processing")

    const body = await request.json()
    console.log("Crawl API: Request body parsed", { url: body.url })

    const {
      url,
      depth = 3,
      maxPages = 5000,
      concurrency = 5,
      includeSubdomains = true,
      followSitemaps = true,
      resume = false,
    } = body

    if (!url) {
      console.log("Crawl API: URL is required")
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(url)
    } catch (error) {
      console.log("Crawl API: Invalid URL format", { url, error })
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      console.log("Crawl API: Unsupported protocol", { protocol: targetUrl.protocol })
      return NextResponse.json({ error: "Only HTTP and HTTPS URLs are supported" }, { status: 400 })
    }

    const sourceDomain = targetUrl.hostname.toLowerCase()
    console.log("Crawl API: Processing domain", { sourceDomain })

    console.log("Crawl API: Attempting to get DB client...")
    const client = await getDbClient() // This is the first point of potential failure
    console.log("Crawl API: DB client obtained.")

    let domainId: number

    try {
      console.log(`Crawl API: Inserting new domain record for ${sourceDomain}.`)
      const newDomainResult = await client.query(
        `INSERT INTO domains (domain_name, status, crawl_depth) VALUES ($1, 'processing', $2) RETURNING id;`,
        [sourceDomain, depth],
      )
      domainId = newDomainResult.rows[0].id
      console.log(`Crawl API: New domain record inserted with ID: ${domainId}`)
    } catch (dbQueryError) {
      console.error("Crawl API: Database query error during domain record handling:", dbQueryError)
      // Re-throw to be caught by the main catch block and returned to client
      throw new Error(
        `Database operation failed: ${dbQueryError instanceof Error ? dbQueryError.message : String(dbQueryError)}`,
      )
    }

    console.log("Crawl API: Creating crawler instance")
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

    console.log("Crawl API: Starting background crawl process")
    // Fire-and-forget the crawl process.
    setImmediate(async () => {
      try {
        console.log(`Background Crawl: Starting crawlWebsite for domain ID ${domainId}`)
        await crawler.crawlWebsite(url, resume)
        console.log(`Background Crawl: crawlWebsite completed for domain ID ${domainId}`)
      } catch (e) {
        console.error(`Unhandled error in background crawl for domain ID ${domainId}:`, e)
        // Update status to failed
        try {
          const client = await getDbClient()
          await client.query(`UPDATE domains SET status = 'failed', updated_at = NOW() WHERE id = $1;`, [domainId])
          console.log(`Background Crawl: Updated domain ID ${domainId} status to 'failed' due to unhandled error.`)
        } catch (dbError) {
          console.error(`Failed to update status to failed for domain ID ${domainId}:`, dbError)
        }
      }
    })

    console.log("Crawl API: Sending success response")
    // Immediately respond to the client to prevent timeout
    return NextResponse.json({
      success: true,
      message: "Crawl initiated successfully. Check status endpoint for progress.",
      domain_name: sourceDomain,
      crawl_id: domainId,
    })
  } catch (error) {
    console.error("Crawl initiation API error (caught in route handler):", error)
    // Log the full error object for better debugging in Vercel logs
    console.error("Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)))

    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during crawl initiation."
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
