/**
 * Daily credit usage for the signed-in account (UTC day).
 * GET /api/v1/credits -> { files, bytes, limit: { files, bytes }, resetsAt }
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readDailyUsage } from "../lib/daily-credits.js";
import { requireAuth } from "../plugins/auth.js";

export async function creditsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/credits",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return reply;
      return reply.send(await readDailyUsage(user.id));
    },
  );
}
