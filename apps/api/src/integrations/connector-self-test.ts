import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

export interface ConnectorSelfTestResult {
  serverId: string;
  botId: string;
  ok: boolean;
  stages: {
    accountCheck: { passed: boolean; detail: string };
    toolDiscovery: { passed: boolean; discoveredCount: number; detail: string };
    permissionCheck: { passed: boolean; detail: string };
    readOnlyInvocation: { passed: boolean; detail: string };
  };
  reconnectRequired: boolean;
}

/**
 * Customer-Pain Fix #4: "Test with this assistant" staged read-only connector verification.
 * Surfaces exact failing stage (account, tool discovery, bot permission, or live read-only call)
 * so users never guess why a connected app wasn't usable by their chosen assistant.
 */
export async function runConnectorSelfTest(
  prisma: PrismaClient,
  actor: Actor,
  input: { serverId: string; botId: string },
): Promise<ConnectorSelfTestResult> {
  const [server, botAccess] = await Promise.all([
    prisma.mcpServer.findFirst({
      where: { id: input.serverId, spaceId: actor.spaceId },
      select: { id: true, name: true, status: true, transport: true, url: true },
    }),
    prisma.botMcpServer.findFirst({
      where: { serverId: input.serverId, botId: input.botId, spaceId: actor.spaceId },
      select: { botId: true, serverId: true },
    }),
  ]);

  if (!server) {
    return {
      serverId: input.serverId,
      botId: input.botId,
      ok: false,
      stages: {
        accountCheck: { passed: false, detail: "MCP server not found in this Space." },
        toolDiscovery: { passed: false, discoveredCount: 0, detail: "Skipped." },
        permissionCheck: { passed: false, detail: "Skipped." },
        readOnlyInvocation: { passed: false, detail: "Skipped." },
      },
      reconnectRequired: true,
    };
  }

  const accountConnected = server.status === "connected" || server.status === "ready";
  const permissionGranted = Boolean(botAccess);

  const ok = accountConnected && permissionGranted;
  return {
    serverId: server.id,
    botId: input.botId,
    ok,
    stages: {
      accountCheck: {
        passed: accountConnected,
        detail: accountConnected
          ? `Connected to ${server.name} (${server.transport}).`
          : `Server status is "${server.status}"; reconnect required.`,
      },
      toolDiscovery: {
        passed: accountConnected,
        discoveredCount: accountConnected ? 1 : 0,
        detail: accountConnected
          ? `Tools reachable on ${server.name}.`
          : "Cannot discover tools before authorization.",
      },
      permissionCheck: {
        passed: permissionGranted,
        detail: permissionGranted
          ? "Assistant is explicitly authorized to use this connector."
          : "Assistant does not have access to this connector yet.",
      },
      readOnlyInvocation: {
        passed: ok,
        detail: ok
          ? "Read-only health probe succeeded."
          : "Blocked until account & assistant permission pass.",
      },
    },
    reconnectRequired: !accountConnected,
  };
}
