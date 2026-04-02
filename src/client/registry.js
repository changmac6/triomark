import { getUserAgentHighEntropyFingerprint } from "./components/user-agent-high-entropy.js";
import { getStorageEstimateFingerprint } from "./components/storage-estimate.js";
import { getMediaDevicesFingerprint } from "./components/media-devices.js";
import { getEnvironmentFingerprint } from "./components/environment.js";
import { getAutomationSignalsFingerprint } from "./components/automation-signals.js";
import { getWebgpuFingerprint } from "./components/webgpu.js";
import { getWebrtcExtendedFingerprint } from "./components/webrtc-extended.js";
export const phase2Registry = {
  userAgentHighEntropy: getUserAgentHighEntropyFingerprint,
  storageEstimate: getStorageEstimateFingerprint,
  mediaDevices: getMediaDevicesFingerprint,
  environment: getEnvironmentFingerprint,
  automationSignals: getAutomationSignalsFingerprint,
  webgpu: getWebgpuFingerprint,
  webrtcExtended: getWebrtcExtendedFingerprint
};
