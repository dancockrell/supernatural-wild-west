import {
  mkdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app";
import { GameService, type Session } from "./service";
mkdirSync("data", { recursive: true });
const file = resolve("data/sessions.json");
const sessions = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, Session>)
  : {};
const service = new GameService(sessions, (next) => {
  const temp = file + ".tmp";
  writeFileSync(temp, JSON.stringify(next));
  const fd = openSync(temp, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, file);
});
const app = createApp(service);
app.use(express.static(resolve("dist")));
app.listen(8787, "127.0.0.1", () =>
  console.log("Devil’s Dust RGS demo: http://127.0.0.1:8787"),
);
