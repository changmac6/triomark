import fs from 'node:fs/promises';
import { createEventId, buildRiskEvent } from './schema.js';
import { appendRiskEvent, ensureRiskStorageReady, getRiskEventsDir } from './storage.js';
import { appendRiskLabel, getRiskLabelsFile } from './label-store.js';
import { evaluateRisk } from './scoring-engine.js';
import { buildActionPolicy } from './action-policy.js';
import { buildEvent } from './demo-fixtures.js';

function isoOffsetMinutes(minutesAgo = 0) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function makeNormalizedRequest({
  providerId,
  conversationId,
  clientProfile,
  clientRaw,
  collectedAt,
  notes,
}) {
  const groupedComponents = clientRaw?.groupedComponents ?? {};
  return {
    schemaVersion: 'risk-eval-request.v1',
    provider: {
      providerId,
      workspaceId: 'demo_workspace',
      policyId: 'default',
    },
    conversation: {
      conversationId,
      channel: 'web_dm',
      threadId: null,
      isFirstMessage: true,
    },
    page: {
      path: `/dm/${providerId}`,
      title: '匿名私訊',
      referrerPath: '/providers',
    },
    context: {
      entryPoint: 'demo_seed',
      clientTs: collectedAt,
      uiVariant: 'demo',
      sdkVersion: 'seed-v1',
      notes,
    },
    client: {
      collector: 'triomark',
      version: '0.1.0-demo',
      collectedAt,
      client: {
        composite: `demo-${clientProfile}-composite`,
        stableComposite: `demo-${clientProfile}-stable`,
        unstableComposite: `demo-${clientProfile}-unstable`,
        compositeHash: `demo-${clientProfile}-composite-hash`,
        stableCompositeHash: `demo-${clientProfile}-stable-hash`,
        unstableCompositeHash: `demo-${clientProfile}-unstable-hash`,
        components: clientRaw?.client?.components ?? {},
      },
      groupedComponents,
      raw: clientRaw,
    },
    warnings: [],
  };
}

export function getDefaultDemoSeedScenarios() {
  const supportedProfiles = [
    'windows_chrome',
    'windows_edge',
    'macos_chrome',
    'macos_safari',
    'android_chrome',
    'android_edge',
    'iphone_chrome',
    'iphone_safari',
  ];

  const scenarios = [];
  let minuteCursor = 1;
  let seq = 1;

  for (const profile of supportedProfiles) {
    for (let variant = 1; variant <= 2; variant += 1) {
      scenarios.push({
        name: `${profile}-legit-${variant}`,
        providerId: variant === 1 ? 'provider_alpha' : 'provider_beta',
        clientProfile: profile,
        serverProfile: profile,
        label: 'legit',
        notes: '白名單正常示範資料',
        minutesAgo: minuteCursor,
        conversationId: `demo_conv_${seq++}`,
      });
      minuteCursor += 1;
    }
  }

  scenarios.push(
    {
      name: 'firefox-unsupported-1',
      providerId: 'provider_alpha',
      clientProfile: 'unsupported_firefox_windows',
      serverProfile: 'unsupported_firefox_windows',
      label: 'abuse',
      notes: '不支援瀏覽器示範資料',
      minutesAgo: minuteCursor++,
      conversationId: `demo_conv_${seq++}`,
    },
    {
      name: 'firefox-unsupported-2',
      providerId: 'provider_beta',
      clientProfile: 'unsupported_firefox_windows',
      serverProfile: 'unsupported_firefox_windows',
      label: 'abuse',
      notes: '不支援瀏覽器示範資料',
      minutesAgo: minuteCursor++,
      conversationId: `demo_conv_${seq++}`,
    },
    {
      name: 'iphone-safari-vs-chrome-mismatch',
      providerId: 'provider_alpha',
      clientProfile: 'iphone_safari',
      serverProfile: 'iphone_chrome',
      label: 'abuse',
      notes: '前後端換殼衝突示範資料',
      minutesAgo: minuteCursor++,
      conversationId: `demo_conv_${seq++}`,
    },
    {
      name: 'android-edge-vs-chrome-mismatch',
      providerId: 'provider_beta',
      clientProfile: 'android_edge',
      serverProfile: 'android_chrome',
      label: 'needs_review',
      notes: '前後端 profile 不一致示範資料',
      minutesAgo: minuteCursor++,
      conversationId: `demo_conv_${seq++}`,
    },
    {
      name: 'macos-safari-vs-chrome-mismatch',
      providerId: 'provider_alpha',
      clientProfile: 'macos_safari',
      serverProfile: 'macos_chrome',
      label: 'needs_review',
      notes: '桌機 profile 不一致示範資料',
      minutesAgo: minuteCursor++,
      conversationId: `demo_conv_${seq++}`,
    },
    {
      name: 'windows-edge-vs-chrome-mismatch',
      providerId: 'provider_beta',
      clientProfile: 'windows_edge',
      serverProfile: 'windows_chrome',
      label: 'needs_review',
      notes: '桌機 profile 不一致示範資料',
      minutesAgo: minuteCursor++,
      conversationId: `demo_conv_${seq++}`,
    },
  );

  return scenarios;
}

