const hdmiStatus = document.getElementById("hdmiStatus");
const hdmiMeta = document.getElementById("hdmiMeta");
const touchShell = document.querySelector(".touch-shell");
const chatView = document.getElementById("chatView");
const chatModeLabel = document.getElementById("chatModeLabel");
const chatStatusLine = document.getElementById("chatStatusLine");
const chatEmoji = document.getElementById("chatEmoji");
const chatText = document.getElementById("chatText");
const hdmiEmoji = document.getElementById("hdmiEmoji");
const hdmiText = document.getElementById("hdmiText");
const hdmiImage = document.getElementById("hdmiImage");
const hdmiImageEmpty = document.getElementById("hdmiImageEmpty");
const slideshowView = document.getElementById("slideshowView");
const mirrorView = document.getElementById("mirrorView");
const touchControls = document.getElementById("touchControls");
const slideshowImage = document.getElementById("slideshowImage");
const slideshowEmpty = document.getElementById("slideshowEmpty");
const slideshowCaption = document.getElementById("slideshowCaption");
const slideshowCounter = document.getElementById("slideshowCounter");
const slideshowModeLabel = document.getElementById("slideshowModeLabel");
const mirrorModeLabel = document.getElementById("mirrorModeLabel");
const prevSlideBtn = document.getElementById("prevSlideBtn");
const nextSlideBtn = document.getElementById("nextSlideBtn");
const refreshSlidesBtn = document.getElementById("refreshSlidesBtn");
const chatComposer = document.getElementById("chatComposer");
const chatComposerInput = document.getElementById("chatComposerInput");
const chatComposerSendBtn = document.getElementById("chatComposerSendBtn");
const chatComposerStartBtn = document.getElementById("chatComposerStartBtn");

let settings = null;
let statePollTimer = null;
let slideTimer = null;
let textScrollTimer = null;
let lastGeneratedRevision = "";
let lastRemoteImageUrl = "";
let generatedSlides = [];
let currentSlideIndex = 0;
let currentMode = "";
let lastActiveAt = 0;
let lastActivitySignature = "";
let lastCompanionState = null;
let lastPiAgentState = null;

