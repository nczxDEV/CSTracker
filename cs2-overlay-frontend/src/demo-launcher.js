(() => {
  let opening = false;
  window.openDemoStudio = async () => {
    if (opening) return;
    opening = true;
    const status = document.getElementById("demo-window-status");
    try {
      if (!window.__TAURI__?.core?.invoke) throw new Error("Open the desktop app to use Demo Studio.");
      await window.__TAURI__.core.invoke("open_demo_analyzer");
      status.textContent = "Demo Studio is open in its own window.";
    } catch (error) { status.textContent = String(error); }
    finally { opening = false; }
  };
  document.getElementById("open-demo-studio")?.addEventListener("click", window.openDemoStudio);
})();
