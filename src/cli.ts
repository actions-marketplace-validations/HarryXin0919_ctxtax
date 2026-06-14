#!/usr/bin/env node
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { loadConfig } from "./mcp.js";
import { DEFAULT_MODEL, PRICING } from "./count.js";
import { scan } from "./scan.js";
import { render } from "./report.js";
import {
  snapshotFromScan,
  saveSnapshot,
  loadSnapshot,
  diffSnapshots,
  renderMarkdown,
  writeGitHubSummary,
} from "./ci.js";
import type { ServerConfig } from "./types.js";

const MODELS = Object.keys(PRICING).join(", ");

interface ResolveOpts {
  config: string;
  server?: string;
  command?: string[];
}

async function resolveServers(o: ResolveOpts): Promise<ServerConfig[]> {
  if (o.command && o.command.length) {
    const [command, ...args] = o.command;
    return [{ name: command, transport: "stdio", command, args }];
  }
  if (!existsSync(o.config)) {
    console.error(
      `No MCP config found at "${o.config}".\n` +
        `Point at one with --config <path>, or run a server directly: ctxtax -- npx -y <server>`,
    );
    process.exit(1);
  }
  let servers = await loadConfig(o.config);
  if (o.server) servers = servers.filter((s) => s.name === o.server);
  if (!servers.length) {
    console.error(`No matching MCP servers in ${o.config}.`);
    process.exit(1);
  }
  return servers;
}

const program = new Command();
program
  .name("ctxtax")
  .description("Measure how many context tokens each MCP server/tool costs your Claude requests.")
  .version("0.1.0");

program
  .command("scan", { isDefault: true })
  .description("Show the context-token cost of your MCP servers (a bar chart)")
  .argument("[command...]", "run a one-off stdio server after --, e.g. ctxtax -- npx -y <server> <args>")
  .option("-c, --config <path>", "path to .mcp.json", ".mcp.json")
  .option("-s, --server <name>", "only scan this server from the config")
  .option("-m, --model <id>", `model to count against (${MODELS})`, DEFAULT_MODEL)
  .option("--json", "output raw JSON instead of a chart")
  .option("--no-color", "disable ANSI colors")
  .action(async (command: string[], o) => {
    const servers = await resolveServers({ config: o.config, server: o.server, command });
    const result = await scan(servers, o.model);
    if (o.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(render(result.results, { model: result.model, mode: result.mode, color: o.color }));
    }
  });

program
  .command("ci")
  .description("Enforce a context budget and emit a PR-comment diff (for CI)")
  .option("-c, --config <path>", "path to .mcp.json", ".mcp.json")
  .option("-s, --server <name>", "only scan this server from the config")
  .option("-m, --model <id>", `model to count against (${MODELS})`, DEFAULT_MODEL)
  .option("--max-tokens <n>", "fail (exit 1) if the total context tax exceeds N", (v) => parseInt(v, 10))
  .option("--baseline <file>", "snapshot to diff against (renders a budget diff)")
  .option("--from <file>", "read the current budget from a snapshot instead of scanning live")
  .option("--save [file]", "write the current budget to a snapshot file and exit")
  .option("--comment <file>", "write PR-comment markdown to this file")
  .option("--summary", "append the markdown to $GITHUB_STEP_SUMMARY")
  .action(async (o) => {
    let head;
    let estimate = false;
    if (o.from) {
      head = await loadSnapshot(o.from);
    } else {
      const servers = await resolveServers({ config: o.config, server: o.server });
      const result = await scan(servers, o.model);
      estimate = result.mode === "estimate";
      head = snapshotFromScan(result);
    }

    if (o.save !== undefined) {
      const path = o.save === true ? ".ctxtax.json" : o.save;
      await saveSnapshot(path, head);
      console.error(`Wrote budget snapshot to ${path} (${head.total} tokens).`);
      return;
    }

    const diff = o.baseline && existsSync(o.baseline) ? diffSnapshots(await loadSnapshot(o.baseline), head) : null;
    const markdown = renderMarkdown({ head, diff, maxTokens: o.maxTokens, estimate });

    console.log(markdown);
    if (o.comment) await writeFile(o.comment, markdown + "\n", "utf8");
    if (o.summary) await writeGitHubSummary(markdown);

    if (o.maxTokens !== undefined && head.total > o.maxTokens) {
      console.error(`\nctxtax: context tax ${head.total} exceeds budget ${o.maxTokens} — failing.`);
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
