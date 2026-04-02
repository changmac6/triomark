export async function getMediaDevicesFingerprint() {
  if (typeof navigator === "undefined") return { supported: false, reason: "navigator-unavailable" };
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== "function") return { supported: false, reason: "enumerate-devices-unavailable" };
  try {
    const devices = await mediaDevices.enumerateDevices();
    const counts = { audioinput: 0, audiooutput: 0, videoinput: 0 };
    let hasLabels = false;
    let hasDeviceIds = false;
    let hasGroupIds = false;
    for (const device of devices) {
      if (device.kind in counts) counts[device.kind] += 1;
      if (device.label) hasLabels = true;
      if (device.deviceId) hasDeviceIds = true;
      if (device.groupId) hasGroupIds = true;
    }
    return {
      supported: true,
      audioinputCount: counts.audioinput,
      audiooutputCount: counts.audiooutput,
      videoinputCount: counts.videoinput,
      deviceCount: devices.length,
      hasLabels,
      hasDeviceIds,
      hasGroupIds
    };
  } catch (error) {
    return { supported: true, audioinputCount: 0, audiooutputCount: 0, videoinputCount: 0, deviceCount: 0, hasLabels: false, hasDeviceIds: false, hasGroupIds: false, reason: error instanceof Error ? error.message : "media-devices-error" };
  }
}
