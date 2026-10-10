/* Chemistry English Lab — Kokoro local TTS add-on
 * Runs Kokoro-82M in the browser. Model/runtime are downloaded on first use;
 * speech synthesis itself is local and does not send the vocabulary text to a TTS API.
 */
(() => {
  "use strict";
  if (window.__chemistryReadAloudInstalled) return;
  window.__chemistryReadAloudInstalled = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
  const MODULE_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";
  let ttsEngine = null;
  let loadPromise = null;
  let currentAudio = null;
  let currentUrl = null;
  let activeCard = null;
  let requestId = 0;
  let lastText = "";
  let lastCard = null;

  const VOICES = [
    { id: "af_bella", label: "美音 · Bella（女声）" },
    { id: "af_heart", label: "美音 · Heart（女声）" },
    { id: "af_nicole", label: "美音 · Nicole（女声）" },
    { id: "af_sarah", label: "美音 · Sarah（女声）" },
    { id: "am_michael", label: "美音 · Michael（男声）" },
    { id: "am_fenrir", label: "美音 · Fenrir（男声）" },
    { id: "bf_emma", label: "英音 · Emma（女声）" },
    { id: "bf_isabella", label: "英音 · Isabella（女声）" },
    { id: "bf_alice", label: "英音 · Alice（女声）" },
    { id: "bm_george", label: "英音 · George（男声）" },
    { id: "bm_lewis", label: "英音 · Lewis（男声）" },
    { id: "bm_fable", label: "英音 · Fable（男声）" }
  ];

  function status(message, kind = "normal") {
    const el = $("#ttsStatus");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
  }

  function addControls() {
    const library = $("#library");
    if (library && !$("#ttsPanel")) {
      const panel = document.createElement("div");
      panel.id = "ttsPanel";
      panel.className = "tts-panel";
      panel.innerHTML = `
        <label>朗读语速
          <input id="ttsRate" type="range" min="0.70" max="1.25" step="0.05" value="0.95" aria-label="朗读语速">
          <span id="ttsRateValue">0.95×</span>
        </label>
        <label>发音人
          <select id="ttsVoice" aria-label="选择英语发音人">${VOICES.map(v => `<option value="${v.id}">${v.label}</option>`).join("")}</select>
        </label>
        <button type="button" id="ttsLoad">⬇ 初始化离线语音</button>
        <button type="button" id="ttsPause">⏸ 暂停</button>
        <button type="button" id="ttsResume">▶ 继续</button>
        <button type="button" id="ttsStop">■ 停止</button>
        <span id="ttsStatus" class="tts-note" role="status" aria-live="polite">Kokoro 本地语音：首次使用需联网下载约 100 MB 模型；准备好后在本机生成语音。</span>`;
      const layout = $(".layout", library);
      if (layout) library.insertBefore(panel, layout);
      $("#ttsRate", panel).addEventListener("input", e => {
        $("#ttsRateValue").textContent = `${Number(e.target.value).toFixed(2)}×`;
        if (currentAudio) currentAudio.playbackRate = Number(e.target.value);
      });
      $("#ttsLoad", panel).addEventListener("click", initializeModel);
      $("#ttsPause", panel).addEventListener("click", () => { if (currentAudio) currentAudio.pause(); });
      $("#ttsResume", panel).addEventListener("click", () => {
        if (currentAudio) currentAudio.play().catch(() => status("请再次点击继续播放。", "error"));
      });
      $("#ttsStop", panel).addEventListener("click", stopSpeaking);
    }

    $$(".word").forEach(card => {
      if ($(".tts-actions", card)) return;
      const actions = document.createElement("div");
      actions.className = "tts-actions";
      actions.innerHTML = `
        <button type="button" data-tts="term">🔊 朗读单词</button>
        <button type="button" data-tts="example">🔊 朗读例句</button>
        <button type="button" data-tts="all">▶ 单词＋例句</button>`;
      const example = $(".example", card);
      const existingActions = $(".actions", card);
      if (example) example.insertAdjacentElement("afterend", actions);
      else if (existingActions) card.insertBefore(actions, existingActions);
      else card.appendChild(actions);
    });

    const flashCard = $("#flashCard");
    if (flashCard && !$("#ttsFlashActions")) {
      const row = document.createElement("div");
      row.id = "ttsFlashActions";
      row.className = "toolbar";
      row.style.marginTop = "10px";
      row.innerHTML = `
        <button type="button" data-tts-flash="term">🔊 朗读当前单词</button>
        <button type="button" data-tts-flash="example">🔊 朗读例句</button>`;
      flashCard.insertAdjacentElement("afterend", row);
    }

    const question = $("#question");
    if (question && !$("#ttsQuizQuestion")) {
      const btn = document.createElement("button");
      btn.id = "ttsQuizQuestion";
      btn.type = "button";
      btn.textContent = "🔊 朗读题目";
      btn.style.margin = "0 0 12px";
      question.insertAdjacentElement("afterend", btn);
    }
  }

  async function initializeModel() {
    if (ttsEngine) {
      status("本地语音模型已就绪，可离线生成语音（浏览器仍需保留模型缓存）。", "ready");
      return ttsEngine;
    }
    if (loadPromise) return loadPromise;
    const loadButton = $("#ttsLoad");
    if (loadButton) { loadButton.disabled = true; loadButton.textContent = "模型加载中…"; }
    status("正在加载语音运行库并下载模型；首次加载需要等待，请保持网络连接…", "loading");
    loadPromise = (async () => {
      try {
        const module = await import(MODULE_URL);
        const KokoroTTS = module.KokoroTTS || module.default?.KokoroTTS;
        if (!KokoroTTS) throw new Error("没有找到 KokoroTTS 导出项");
        ttsEngine = await KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: "q8",
          device: "wasm",
          progress_callback: (p) => {
            if (!p) return;
            const name = p.file || p.name || p.status || "模型文件";
            const percent = Number.isFinite(p.progress) ? ` ${Math.round(p.progress)}%` : "";
            status(`正在下载/缓存：${name}${percent}。首次使用请稍候…`, "loading");
          }
        });
        status("本地语音模型已就绪。选择美音或英音后即可朗读。", "ready");
        return ttsEngine;
      } catch (error) {
        console.error("Kokoro TTS initialization failed", error);
        status("模型加载失败：请检查网络后重试。若设备内存不足，可改用系统自带语音。", "error");
        throw error;
      } finally {
        loadPromise = null;
        if (loadButton) { loadButton.disabled = false; loadButton.textContent = ttsEngine ? "✓ 语音模型已加载" : "↻ 重试加载语音"; }
      }
    })();
    return loadPromise;
  }

  function clearAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onended = currentAudio.onerror = null;
      currentAudio.src = "";
      currentAudio = null;
    }
    if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
    $$(".tts-speaking").forEach(el => el.classList.remove("tts-speaking"));
    activeCard = null;
  }

  function stopSpeaking() {
    requestId++;
    clearAudio();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    status(ttsEngine ? "已停止。" : "尚未加载模型；点击“初始化离线语音”开始。", "normal");
  }

  async function speakText(rawText, card = null) {
    const text = String(rawText || "").trim();
    if (!text) return;
    lastText = text;
    lastCard = card;
    const myRequest = ++requestId;
    clearAudio();
    activeCard = card;
    if (card) card.classList.add("tts-speaking");
    try {
      const engine = await initializeModel();
      if (myRequest !== requestId) return;
      status("正在本机生成语音…", "loading");
      const voice = $("#ttsVoice")?.value || "af_bella";
      const result = await engine.generate(text, { voice, speed: 1 });
      if (myRequest !== requestId) return;
      const blob = result.toBlob();
      currentUrl = URL.createObjectURL(blob);
      currentAudio = new Audio(currentUrl);
      currentAudio.playbackRate = Number($("#ttsRate")?.value || 0.95);
      currentAudio.onended = () => {
        if (myRequest === requestId) {
          clearAudio();
          status("朗读完成。语音由本地模型生成。", "ready");
        }
      };
      currentAudio.onerror = () => {
        if (myRequest === requestId) {
          clearAudio();
          status("音频播放失败，请重新点击朗读。", "error");
        }
      };
      await currentAudio.play();
      status(`正在朗读 · ${$("#ttsVoice")?.selectedOptions?.[0]?.textContent || voice}`, "ready");
    } catch (error) {
      if (myRequest !== requestId) return;
      console.error("Kokoro speech generation failed", error);
      if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
        clearAudio();
        const utterance = new SpeechSynthesisUtterance(text);
        const voiceId = $("#ttsVoice")?.value || "af_bella";
        utterance.lang = voiceId.startsWith("b") ? "en-GB" : "en-US";
        utterance.rate = Number($("#ttsRate")?.value || 0.95);
        utterance.onend = () => { if (card) card.classList.remove("tts-speaking"); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        status("本地模型不可用，临时使用设备系统语音（音色取决于设备）。", "error");
      }
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("button[data-tts]");
    if (button) {
      const card = button.closest(".word");
      if (!card) return;
      const term = $(".word h3", card)?.textContent || "";
      const example = $(".example", card)?.textContent || "";
      const action = button.dataset.tts;
      if (action === "term") speakText(term, card);
      if (action === "example") speakText(example, card);
      if (action === "all") speakText([term, example].filter(Boolean).join(". "), card);
      return;
    }
    const flashButton = event.target.closest("button[data-tts-flash]");
    if (flashButton) {
      const action = flashButton.dataset.ttsFlash;
      const term = $("#flashTerm")?.textContent || "";
      const example = $("#flashExample")?.textContent || "";
      if (action === "term") speakText(term, $("#flashCard"));
      if (action === "example") {
        if ($("#flashBack")?.classList.contains("hidden") || !example.trim()) {
          alert("请先点击闪卡翻面，再朗读例句。");
        } else speakText(example, $("#flashCard"));
      }
      return;
    }
    if (event.target.closest("#ttsQuizQuestion")) {
      const question = $("#question")?.textContent || "";
      speakText(question, $("#question"));
    }
  });

  const observer = new MutationObserver(() => addControls());
  function init() {
    addControls();
    const searchInput = $("#search");
    if (searchInput && !searchInput.dataset.ttsBound) {
      searchInput.dataset.ttsBound = "1";
      searchInput.addEventListener("input", () => requestAnimationFrame(addControls));
    }
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  function installRenderHook() {
    if (typeof window.renderWords === "function" && !window.renderWords.__ttsHooked) {
      const original = window.renderWords;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        Promise.resolve().then(addControls);
        return result;
      };
      wrapped.__ttsHooked = true;
      window.renderWords = wrapped;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { init(); installRenderHook(); }, { once: true });
  } else {
    init();
    installRenderHook();
  }
})();
