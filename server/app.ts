import express from "express";
import { publicConfig } from "../src/engine/config";
import { GameService } from "./service";
import { buildShowcase, buildFeatureGallery } from "./showcase";
export function createApp(service: GameService) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "4kb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        "http://127.0.0.1:5180",
        "http://localhost:5180",
        "http://127.0.0.1:8787",
        "http://localhost:8787",
        process.env.PUBLIC_ORIGIN,
      ].includes(origin)
    ) {
      res.status(403).json({ error: "Origin rejected" });
      return;
    }
    next();
  });
  app.get("/api/config", (_req, res) => res.json(publicConfig()));
  let showcase: ReturnType<typeof buildShowcase> | undefined;
  let gallery: ReturnType<typeof buildFeatureGallery> | undefined;
  app.get("/api/feature-gallery", (_req, res) =>
    res.json((gallery ||= buildFeatureGallery())),
  );
  app.get("/api/showcase", (_req, res) =>
    res.json((showcase ||= buildShowcase())),
  );
  app.use("/api", (req, res, next) => {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("dd-session="))
      ?.slice(11);
    if (cookie && Object.hasOwn(service.sessions, cookie))
      res.locals.sessionId = cookie;
    else {
      const id = service.create();
      res.locals.sessionId = id;
      res.cookie("dd-session", id, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.COOKIE_SECURE === "1",
        maxAge: 7 * 86400000,
      });
    }
    next();
  });
  app.get("/api/session", (_req, res) => {
    const s = service.get(res.locals.sessionId);
    res.json({ state: s.state, lastResult: s.rounds.at(-1)?.result || null });
  });
  app.get("/api/history", (_req, res) =>
    res.json(
      service
        .get(res.locals.sessionId)
        .rounds.slice(-50)
        .map((r) => r.result),
    ),
  );
  app.post("/api/spin", (req, res) => {
    try {
      res.json(service.spin(res.locals.sessionId, req.body));
    } catch (e) {
      const message = (e as Error).message;
      res
        .status(message.includes("conflict") ? 409 : 400)
        .json({ error: message });
    }
  });
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(err.message);
      res.status(500).json({
        error:
          "The frontier is temporarily unavailable. Reconnect to recover your round.",
      });
    },
  );
  return app;
}
