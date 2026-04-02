export async function getWebrtcExtendedFingerprint() {
  if (typeof window === "undefined") return { supported: false, reason: "window-unavailable" };
  const RTCPeerConnectionCtor = window.RTCPeerConnection ?? window.webkitRTCPeerConnection ?? window.mozRTCPeerConnection;
  if (!RTCPeerConnectionCtor) return { supported: false, reason: "webrtc-unavailable" };
  const connection = new RTCPeerConnectionCtor({ iceServers: [], iceCandidatePoolSize: 1 });
  connection.createDataChannel("triomark-extended");
  const candidateTypes = [];
  let localDescription = null;
  const waitForCandidates = new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(), 2500);
    connection.addEventListener("icecandidate", (event) => {
      const candidate = event.candidate?.candidate;
      if (!candidate) return;
      const match = candidate.match(/ typ ([a-zA-Z0-9]+)/);
      if (match?.[1]) candidateTypes.push(match[1]);
    });
    connection.addEventListener("icegatheringstatechange", () => {
      if (connection.iceGatheringState === "complete") {
        clearTimeout(timeoutId);
        resolve();
      }
    });
  });
  try {
    const offer = await connection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    localDescription = offer;
    await connection.setLocalDescription(offer);
    await waitForCandidates;
    const counts = Object.create(null);
    for (const type of candidateTypes) counts[type] = (counts[type] || 0) + 1;
    return {
      supported: true,
      candidateTypes: Object.keys(counts).sort(),
      candidateTypeCount: Object.keys(counts).length,
      hostCandidateCount: counts.host ?? 0,
      srflxCandidateCount: counts.srflx ?? 0,
      relayCandidateCount: counts.relay ?? 0,
      sdpLength: localDescription?.sdp?.length ?? 0
    };
  } catch (error) {
    return { supported: true, candidateTypes: [], candidateTypeCount: 0, hostCandidateCount: 0, srflxCandidateCount: 0, relayCandidateCount: 0, sdpLength: localDescription?.sdp?.length ?? 0, reason: error instanceof Error ? error.message : "webrtc-extended-error" };
  } finally {
    connection.close();
  }
}
