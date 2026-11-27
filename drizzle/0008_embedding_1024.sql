-- Titan Text Embeddings v2 returns 1024 dimensions. Vectors from the earlier model cannot be compared
-- with it, so they are cleared, and the reading pipeline embeds every chunk again under its new index version.
DROP INDEX IF EXISTS "knowledge_chunks_embedding_idx";--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding" SET DATA TYPE vector(1024) USING NULL;--> statement-breakpoint
UPDATE "knowledge_chunks" SET "embedding_model" = NULL;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
