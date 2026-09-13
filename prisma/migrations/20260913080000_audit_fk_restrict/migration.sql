-- audit_logs FKs: SET NULL -> RESTRICT.
--
-- SET NULL is an UPDATE, and trg_audit_logs_no_update blocks UPDATE on this table. The
-- FK action could therefore never fire: deleting a user who appears in the audit log
-- raised `42501 audit_logs is append-only` from inside a foreign-key action, several
-- frames from anything the caller wrote.
--
-- RESTRICT states the true constraint plainly — a user who appears in the audit log
-- cannot be hard-deleted, which is what "append-only" means. Staff are soft-deleted via
-- users.deleted_at in every real flow, so nothing legitimate is prevented.
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actor_user_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_impersonator_user_id_fkey";

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_impersonator_user_id_fkey"
  FOREIGN KEY ("impersonator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
