import { Client } from "pg"

let client: Client | null = null

/**
 * Returns a singleton PostgreSQL client instance.
 * Connects to the database if not already connected.
 * Throws an error if DATABASE_URL is not set.
 */
export async function getDbClient(): Promise<Client> {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set. Please provide your PostgreSQL connection string.")
    }
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      // Add SSL configuration if your database requires it (e.g., Vercel Postgres, Neon)
      // For local development, you might not need this or might set rejectUnauthorized to false.
      // For production, it's recommended to set rejectUnauthorized to true and provide CA certs.
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
    })
    await client.connect()
    console.log("Database client connected successfully.")
  }
  return client
}

/**
 * Closes the PostgreSQL client connection if it exists.
 * Useful for graceful shutdowns or when the client is no longer needed.
 */
export async function closeDbClient(): Promise<void> {
  if (client) {
    await client.end()
    client = null
    console.log("Database client disconnected.")
  }
}
