// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

const connectionString = process.env['DATABASE_URL']!

const client = postgres(connectionString, { prepare: false })

export const db = drizzle(client, { schema })
