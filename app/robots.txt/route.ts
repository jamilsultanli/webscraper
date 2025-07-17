export async function GET() {
  return new Response(
    `User-agent: *
Allow: /

Sitemap: https://seo.jamilsultanli.com/sitemap.xml`,
    {
      headers: {
        "Content-Type": "text/plain",
      },
    },
  )
}
