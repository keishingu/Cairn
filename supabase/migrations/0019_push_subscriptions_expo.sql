ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_user_id_endpoint_unique";
ALTER TABLE "push_subscriptions" ALTER COLUMN "endpoint" DROP NOT NULL;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "uniq_push_web"  UNIQUE("user_id", "endpoint");
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "uniq_push_expo" UNIQUE("user_id", "expo_token");
