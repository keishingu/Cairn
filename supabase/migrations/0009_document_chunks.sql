-- RAG 用ベクトル検索のため pgvector を有効化し、document_chunks テーブルを追加する

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "document_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL DEFAULT 0,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_document_chunks_workspace" ON "document_chunks" ("workspace_id");
CREATE INDEX "idx_document_chunks_source" ON "document_chunks" ("source_type", "source_id");
-- HNSW はデータが少ない段階でも機能するため IVFFlat より適している
CREATE INDEX "idx_document_chunks_embedding" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
