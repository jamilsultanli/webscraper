import { Client } from "pg"

let client: Client | null = null

/**
 * Returns a singleton PostgreSQL client instance.
 * Connects to the database if not already connected.
 *
 * IMPORTANT: Hardcoding DATABASE_URL is generally NOT recommended for production
 * environments due to security risks. Environment variables are preferred.
 * This is done here as per user request due to Vercel dashboard limitations.
 */
export async function getDbClient(): Promise<Client> {
  if (!client) {
    // Hardcoded DATABASE_URL as per user request.
    // In a real application, this should be process.env.DATABASE_URL
    const connectionString = "postgresql://jamil:jamil@34.56.210.79:5432/jamil"

    if (!connectionString) {
      console.error("DATABASE_URL is not set in the code.")
      throw new Error("DATABASE_URL is not set. Please provide your PostgreSQL connection string.")
    }
    try {
      client = new Client({
        connectionString: connectionString,
        // Explicitly setting rejectUnauthorized to false to bypass SSL certificate validation.
        // This is often needed for self-signed certificates or certain cloud database setups.
        // For production, consider proper SSL certificate handling.
        ssl: { rejectUnauthorized: false },
      })
      await client.connect()
      console.log("Database client connected successfully.")
    } catch (connectError) {
      console.error("Failed to connect to database:", connectError)
      client = null // Ensure client is null so next call tries to reconnect
      throw new Error(
        `Database connection failed: ${connectError instanceof Error ? connectError.message : String(connectError)}`,
      )
    }
  }
  return client
}

/**
 * Closes the PostgreSQL client connection if it exists.
 * Useful for graceful shutdowns or when the client is no longer needed.
 */
export async function closeDbClient(): Promise<void> {
  if (client) {
    try {
      await client.end()
      client = null
      console.log("Database client disconnected.")
    } catch (disconnectError) {
      console.error("Error disconnecting database client:", disconnectError)
    }
  }
}
