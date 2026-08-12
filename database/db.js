const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id BIGSERIAL PRIMARY KEY,
      reference VARCHAR(32) UNIQUE NOT NULL,
      shop VARCHAR(255),
      customer_id VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      company VARCHAR(255),
      email VARCHAR(320) NOT NULL,
      phone VARCHAR(100),
      country VARCHAR(100),
      profession VARCHAR(150),
      how_discovered VARCHAR(150),
      interested_in TEXT,
      project_details TEXT,
      status VARCHAR(40) NOT NULL DEFAULT 'NEW',
      assigned_to VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries(status);
    CREATE INDEX IF NOT EXISTS enquiries_email_idx ON enquiries(email);
    CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries(created_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      enquiry_id BIGINT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      direction VARCHAR(20) NOT NULL,
      from_email VARCHAR(320),
      to_email VARCHAR(320),
      subject TEXT,
      body TEXT NOT NULL,
      provider_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS messages_enquiry_idx ON messages(enquiry_id, created_at);

    CREATE TABLE IF NOT EXISTS internal_notes (
      id BIGSERIAL PRIMARY KEY,
      enquiry_id BIGINT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      author VARCHAR(255),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS internal_notes_enquiry_idx ON internal_notes(enquiry_id, created_at);
  `);
}

module.exports = { pool, initDatabase };
