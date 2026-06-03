-- Copyright 2026 Cairn Contributors
-- SPDX-License-Identifier: Apache-2.0

ALTER TABLE "messages" ADD COLUMN "is_edited" boolean NOT NULL DEFAULT false;
