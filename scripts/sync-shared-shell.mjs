import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const partialsDirectory = path.join(projectRoot, "partials");
const checkOnly = process.argv.includes("--check");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--check");
const standalonePages = new Set([
  "couch-dash.html",
  "dvd-video.html",
  "dvd.html",
]);

if (unknownArguments.length) {
  throw new Error(`Unknown argument${unknownArguments.length === 1 ? "" : "s"}: ${unknownArguments.join(", ")}`);
}

const [headerTemplate, footerTemplate, rootEntries] = await Promise.all([
  readFile(path.join(partialsDirectory, "site-header.html"), "utf8"),
  readFile(path.join(partialsDirectory, "site-footer.html"), "utf8"),
  readdir(projectRoot, { withFileTypes: true }),
]);

const pageNames = rootEntries
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".html") &&
      !standalonePages.has(entry.name),
  )
  .map((entry) => entry.name)
  .sort();

const marker = (block, edge) => `<!-- shared-site-${block}:${edge} -->`;

const escapeRegularExpression = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const indentFragment = (fragment, indentation, newline) =>
  fragment
    .trim()
    .split(/\r?\n/)
    .map((line) => `${indentation}${line}`)
    .join(newline);

const replaceSharedBlock = (source, block, renderedFragment, newline) => {
  const startMarker = marker(block, "start");
  const endMarker = marker(block, "end");
  const markedPattern = new RegExp(
    `^([\\t ]*)${escapeRegularExpression(startMarker)}[\\s\\S]*?^[\\t ]*${escapeRegularExpression(endMarker)}`,
    "m",
  );
  const tagPattern = new RegExp(`^([\\t ]*)<${block}>[\\s\\S]*?</${block}>`, "m");
  const match = source.match(markedPattern) ?? source.match(tagPattern);

  if (!match) {
    throw new Error(`Could not find the shared ${block} block.`);
  }

  const indentation = match[1];
  const replacement = [
    `${indentation}${startMarker}`,
    indentFragment(renderedFragment, indentation, newline),
    `${indentation}${endMarker}`,
  ].join(newline);

  return source.replace(match[0], replacement);
};

const renderHeader = (pageName) => {
  const isHomePage = pageName === "index.html";

  return headerTemplate
    .replaceAll("{{homeHref}}", isHomePage ? "#home" : "/")
    .replaceAll("{{homeLabel}}", isHomePage ? "Go to top" : "Changing Places home")
    .replaceAll("{{sectionPrefix}}", isHomePage ? "" : "/");
};

const renderFooter = (pageName) => {
  const currentPath = pageName === "index.html" ? "/" : `/${pageName.replace(/\.html$/, "")}`;
  const target = `href="${currentPath}"`;

  if (!footerTemplate.includes(target)) {
    return footerTemplate;
  }

  return footerTemplate.replace(target, `${target} aria-current="page"`);
};

const changedPages = [];

for (const pageName of pageNames) {
  const pagePath = path.join(projectRoot, pageName);
  const source = await readFile(pagePath, "utf8");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const withHeader = replaceSharedBlock(source, "header", renderHeader(pageName), newline);
  const synchronized = replaceSharedBlock(withHeader, "footer", renderFooter(pageName), newline);

  if (synchronized === source) {
    continue;
  }

  changedPages.push(pageName);

  if (!checkOnly) {
    await writeFile(pagePath, synchronized, "utf8");
  }
}

if (checkOnly && changedPages.length) {
  console.error(`Shared shell is out of sync: ${changedPages.join(", ")}`);
  process.exitCode = 1;
} else if (changedPages.length) {
  console.log(`Updated shared shell in ${changedPages.length} pages.`);
} else {
  console.log("Shared shell is in sync.");
}
