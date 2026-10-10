/* Chemistry English Lab — Read Aloud Add-on
 * Uses the browser/device Web Speech API; no external service or API key.
 */
(() => {
  "use strict";
  if (window.__chemistryReadAloudInstalled) return;
  window.__chemistryReadAloudInstalled = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let voices = [];
  let activeCard = null;

  function addControls() {
    const library = $("#library");
    if (library && !$("#ttsPanel")) {
      const panel = document.createElement("div");
      panel.id = "ttsPanel";
      panel.className = "tts-panel";
      panel.innerHTML = `
        <label>朗读语速
          <input id="ttsRate" type="range" min="0.65" max="1.35" step="0.05" value="0.95" aria-label="朗读语速">
          <span id="ttsRateValue">0.95×</span>
        </label>
        <label>发音人
          <select id="ttsVoice" aria-label="选择发音人"><option value="auto">自动选择英语音色</option></select>
        </label>
        <button type="button" id="ttsPause">⏸ 暂停</button>
        <button type="button" id="ttsResume">▶ 继续</button>
        <button type="button" id="ttsStop">■ 停止</button>
        <span class="tts-note">使用设备自带语音；可用音色取决于浏览器和系统。</span>`;
      const layout = $(".layout", library);
      if (layout) library.insertBefore(panel, layout);
      $("#ttsRate", panel).addEventListener("input", e => {
        $("#ttsRateValue").textContent = `${Number(e.target.value).toFixed(2)}×`;
      });
      $("#ttsPause", panel).addEventListener("click", () => {
        if (window.speechSynthesis) window.speechSynthesis.pause();
      });
      $("#ttsResume", panel).addEventListener("click", () => {
        if (window.speechSynthesis) window.speechSynthesis.resume();
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
      btn.addEventListener("click", () => speakText(question.textContent || "", detectLanguage(question.textContent || "")));
    }
  }

  function getVoices() {
    if (!window.speechSynthesis) return;
    voices = window.speechSynthesis.getVoices() || [];
    const select = $("#ttsVoice");
    if (!select) return;
    const previous = select.value || "auto";
    select.innerHTML = '<option value="auto">自动选择英语音色</option>';
    voices.forEach((voice, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? " · 默认" : ""}`;
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    else {
      const preferred = voices.findIndex(v => /^en(-|_)/i.test(v.lang) && /US|GB|AU|CA/i.test(v.lang));
      if (preferred >= 0) select.value = String(preferred);
    }
  }

  function detectLanguage(text) {
    return /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en-US";
  }

  function chooseVoice(lang) {
    const select = $("#ttsVoice");
    if (select && select.value !== "auto" && voices[Number(select.value)]) {
      const chosen = voices[Number(select.value)];
      if (chosen.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) return chosen;
    }
    const langPrefix = lang.slice(0, 2).toLowerCase();
    return voices.find(v => v.lang.toLowerCase().startsWith(langPrefix) && /US|GB|AU|CA/i.test(v.lang))
      || voices.find(v => v.lang.toLowerCase().startsWith(langPrefix))
      || null;
  }

  function speakText(rawText, lang = "en-US", card = null) {
    const text = String(rawText || "").trim();
    if (!text) return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      alert("当前浏览器不支持网页朗读，请换用最新版 Chrome、Edge 或 Safari。");
      return;
    }
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = chooseVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.rate = Number($("#ttsRate")?.value || 0.95);
    utterance.pitch = 1;
    activeCard = card;
    if (card) card.classList.add("tts-speaking");
    utterance.onend = utterance.onerror = () => {
      if (card) card.classList.remove("tts-speaking");
      if (activeCard === card) activeCard = null;
    };
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    $$(".tts-speaking").forEach(el => el.classList.remove("tts-speaking"));
    activeCard = null;
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("button[data-tts]");
    if (button) {
      const card = button.closest(".word");
      if (!card) return;
      const term = $(".word h3", card)?.textContent || "";
      const example = $(".example", card)?.textContent || "";
      const action = button.dataset.tts;
      if (action === "term") speakText(term, "en-US", card);
      if (action === "example") speakText(example, "en-US", card);
      if (action === "all") speakText([term, example].filter(Boolean).join(". "), "en-US", card);
      return;
    }
    const flashButton = event.target.closest("button[data-tts-flash]");
    if (flashButton) {
      const action = flashButton.dataset.ttsFlash;
      const term = $("#flashTerm")?.textContent || "";
      const example = $("#flashExample")?.textContent || "";
      if (action === "term") speakText(term, "en-US", $("#flashCard"));
      if (action === "example") {
        if ($("#flashBack")?.classList.contains("hidden") || !example.trim()) {
          alert("请先点击闪卡翻面，再朗读例句。");
        } else {
          speakText(example, "en-US", $("#flashCard"));
        }
      }
    }
  });

  const observer = new MutationObserver(addControls);
  function init() {
    addControls();
    getVoices();
    if (window.speechSynthesis) window.speechSynthesis.addEventListener?.("voiceschanged", getVoices);
    // Watch the whole page: the vocabulary cards are rebuilt with innerHTML
    // whenever the user searches, filters, or changes chapters.
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }
  function installRenderHook() {
    // renderWords is a global function in the current standalone site.
    if (typeof window.renderWords === "function" && !window.renderWords.__ttsHooked) {
      const originalRenderWords = window.renderWords;
      const wrappedRenderWords = function (...args) {
        const result = originalRenderWords.apply(this, args);
        // Run after renderWords replaces #words.innerHTML.
        Promise.resolve().then(addControls);
        return result;
      };
      wrappedRenderWords.__ttsHooked = true;
      window.renderWords = wrappedRenderWords;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { init(); installRenderHook(); }, { once: true });
  } else {
    init();
    installRenderHook();
  }
})();