/* Kokoro TTS worker: keeps model loading and inference off the UI thread. */
"use strict";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODULE_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";
let engine = null;
let initPromise = null;
self.addEventListener("message", async event => {
  const msg = event.data || {};
  const { type, requestId } = msg;
  if (type === "init") {
    if (engine) { self.postMessage({ type: "ready", requestId }); return; }
    if (initPromise) {
      try { await initPromise; self.postMessage({ type: "ready", requestId }); }
      catch (error) { self.postMessage({ type: "error", requestId, message: error?.message || "模型初始化失败" }); }
      return;
    }
    initPromise = (async () => {
      self.postMessage({ type: "status", kind: "loading", message: "正在后台加载语音运行库…" });
      const module = await import(MODULE_URL);
      const KokoroTTS = module.KokoroTTS || module.default?.KokoroTTS;
      if (!KokoroTTS) throw new Error("没有找到 KokoroTTS 导出项");
      let device = "wasm";
      if (self.navigator?.gpu) {
        try { const adapter = await self.navigator.gpu.requestAdapter(); if (adapter) device = "webgpu"; } catch (_) {}
      }
      self.postMessage({ type: "status", kind: "loading", message: device === "webgpu" ? "正在后台初始化 GPU 语音模型，页面不会被锁住…" : "正在后台初始化语音模型（CPU 模式），页面不会被锁住…" });
      engine = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8", device,
        progress_callback: p => {
          if (!p) return;
          const name = p.file || p.name || p.status || "模型文件";
          const percent = Number.isFinite(p.progress) ? ` ${Math.round(p.progress)}%` : "";
          self.postMessage({ type: "status", kind: "loading", message: `正在下载/缓存：${name}${percent}…` });
        }
      });
      self.postMessage({ type: "status", kind: "ready", message: device === "webgpu" ? "语音模型已就绪（GPU 加速）。" : "语音模型已就绪（后台 CPU 模式）。" });
    })();
    try { await initPromise; self.postMessage({ type: "ready", requestId }); }
    catch (error) { engine = null; self.postMessage({ type: "error", requestId, message: error?.message || "模型初始化失败" }); }
    finally { initPromise = null; }
    return;
  }
  if (type === "generate") {
    try {
      if (!engine) throw new Error("语音模型尚未初始化");
      self.postMessage({ type: "status", kind: "loading", message: "正在后台生成语音，页面仍可操作…" });
      const result = await engine.generate(String(msg.text || ""), { voice: String(msg.voice || "af_bella"), speed: Number(msg.speed || 0.95) });
      self.postMessage({ type: "audio", requestId, blob: result.toBlob() });
    } catch (error) { self.postMessage({ type: "error", requestId, message: error?.message || "语音生成失败" }); }
  }
});