export async function seedDemoDataset({ reset = false, reviewer = 'demo_seed' } = {}) {
  const rootDir = getRiskEventsDir();
  const labelsFile = getRiskLabelsFile();

  if (reset) {
    await fs.rm(rootDir, { recursive: true, force: true });
    await fs.rm(labelsFile, { force: true });
  }

  await ensureRiskStorageReady();

  const scenarios = getDefaultDemoSeedScenarios();
  const created = [];

  for (const scenario of scenarios) {
    const synthetic = buildEvent({
      clientProfile: scenario.clientProfile,
      serverProfile: scenario.serverProfile,
      options: scenario.options ?? {},
    });

    const receivedAt = isoOffsetMinutes(scenario.minutesAgo ?? 0);
    const collectedAt = isoOffsetMinutes((scenario.minutesAgo ?? 0) + 1);
    const normalizedRequest = makeNormalizedRequest({
      providerId: scenario.providerId,
      conversationId: scenario.conversationId,
      clientProfile: scenario.clientProfile,
      clientRaw: synthetic.client.raw,
      collectedAt,
      notes: scenario.notes,
    });

    const evaluation = evaluateRisk({
      provider: normalizedRequest.provider,
      conversation: normalizedRequest.conversation,
      page: normalizedRequest.page,
      context: normalizedRequest.context,
      client: normalizedRequest.client,
      server: synthetic.server,
    });
    const action = buildActionPolicy(evaluation.level, { browserSupportLevel: evaluation.browserSupportLevel });
    const eventId = createEventId(new Date(receivedAt));

    const event = buildRiskEvent({
      normalizedRequest,
      serverSnapshot: {
        requestId: `demo-${scenario.name}`,
        timestamp: receivedAt,
        ...synthetic.server.raw,
      },
      evaluation,
      action,
      eventId,
      receivedAt,
    });

    const storage = await appendRiskEvent(event);

    let labelRecord = null;
    if (scenario.label) {
      const appended = appendRiskLabel({
        eventId,
        label: scenario.label,
        reviewer,
        notes: scenario.notes,
        sourceFile: storage.filePath,
        metadata: {
          seed: true,
          scenario: scenario.name,
          clientProfile: evaluation.clientProfile,
          serverProfile: evaluation.serverProfile,
          level: evaluation.level,
          totalRiskScore: evaluation.totalRiskScore,
          browserSupportLevel: evaluation.browserSupportLevel,
        },
      });
      labelRecord = appended.record;
    }

    created.push({
      scenario: scenario.name,
      eventId,
      providerId: scenario.providerId,
      conversationId: scenario.conversationId,
      clientProfile: evaluation.clientProfile,
      serverProfile: evaluation.serverProfile,
      browserSupportLevel: evaluation.browserSupportLevel,
      totalRiskScore: evaluation.totalRiskScore,
      level: evaluation.level,
      action: action.action,
      label: labelRecord?.label ?? null,
      filePath: storage.filePath,
    });
  }

  return {
    ok: true,
    rootDir,
    labelsFile,
    count: created.length,
    created,
  };
}
