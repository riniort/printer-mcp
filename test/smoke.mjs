import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { parseQuickCommand } from "../src/quick-command.js";

const root = path.resolve(import.meta.dirname, "..");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "src", "index.js")],
  cwd: root,
});
const client = new Client({ name: "printer-mcp-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const expected = [
    "list_printers", "inspect_print_job", "estimate_print_job", "print_paths", "quick_print",
    "get_print_queue", "cancel_print_jobs", "stop_all_printing", "get_print_history", "retry_print_job",
    "get_print_settings", "set_printer_alias", "set_path_alias", "set_print_profile",
    "remove_print_setting", "set_print_safety", "printer_health_check",
  ];
  for (const name of expected) {
    if (!tools.tools.some((tool) => tool.name === name)) throw new Error(`Missing tool: ${name}`);
  }
  const prompts = await client.listPrompts();
  for (const name of ["print", "queue", "cancel", "retry", "print-check"]) {
    if (!prompts.prompts.some((prompt) => prompt.name === name)) throw new Error(`Missing prompt: ${name}`);
  }
  const quickPrint = await client.getPrompt({
    name: "print",
    arguments: { path: "C:\\example\\invoice.pdf" },
  });
  if (!quickPrint.messages?.length) throw new Error("Quick print prompt returned no messages");
  const printHelp = await client.getPrompt({
    name: "print",
    arguments: { path: "ใช้งายยังไง" },
  });
  const helpText = printHelp.messages?.[0]?.content?.text ?? "";
  if (!helpText.includes("Do not call any printing tool")) throw new Error("Quick print help was not recognized");
  if (helpText.includes("confirmed: true")) throw new Error("Quick print help could trigger physical printing");
  const printStop = await client.getPrompt({ name: "print", arguments: { path: "stop" } });
  const stopText = printStop.messages?.[0]?.content?.text ?? "";
  if (!stopText.includes("stop_all_printing") || !stopText.includes("confirmed=true")) {
    throw new Error("/print stop was not routed to stop_all_printing");
  }
  const parsed = parseQuickCommand('D:\\Invoices\\batch 1 --copies 2 --bw --duplex long --name "TT*.pdf" --preview');
  if (parsed.path !== "D:\\Invoices\\batch 1" || parsed.options.copies !== 2 || !parsed.options.monochrome || !parsed.preview) {
    throw new Error("Quick print flags were not parsed correctly");
  }
  const printers = await client.callTool({ name: "list_printers", arguments: {} });
  if (printers.isError) throw new Error(printers.content?.[0]?.text ?? "list_printers failed");
  const inspect = await client.callTool({
    name: "inspect_print_job",
    arguments: {
      paths: [process.env.PRINTER_MCP_TEST_PATH || root],
      extensions: ["pdf"],
      recursive: true,
    },
  });
  if (inspect.isError) throw new Error(inspect.content?.[0]?.text ?? "inspect_print_job failed");
  const filtered = await client.callTool({
    name: "inspect_print_job",
    arguments: {
      paths: [path.join(root, "test", "fixtures")],
      extensions: ["txt"],
      name_pattern: "TTSTHAC*",
      exclude_pattern: "Expense*",
    },
  });
  if (filtered.isError || filtered.structuredContent?.files?.length !== 1) {
    throw new Error(filtered.content?.[0]?.text ?? "filename filters failed");
  }
  const queue = await client.callTool({ name: "get_print_queue", arguments: {} });
  if (queue.isError) throw new Error(queue.content?.[0]?.text ?? "get_print_queue failed");
  const settings = await client.callTool({ name: "get_print_settings", arguments: {} });
  if (settings.isError) throw new Error(settings.content?.[0]?.text ?? "get_print_settings failed");
  const estimate = await client.callTool({
    name: "estimate_print_job",
    arguments: { paths: [process.env.PRINTER_MCP_TEST_PATH || root], extensions: ["pdf"], recursive: true },
  });
  if (estimate.isError) throw new Error(estimate.content?.[0]?.text ?? "estimate_print_job failed");
  const health = await client.callTool({ name: "printer_health_check", arguments: {} });
  if (health.isError) throw new Error(health.content?.[0]?.text ?? "printer_health_check failed");
  const quickPreview = await client.callTool({
    name: "quick_print",
    arguments: { command: `${process.env.PRINTER_MCP_TEST_PATH || root} --pdf --preview`, confirmed: true },
  });
  if (quickPreview.isError || !quickPreview.content?.[0]?.text?.includes("Nothing was printed")) {
    throw new Error(quickPreview.content?.[0]?.text ?? "quick_print preview failed");
  }
  console.log(JSON.stringify({
    ok: true,
    tools: tools.tools.map((tool) => tool.name),
    prompts: prompts.prompts.map((prompt) => prompt.name),
    printers: printers.structuredContent,
    inspect: inspect.structuredContent,
    queue: queue.structuredContent,
    settings: settings.structuredContent,
    estimate: estimate.structuredContent,
    health: health.structuredContent,
    quickPreview: quickPreview.structuredContent,
  }, null, 2));
} finally {
  await client.close();
}
