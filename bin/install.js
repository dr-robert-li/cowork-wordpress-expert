#!/usr/bin/env node

/**
 * WPXpert Installer for Claude Code
 *
 * Copies commands and skills to ~/.claude/ so they're available
 * as slash commands in all Claude Code sessions.
 *
 * Usage:
 *   npx wpxpert           # Install
 *   npx wpxpert --uninstall  # Remove
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const VERSION = fs
  .readFileSync(path.join(__dirname, "..", "VERSION"), "utf8")
  .trim();
const NAMESPACE = "wpxpert";

// Resolve paths
const homeDir = os.homedir();
const claudeDir = path.join(homeDir, ".claude");
const commandsDir = path.join(claudeDir, "commands", NAMESPACE);
const agentsDir = path.join(claudeDir, "agents");
const sourceDir = path.resolve(__dirname, "..");

// ANSI colors
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// -------------------------------------------------------------------
// Uninstall
// -------------------------------------------------------------------

function uninstall() {
  console.log(`\n${bold("WPXpert")} — Uninstalling v${VERSION}\n`);

  let removed = 0;

  // Remove commands directory
  if (fs.existsSync(commandsDir)) {
    fs.rmSync(commandsDir, { recursive: true });
    console.log(`  ${green("removed")} ${commandsDir}`);
    removed++;
  }

  // Remove agent files
  if (fs.existsSync(agentsDir)) {
    const agentFiles = fs
      .readdirSync(agentsDir)
      .filter((f) => f.startsWith(`${NAMESPACE}-`));
    for (const file of agentFiles) {
      fs.unlinkSync(path.join(agentsDir, file));
      console.log(`  ${green("removed")} ${path.join(agentsDir, file)}`);
      removed++;
    }
  }

  // Remove config
  const configPath = path.join(claudeDir, `${NAMESPACE}-config.json`);
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
    console.log(`  ${green("removed")} ${configPath}`);
    removed++;
  }

  if (removed === 0) {
    console.log("  Nothing to remove — WPXpert is not installed.");
  } else {
    console.log(`\n  ${green("Done.")} Removed ${removed} items.`);
    console.log(`  Restart Claude Code for changes to take effect.\n`);
  }
}

// -------------------------------------------------------------------
// Install
// -------------------------------------------------------------------

function install() {
  console.log(`\n${bold("WPXpert")} — Installing v${VERSION}\n`);

  // Check Claude Code directory exists
  if (!fs.existsSync(claudeDir)) {
    console.log(
      `  ${red("Error:")} ~/.claude/ directory not found.\n`
    );
    console.log("  Make sure Claude Code is installed first.");
    console.log(
      "  See: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code\n"
    );
    process.exit(1);
  }

  // Create directories
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  let installed = 0;

  // Copy commands (COMMAND.md files → flat .md files in commands/wpxpert/)
  const commandsSourceDir = path.join(sourceDir, "commands");
  if (fs.existsSync(commandsSourceDir)) {
    const commandDirs = fs
      .readdirSync(commandsSourceDir)
      .filter((d) =>
        fs.statSync(path.join(commandsSourceDir, d)).isDirectory()
      );

    for (const cmdName of commandDirs) {
      const src = path.join(commandsSourceDir, cmdName, "COMMAND.md");
      if (fs.existsSync(src)) {
        const dest = path.join(commandsDir, `${cmdName}.md`);
        fs.copyFileSync(src, dest);
        console.log(
          `  ${green("command")} /wpxpert:${cmdName} ${dim("→ " + dest)}`
        );
        installed++;
      }
    }
  }

  // Copy skills (SKILL.md files → agent files in agents/wpxpert-{name}.md)
  const skillsSourceDir = path.join(sourceDir, "skills");
  if (fs.existsSync(skillsSourceDir)) {
    const skillDirs = fs
      .readdirSync(skillsSourceDir)
      .filter((d) =>
        fs.statSync(path.join(skillsSourceDir, d)).isDirectory()
      );

    for (const skillName of skillDirs) {
      const src = path.join(skillsSourceDir, skillName, "SKILL.md");
      if (fs.existsSync(src)) {
        const dest = path.join(agentsDir, `${NAMESPACE}-${skillName}.md`);
        fs.copyFileSync(src, dest);
        console.log(
          `  ${green("skill")}   ${skillName} ${dim("→ " + dest)}`
        );
        installed++;
      }
    }
  }

  // Copy config.json
  const configSrc = path.join(sourceDir, "config.json");
  if (fs.existsSync(configSrc)) {
    const configDest = path.join(claudeDir, `${NAMESPACE}-config.json`);
    fs.copyFileSync(configSrc, configDest);
    console.log(`  ${green("config")}  ${dim(configDest)}`);
    installed++;
  }

  // Copy CLAUDE.md content (append WPXpert section to ~/.claude/CLAUDE.md)
  const claudeMdSrc = path.join(sourceDir, "CLAUDE.md");
  if (fs.existsSync(claudeMdSrc)) {
    const claudeMdDest = path.join(claudeDir, "CLAUDE.md");
    const wpxpertContent = fs.readFileSync(claudeMdSrc, "utf8");
    const marker = "<!-- WPXPERT-START -->";
    const endMarker = "<!-- WPXPERT-END -->";
    const wrappedContent = `\n${marker}\n${wpxpertContent}\n${endMarker}\n`;

    if (fs.existsSync(claudeMdDest)) {
      let existing = fs.readFileSync(claudeMdDest, "utf8");
      // Remove previous WPXpert section if exists
      const startIdx = existing.indexOf(marker);
      const endIdx = existing.indexOf(endMarker);
      if (startIdx !== -1 && endIdx !== -1) {
        existing =
          existing.substring(0, startIdx) +
          existing.substring(endIdx + endMarker.length);
      }
      fs.writeFileSync(claudeMdDest, existing.trimEnd() + wrappedContent);
    } else {
      fs.writeFileSync(claudeMdDest, wrappedContent);
    }
    console.log(`  ${green("context")} CLAUDE.md ${dim("→ " + claudeMdDest)}`);
    installed++;
  }

  // Summary
  console.log(`\n  ${green("Done.")} Installed ${installed} files.\n`);
  console.log(`  ${bold("Available commands:")}`);
  console.log(`    /wpxpert:connect     Connect to a WordPress site`);
  console.log(`    /wpxpert:investigate  Full diagnostic investigation`);
  console.log(`    /wpxpert:diagnose    Quick diagnostic scan`);
  console.log(`    /wpxpert:status      View connected sites\n`);
  console.log(`  Restart Claude Code for changes to take effect.\n`);
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--uninstall") || args.includes("-u")) {
  uninstall();
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`
${bold("WPXpert")} v${VERSION} — WordPress diagnostics for Claude Code

Usage:
  npx wpxpert              Install to ~/.claude/
  npx wpxpert --uninstall  Remove from ~/.claude/
  npx wpxpert --help       Show this help
`);
} else {
  install();
}
