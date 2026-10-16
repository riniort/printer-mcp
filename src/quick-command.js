function tokenize(value) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(value)) !== null) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

function requireValue(tokens, index, flag) {
  const value = tokens[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

export function parseQuickCommand(command) {
  const tokens = tokenize(command.trim());
  const firstFlag = tokens.findIndex((token) => token.startsWith("--"));
  const pathTokens = firstFlag === -1 ? tokens : tokens.slice(0, firstFlag);
  const flagTokens = firstFlag === -1 ? [] : tokens.slice(firstFlag);
  const result = {
    path: pathTokens.join(" ").trim(),
    options: {},
    preview: false,
    force: false,
  };

  for (let index = 0; index < flagTokens.length; index += 1) {
    const flag = flagTokens[index].toLowerCase();
    switch (flag) {
      case "--copies": {
        const value = Number.parseInt(requireValue(flagTokens, index, flag), 10);
        if (!Number.isInteger(value) || value < 1 || value > 20) throw new Error("--copies must be between 1 and 20.");
        result.options.copies = value;
        index += 1;
        break;
      }
      case "--printer": result.options.printer = requireValue(flagTokens, index++, flag); break;
      case "--profile": result.options.profile = requireValue(flagTokens, index++, flag); break;
      case "--pages": result.options.pages = requireValue(flagTokens, index++, flag); break;
      case "--name": result.options.namePattern = requireValue(flagTokens, index++, flag); break;
      case "--exclude": result.options.excludePattern = requireValue(flagTokens, index++, flag); break;
      case "--newer-than": result.options.newerThan = requireValue(flagTokens, index++, flag); break;
      case "--orientation": {
        const value = requireValue(flagTokens, index++, flag).toLowerCase();
        if (!["portrait", "landscape"].includes(value)) throw new Error("--orientation must be portrait or landscape.");
        result.options.orientation = value;
        break;
      }
      case "--duplex": {
        const value = requireValue(flagTokens, index++, flag).toLowerCase();
        const duplexMap = {
          long: "duplex-long-edge", short: "duplex-short-edge", off: "simplex", simplex: "simplex",
          "long-edge": "duplex-long-edge", "short-edge": "duplex-short-edge",
        };
        if (!duplexMap[value]) throw new Error("--duplex must be long, short, or off.");
        result.options.duplex = duplexMap[value];
        break;
      }
      case "--bw": result.options.monochrome = true; break;
      case "--color": result.options.monochrome = false; break;
      case "--recursive": result.options.recursive = true; break;
      case "--pdf": result.options.extensions = ["pdf"]; break;
      case "--preview": result.preview = true; break;
      case "--force": result.force = true; break;
      default: throw new Error(`Unknown quick-print option: ${flag}`);
    }
  }

  if (!result.path) throw new Error("A file, folder, or @path-alias is required.");
  return result;
}
