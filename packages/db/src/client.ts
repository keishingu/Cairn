// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { nodePostgresPoolOptions } from './client-options'
import * as schema from './schema/index'

const connectionString = process.env['DATABASE_URL']!

const pool = new Pool({
  connectionString,
  ...nodePostgresPoolOptions,
})

export const db = drizzle(pool, { schema })