setSlideControlsEnabled(false);

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(Number(value) || value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPollIntervalMs() {
  const value = Number(settings?.pollIntervalMs || 2000);
  return Math.min(10000, Math.max(500, value));
}

function getSlideIntervalMs() {
  const value = Number(settings?.slideshowIntervalSec || 8);
  return Math.min(30000, Math.max(3000, value * 1000));
}

function getChatReturnTimeoutMs() {
  const value = Number(settings?.chatReturnTimeoutSec || 20);
  return Math.min(300000, Math.max(5000, value * 1000));
}

function getTouchDisplayMode() {
  return settings?.touchDisplayMode === "mirror" ? "mirror" : "slideshow-chat";
}

function hasCompanionUrl() {
  return Boolean(String(settings?.companionBaseUrl || "").trim());
}

function getTouchViewportSize() {
  return {
    width: Math.max(120, Math.round(window.innerWidth || document.documentElement.clientWidth || 480)),
    height: Math.max(120, Math.round(window.innerHeight || document.documentElement.clientHeight || 320)),
  };
}

function buildTouchRenderUrl(baseUrl, revision = "") {
  if (!baseUrl) {
    return "";
  }
  const viewport = getTouchViewportSize();
  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set("frameWidth", String(viewport.width));
  url.searchParams.set("frameHeight", String(viewport.height));
  url.searchParams.set("frameVersion", `${viewport.width}x${viewport.height}${revision ? `-${revision}` : ""}`);
  return url.toString();
}

function setSlideControlsEnabled(enabled) {
  prevSlideBtn.disabled = !enabled;
  nextSlideBtn.disabled = !enabled;
}

function applyDisplayLayout() {
  const hybridMode = getTouchDisplayMode() !== "mirror";
  document.body.classList.toggle("touch-hybrid-mode", hybridMode);
  if (touchShell) {
    touchShell.dataset.touchView = currentMode || "mirror";
  }
}

function stopSlideTimer() {
  if (slideTimer) {
    window.clearTimeout(slideTimer);
    slideTimer = null;
  }
}

function stopTextScrollTimer() {
  if (textScrollTimer) {
    window.clearInterval(textScrollTimer);
    textScrollTimer = null;
  }
}

function startAutoScroll(element) {
  stopTextScrollTimer();
  if (!element) {
    return;
  }
  element.scrollTop = 0;
  window.requestAnimationFrame(() => {
    if (element.scrollHeight <= element.clientHeight + 8) {
      element.scrollTop = 0;
      return;
    }
    let direction = 1;
    textScrollTimer = window.setInterval(() => {
      const maxScrollTop = element.scrollHeight - element.clientHeight;
      if (maxScrollTop <= 0) {
        element.scrollTop = 0;
        return;
      }
      if (direction > 0 && element.scrollTop >= maxScrollTop) {
        direction = -1;
      } else if (direction < 0 && element.scrollTop <= 0) {
        direction = 1;
      }
      element.scrollTop = Math.max(0, Math.min(maxScrollTop, element.scrollTop + direction));
    }, 70);
  });
}

function setMode(mode) {
  if (mode === currentMode) {
    return;
  }
  currentMode = mode;
  slideshowView.hidden = mode !== "slideshow";
  chatView.hidden = mode !== "chat";
  mirrorView.hidden = mode !== "mirror";
  touchControls.hidden = mode !== "slideshow";
  applyDisplayLayout();
  setSlideControlsEnabled(mode === "slideshow" && generatedSlides.length > 1);
  if (mode !== "slideshow") {
    stopSlideTimer();
  }
}

function scheduleNextSlide() {
  stopSlideTimer();
  if (currentMode !== "slideshow" || generatedSlides.length <= 1) {
    return;
  }
  slideTimer = window.setTimeout(() => {
    showSlide(currentSlideIndex + 1);
  }, getSlideIntervalMs());
}

function showSlide(index) {
  if (!generatedSlides.length) {
    slideshowView.style.backgroundImage = "";
    slideshowImage.hidden = true;
    slideshowImage.removeAttribute("src");
    slideshowEmpty.hidden = false;
    slideshowCaption.textContent = "No AI slideshow images yet.";
    slideshowCounter.textContent = "0 / 0";
    setSlideControlsEnabled(false);
    stopSlideTimer();
    return;
  }

  currentSlideIndex = (index + generatedSlides.length) % generatedSlides.length;
  const slide = generatedSlides[currentSlideIndex];
  const imageUrl = slide.touchImageUrl
    ? buildTouchRenderUrl(slide.touchImageUrl, slide.updatedAt || Date.now())
    : (slide.fullscreenImageUrl || slide.companionImageUrl);
  const renderUrl = slide.touchImageUrl
    ? imageUrl
    : `${imageUrl}?ts=${slide.updatedAt || Date.now()}`;
  slideshowView.style.backgroundImage = slide.touchImageUrl ? "" : `url("${renderUrl}")`;
  slideshowImage.style.objectFit = slide.touchImageUrl ? "fill" : "contain";
  slideshowImage.src = renderUrl;
  slideshowImage.hidden = false;
  slideshowEmpty.hidden = true;
  slideshowCaption.textContent = formatTime(slide.updatedAt)
    ? `${slide.fileName} · ${formatTime(slide.updatedAt)}`
    : slide.fileName;
  slideshowCounter.textContent = `${currentSlideIndex + 1} / ${generatedSlides.length}`;
  setSlideControlsEnabled(currentMode === "slideshow" && generatedSlides.length > 1);
  scheduleNextSlide();
}

function shouldUseSlideshow(state) {
  if (!hasCompanionUrl()) {
    return false;
  }
  if (!state || settings?.slideshowEnabled === false || getTouchDisplayMode() === "mirror") {
    return false;
  }
  if (!generatedSlides.length) {
    return false;
  }
  if (!lastActiveAt) {
    return true;
  }
  return Date.now() - lastActiveAt >= getChatReturnTimeoutMs();
}

function isLiveActivityStatus(status) {
  const normalized = normalizeStatus(status);
  return [
    "wake_listening",
    "listening",
    "recognizing",
    "thinking",
    "answering",
    "external_answer",
    "camera_mode",
  ].includes(normalized);
}

function buildActivitySignature(state) {
  if (!state) {
    return "";
  }
  return [
    normalizeStatus(state.status),
    state.text || "",
    state.emoji || "",
    state.touch_image_proxy_url || "",
    state.remote_image_proxy_url || "",
    state.image_revision || "",
  ].join("|");
}

function shouldUseChat(state) {
  if ((!state && !hasCompanionUrl()) || getTouchDisplayMode() === "mirror") {
    return false;
  }
  return !shouldUseSlideshow(state);
}

function isPiAgentActive(piAgent) {
  if (!piAgent) {
    return false;
  }
  if (piAgent.running) {
    return true;
  }
  if (!piAgent.lastOutputAtMs) {
    return false;
  }
  return Date.now() - Number(piAgent.lastOutputAtMs) < getChatReturnTimeoutMs();
}

function buildPiAgentChatSnapshot(piAgent) {
  const projectName = piAgent?.currentProjectName || "PiAgent";
  const output = String(piAgent?.displayText || "").trim();
  return {
    label: piAgent?.running ? `PiAgent · ${projectName}` : `PiAgent Ready · ${projectName}`,
    emoji: "💻",
    status: piAgent?.running ? "agent active" : "agent ready",
    text: output || "PiAgent is available on this Pi. Start it from the browser UI to see live agent output here.",
  };
}

function buildCompanionChatSnapshot(state) {
  if (!state) {
    return {
      label: "Chat Text",
      emoji: "!",
      status: "Companion not connected",
      text: hasCompanionUrl()
        ? "Waiting for Whisplay state."
        : "No Whisplay URL saved. PiAgent can run standalone on this Pi.",
    };
  }
  return {
    label: `Chat Text · ${state.status || "connected"}`,
    emoji: state.emoji || "🙂",
    status: state.status || "Connected",
    text: state.text || "No Whisplay reply text yet.",
  };
}

function renderChat(snapshot) {
  if (!snapshot) {
    chatModeLabel.textContent = "Chat Text";
    chatEmoji.textContent = "!";
    chatStatusLine.textContent = "No active source";
    chatText.textContent = "Waiting for chat activity.";
    return;
  }
  chatModeLabel.textContent = snapshot.label || "Chat Text";
  chatEmoji.textContent = snapshot.emoji || "🙂";
  chatStatusLine.textContent = snapshot.status || "Connected";
  chatText.textContent = snapshot.text || "No text yet.";
  startAutoScroll(chatText);
}

function updateChatComposer(piAgent, showComposer) {
  if (!chatComposer) {
    return;
  }
  chatComposer.hidden = !showComposer;
  if (chatComposerStartBtn) {
    chatComposerStartBtn.disabled = Boolean(piAgent?.running);
  }
  if (chatComposerSendBtn) {
    chatComposerSendBtn.disabled = !Boolean(piAgent?.running);
  }
  if (chatComposerInput) {
    chatComposerInput.disabled = !Boolean(piAgent?.running);
    chatComposerInput.placeholder = piAgent?.running
      ? "Type to PiAgent from the Pi keyboard..."
      : "Start PiAgent to type here from the Pi keyboard...";
  }
}

function showChatFromLatestState() {
  const piAgentActive = isPiAgentActive(lastPiAgentState);
  const chatSnapshot =
    !hasCompanionUrl() || piAgentActive
      ? buildPiAgentChatSnapshot(lastPiAgentState)
      : buildCompanionChatSnapshot(lastCompanionState);
  setMode("chat");
  renderChat(chatSnapshot);
  updateChatComposer(lastPiAgentState, !hasCompanionUrl() || piAgentActive);
  updateHeader(lastCompanionState, lastPiAgentState, "", chatSnapshot);
}

function handleKeyboardChatWake(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  lastActiveAt = Date.now();
  showChatFromLatestState();
  if (!chatComposerInput || chatComposerInput.disabled) {
    if (event.key === "Escape") {
      event.preventDefault();
    }
    return;
  }
  chatComposerInput.focus();
  if (event.key.length === 1 && !event.repeat) {
    event.preventDefault();
    const start = chatComposerInput.selectionStart ?? chatComposerInput.value.length;
    const end = chatComposerInput.selectionEnd ?? chatComposerInput.value.length;
    chatComposerInput.setRangeText(event.key, start, end, "end");
  } else if (event.key === "Escape") {
    event.preventDefault();
  }
}

function renderMirror(state) {
  if (!state) {
    hdmiEmoji.textContent = "!";
    hdmiText.textContent = "Waiting for Whisplay state.";
    hdmiImage.hidden = true;
    hdmiImageEmpty.hidden = false;
    lastRemoteImageUrl = "";
    return;
  }

  hdmiEmoji.textContent = state.emoji || "🙂";
  hdmiText.textContent = state.text || "No Whisplay reply text yet.";
  startAutoScroll(hdmiText);

  const remoteImageUrl = state.touch_image_proxy_url
    ? buildTouchRenderUrl(state.touch_image_proxy_url, state.image_revision || "")
    : state.remote_image_proxy_url;
  if (remoteImageUrl) {
    if (remoteImageUrl !== lastRemoteImageUrl) {
      lastRemoteImageUrl = remoteImageUrl;
      hdmiImage.src = remoteImageUrl;
    }
    hdmiImage.hidden = false;
    hdmiImageEmpty.hidden = true;
  } else {
    lastRemoteImageUrl = "";
    hdmiImage.hidden = true;
    hdmiImageEmpty.hidden = false;
  }
}

function updateHeader(state, piAgent, errorMessage = "", chatSnapshot = null) {
  if (!state && !hasCompanionUrl()) {
    hdmiStatus.textContent = chatSnapshot?.label || "PiAgent Standalone";
    hdmiMeta.textContent =
      piAgent?.currentProjectName
        ? `${piAgent.currentProjectName} · local PiAgent display`
        : "No Whisplay URL saved. PiAgent-only display mode is active.";
    return;
  }
  if (!state) {
    hdmiStatus.textContent = errorMessage ? "Companion not connected" : "Waiting for Whisplay...";
    hdmiMeta.textContent = errorMessage || "Save the Whisplay URL in the local Pi3Groq browser UI.";
    return;
  }

  hdmiStatus.textContent = state.status || "Connected";
  const modeLabel = currentMode === "slideshow"
    ? "AI slideshow"
    : currentMode === "chat"
      ? "chat text"
      : "live mirror";
  const remoteBaseUrl = state.remoteBaseUrl || settings?.companionBaseUrl || "";
  const detailParts = [remoteBaseUrl, state.llm_model || "no model", modeLabel].filter(Boolean);
  if (chatSnapshot?.label?.startsWith("PiAgent")) {
    detailParts.push("PiAgent mirror");
  }
  hdmiMeta.textContent = detailParts.join(" · ");
}

async function loadSettings() {
  const response = await fetch("/api/settings", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Failed to load Pi3Groq settings.");
  }
  settings = payload.settings || {};
}

function applyRuntimeSettings(nextSettings) {
  if (!nextSettings) {
    return;
  }
  const previousPollInterval = getPollIntervalMs();
  settings = nextSettings;
  applyDisplayLayout();
  if (getPollIntervalMs() !== previousPollInterval) {
    restartStatePolling();
  }
}

async function loadGeneratedImages() {
  if (!lastGeneratedRevision) {
    return;
  }
  const response = await fetch("/api/companion/generated-images?limit=200", {
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Failed to load AI slideshow images.");
  }

  const previousFileName = generatedSlides[currentSlideIndex]?.fileName || "";
  generatedSlides = Array.isArray(payload.photos) ? payload.photos : [];

  const previousIndex = generatedSlides.findIndex((photo) => photo.fileName === previousFileName);
  currentSlideIndex = previousIndex >= 0 ? previousIndex : 0;
  slideshowModeLabel.textContent = `AI Slideshow · ${payload.totalCount || generatedSlides.length}`;
  showSlide(currentSlideIndex);
}

async function refreshHdmi() {
  try {
    const [companionResponse, piAgentResponse] = await Promise.all([
      fetch("/api/companion/state", { cache: "no-store" }),
      fetch("/api/pi-agent/status", { cache: "no-store" }),
    ]);
    const companionPayload = await companionResponse.json();
    const piAgentPayload = await piAgentResponse.json();

    applyRuntimeSettings(companionPayload.settings || settings);
    const companionState =
      companionResponse.ok && companionPayload.ok && companionPayload.companion
        ? companionPayload.companion
        : null;
    const piAgent =
      piAgentResponse.ok && piAgentPayload.ok ? piAgentPayload.piAgent || null : null;
    lastCompanionState = companionState;
    lastPiAgentState = piAgent;

    if (companionState) {
      const normalizedStatus = normalizeStatus(companionState.status);
      const nextActivitySignature = buildActivitySignature(companionState);
      if (isLiveActivityStatus(normalizedStatus) || nextActivitySignature !== lastActivitySignature) {
        lastActiveAt = Date.now();
      }
      lastActivitySignature = nextActivitySignature;

      const nextRevision = String(companionState.generated_images_revision || "");
      if ((nextRevision && nextRevision !== lastGeneratedRevision) || (!generatedSlides.length && nextRevision)) {
        const previousRevision = lastGeneratedRevision;
        lastGeneratedRevision = nextRevision;
        try {
          await loadGeneratedImages();
        } catch (error) {
          lastGeneratedRevision = previousRevision;
          throw error;
        }
      }
    }

    const piAgentActive = isPiAgentActive(piAgent);
    if (piAgentActive) {
      lastActiveAt = Date.now();
    }

    const previousMode = currentMode;
    let nextMode = "mirror";
    if (!hasCompanionUrl()) {
      nextMode = "chat";
    } else if (getTouchDisplayMode() === "mirror" && !piAgentActive) {
      nextMode = "mirror";
    } else if (piAgentActive || shouldUseChat(companionState)) {
      nextMode = "chat";
    } else if (shouldUseSlideshow(companionState)) {
      nextMode = "slideshow";
    } else {
      nextMode = "chat";
    }
    setMode(nextMode);

    const chatSnapshot =
      !hasCompanionUrl() || piAgentActive
        ? buildPiAgentChatSnapshot(piAgent)
        : buildCompanionChatSnapshot(companionState);
    mirrorModeLabel.textContent = `Mirror Mode · ${companionState?.status || "connected"}`;
    renderChat(chatSnapshot);
    renderMirror(companionState);
    updateChatComposer(piAgent, nextMode === "chat" && (!hasCompanionUrl() || piAgentActive));
    if (nextMode === "slideshow" && previousMode !== "slideshow") {
      showSlide(currentSlideIndex);
    }
    updateHeader(companionState, piAgent, companionPayload.error || "", chatSnapshot);
  } catch (error) {
    const fallbackMode = hasCompanionUrl() && getTouchDisplayMode() === "mirror" ? "mirror" : "chat";
    setMode(fallbackMode);
    renderChat(buildPiAgentChatSnapshot(null));
    renderMirror(null);
    updateChatComposer(null, fallbackMode === "chat");
    updateHeader(null, null, error instanceof Error ? error.message : "Unknown state request error.");
  }
}

function restartStatePolling() {
  if (statePollTimer) {
    window.clearInterval(statePollTimer);
  }
  statePollTimer = window.setInterval(() => {
    void refreshHdmi();
  }, getPollIntervalMs());
}

async function startPiAgentFromHdmi() {
  const response = await fetch("/api/pi-agent/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cols: 100,
      rows: 30,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Failed to start PiAgent.");
  }
  await refreshHdmi();
}

async function sendPiAgentChatFromHdmi() {
  const text = String(chatComposerInput?.value || "").trim();
  if (!text) {
    return;
  }
  const response = await fetch("/api/pi-agent/input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      submit: true,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Failed to send PiAgent input.");
  }
  if (chatComposerInput) {
    chatComposerInput.value = "";
  }
  await refreshHdmi();
}

prevSlideBtn.addEventListener("click", () => {
  if (!generatedSlides.length) {
    return;
  }
  showSlide(currentSlideIndex - 1);
});

nextSlideBtn.addEventListener("click", () => {
  if (!generatedSlides.length) {
    return;
  }
  showSlide(currentSlideIndex + 1);
});

refreshSlidesBtn.addEventListener("click", async () => {
  try {
    lastGeneratedRevision = "";
    await refreshHdmi();
    if (currentMode === "slideshow") {
      showSlide(currentSlideIndex);
    }
  } catch (error) {
    hdmiMeta.textContent = error instanceof Error ? error.message : "Failed to refresh slideshow.";
  }
});

chatComposerStartBtn?.addEventListener("click", async () => {
  try {
    await startPiAgentFromHdmi();
  } catch (error) {
    hdmiMeta.textContent = error instanceof Error ? error.message : "Failed to start PiAgent.";
  }
});

chatComposerSendBtn?.addEventListener("click", async () => {
  try {
    await sendPiAgentChatFromHdmi();
  } catch (error) {
    hdmiMeta.textContent = error instanceof Error ? error.message : "Failed to send PiAgent input.";
  }
});

chatComposerInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }
  event.preventDefault();
  void sendPiAgentChatFromHdmi().catch((error) => {
    hdmiMeta.textContent = error instanceof Error ? error.message : "Failed to send PiAgent input.";
  });
});

window.addEventListener("keydown", (event) => {
  if (event.target === chatComposerInput) {
    return;
  }
  handleKeyboardChatWake(event);
});

window.addEventListener("load", async () => {
  try {
    await loadSettings();
    restartStatePolling();
    await refreshHdmi();
  } catch (error) {
    updateHeader(null, error instanceof Error ? error.message : "Failed to load touch display.");
  }
});

window.addEventListener("resize", () => {
  if (currentMode === "slideshow" && generatedSlides.length) {
    showSlide(currentSlideIndex);
    return;
  }
  if (currentMode === "mirror") {
    void refreshHdmi();
  }
});
