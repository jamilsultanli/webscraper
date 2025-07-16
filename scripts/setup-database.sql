-- Create the main tables for our scraper platform

CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  domain_name VARCHAR(255) UNIQUE NOT NULL,
  crawl_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  total_pages_crawled INTEGER DEFAULT 0,
  total_external_links INTEGER DEFAULT 0,
  crawl_depth INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outgoing_links (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  target_domain VARCHAR(255) NOT NULL,
  anchor_text TEXT,
  rel_type VARCHAR(50),
  status_code INTEGER,
  is_redirect BOOLEAN DEFAULT FALSE,
  redirect_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add the missing 'is_nofollow' column if it doesn't exist
DO $$ BEGIN
    ALTER TABLE outgoing_links ADD COLUMN IF NOT EXISTS is_nofollow BOOLEAN DEFAULT FALSE;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS outgoing_domains (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  target_domain VARCHAR(255) NOT NULL,
  link_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain_id, target_domain)
);

CREATE TABLE IF NOT EXISTS crawl_queue (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  depth INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- New table for storing comprehensive crawler states
CREATE TABLE IF NOT EXISTS crawl_states (
  domain_name VARCHAR(255) PRIMARY KEY,
  state_data JSONB NOT NULL,
  last_saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_outgoing_links_domain_id ON outgoing_links(domain_id);
CREATE INDEX IF NOT EXISTS idx_outgoing_links_target_domain ON outgoing_links(target_domain);
CREATE INDEX IF NOT EXISTS idx_outgoing_domains_domain_id ON outgoing_domains(domain_id);
CREATE INDEX IF NOT EXISTS idx_crawl_queue_status ON crawl_queue(status);
